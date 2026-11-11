// Padrao: somente homologacao sintetica. Modo futuro de producao exige aprovacao
// por SHA, marcador SQL, manutencao e pasta privada explicitamente autorizada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('../backend/node_modules/pg');
const { carregar, configuracaoAdmin, confirmarDestino } = require('./prepare-supabase-homologacao.cjs');
const { validarUrl, inspecionar } = require('./check-supabase-homologacao.cjs');
const { output, pgBin, ident, createLocalDatabase, writeLocal, fingerprint, securitySnapshot, postgresEnv } = require('./stage3-helpers.cjs');

async function main() {
  const production = process.argv[2] === '--production-approved';
  assert.equal(process.argv.length, production ? 3 : 2);
  let alvo, env, url, config, directory = output, releaseSha;
  if (production) {
    env = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(__dirname,'../backend/.env.release-production')));
    url = require('./release-production.cjs').validateConfig(env, '--prepare');
    releaseSha = env.BOVITRACK_RELEASE_SHA;
    require('./release-production.cjs').assertReleaseCheckout(releaseSha);
    assert.equal(env.BOVITRACK_AUTHORIZE_PRIVATE_DATA_RESTORE, 'export-and-restore:'+releaseSha);
    directory = env.BOVITRACK_RELEASE_PRIVATE_BACKUP_DIR;
    assert.ok(directory && path.isAbsolute(directory) && fs.statSync(directory).isDirectory());
    const relative=path.relative(fs.realpathSync(path.join(__dirname,'..')),fs.realpathSync(directory));
    assert.ok(relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Backup privado exige pasta fora do checkout');
    const response = await fetch('https://bovitrack-api.vercel.app/auth/login',{signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,503);assert.equal((await response.json()).codigo,'MANUTENCAO');
    config = require('../backend/database/config').criarConfiguracaoPorUrl(url.href,{sslMode:'verify-full',sslCaPath:env.DB_SSL_CA_PATH,producao:true});
    alvo = {projectRef:'znpmzebrryqtjkgnvlcw',database:'postgres'};
  } else {
    ({alvo,env} = carregar());
    await inspecionar(env.BOVITRACK_HOMOLOG_ADMIN_URL, 'admin', alvo, env);
    url = validarUrl(env.BOVITRACK_HOMOLOG_ADMIN_URL, 'admin', alvo);
    config = configuracaoAdmin(env);
  }
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  const remote = new Client({...config,connectionTimeoutMillis:10000,query_timeout:30000});
  const id = Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  const database = 'bovitrack_stage3_restore_' + id;
  const file = path.join(directory, (production?'production-':'homologacao-') + id + '.dump');
  const result = { projectRef: alvo.projectRef, database, applicationSchemas: ['public','bovitrack_seg'], completed: false };
  const start = performance.now();
  let restored;
  try {
    await remote.connect();
    if(production){
      assert.equal(remote.connection.stream.authorized,true);
      const row=(await remote.query("SELECT current_database() AS db,current_user AS role,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
      assert.equal(row.db,'postgres');assert.equal(row.role,'postgres');assert.ok(row.version>=170000&&row.version<180000);
      assert.equal(row.marker,'bovitrack-release:'+alvo.projectRef+':'+releaseSha);
      assert.equal((await remote.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='bovitrack_app_login'")).rows[0]?.rolcanlogin,false,'Escritor legado ainda habilitado');
      assert.equal((await remote.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='bovitrack_app_login'")).rows[0].n,0);
    }else await confirmarDestino(remote, alvo);
    await remote.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // O projeto foi criado vazio nesta conversa. Recusar dados fora das fixtures.
    if(!production)assert.equal((await remote.query("SELECT count(*)::int AS n FROM public.usuarios WHERE email !~ '^homolog-[a-z0-9-]+@example[.]com$'")).rows[0].n, 0);
    const source = await fingerprint(remote);
    const sourceSecurity = await securitySnapshot(remote);
    const roles = (await remote.query(`SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
      FROM pg_roles WHERE rolname LIKE 'bovitrack_%' ORDER BY rolname`)).rows;
    assert.ok(roles.every(r => !r.rolsuper && !r.rolbypassrls && !r.rolcreatedb && !r.rolcreaterole && !r.rolreplication));
    const memberships = (await remote.query(`SELECT p.rolname AS parent,m.rolname AS member
      FROM pg_auth_members a JOIN pg_roles p ON p.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
      WHERE p.rolname LIKE 'bovitrack_%' AND (m.rolname LIKE 'bovitrack_%' OR m.rolname='postgres') ORDER BY p.rolname,m.rolname`)).rows;
    const snapshot = (await remote.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const dumpEnv = postgresEnv(process.env, { PGHOST: url.hostname, PGPORT: url.port, PGDATABASE: alvo.database,
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: env.DB_SSL_CA_PATH,
      PGOPTIONS: '-c default_transaction_read_only=on', PGAPPNAME: 'bovitrack-stage3-backup' });
    const schemas=(await remote.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('public','bovitrack_seg','bovitrack_release') ORDER BY nspname")).rows.map(r=>r.nspname);
    const dump = spawnSync(path.join(pgBin,'pg_dump.exe'), ['--format=custom',...schemas.map(s=>'--schema='+s),
      '--no-publications','--no-subscriptions','--snapshot='+snapshot,'--file='+file], { env: dumpEnv, encoding:'utf8', timeout:120000 });
    fs.writeFileSync(path.join(directory,'backup-pg-dump.log'), dump.stderr || '');
    assert.equal(dump.status, 0, 'pg_dump falhou');
    await remote.query('COMMIT');
    result.backupMs = performance.now()-start;
    result.bytes = fs.statSync(file).size;
    result.sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const listing = spawnSync(path.join(pgBin,'pg_restore.exe'), ['--list',file], { encoding:'utf8' });
    assert.equal(listing.status,0); assert.match(listing.stdout,/TABLE DATA public usuarios/);
    fs.writeFileSync(path.join(directory,'backup-toc.txt'),listing.stdout);
    restored = await createLocalDatabase(database);
    // As roles gerenciadas sao placeholders NOLOGIN, sem segredos de plataforma.
    // A superficie restaurada e a aplicacao, nao Auth/Storage/Realtime do Supabase.
    for (const role of ['anon','authenticated','service_role','supabase_admin',...roles.map(r=>r.rolname)]) {
      const exists = (await restored.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount;
      if (!exists) {
        const r=roles.find(r=>r.rolname===role);
        await writeLocal(restored,database,'CREATE ROLE '+ident(role)+' '+(r?.rolcanlogin?'LOGIN':'NOLOGIN')+' '+(r?.rolinherit?'INHERIT':'NOINHERIT')+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
      }
    }
    for (const m of memberships) await writeLocal(restored,database,'GRANT '+ident(m.parent)+' TO '+ident(m.member));
    await writeLocal(restored,database,'CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions');
    if(roles.some(r=>r.rolname==='bovitrack_rls_identidade'))await writeLocal(restored,database,'GRANT USAGE ON SCHEMA extensions TO bovitrack_rls_identidade; GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO bovitrack_rls_identidade');
    await require('./stage3-helpers.cjs').attestLocal(restored,database);
    const restoreStart=performance.now();
    const restore = spawnSync(path.join(pgBin,'pg_restore.exe'),['--exit-on-error','--clean','--if-exists','--host=127.0.0.1','--port=55441','--username=postgres','--dbname='+database,file],
      { env:postgresEnv(process.env,{ PGSSLMODE:'disable',PGOPTIONS:'',PGPASSWORD:'' }),encoding:'utf8',timeout:120000 });
    fs.writeFileSync(path.join(directory,'backup-pg-restore.log'),restore.stderr||'');
    assert.equal(restore.status,0,'pg_restore falhou');
    result.restoreMs=performance.now()-restoreStart;
    assert.deepEqual(await fingerprint(restored),source,'Dados restaurados diferentes do snapshot exportado');
    assert.deepEqual(await securitySnapshot(restored),sourceSecurity,'ACLs/policies diferentes');
    // Constraints validadas e integridade dos pais/filhos apos restauracao.
    assert.equal((await restored.query("SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")).rows[0].n,0);
    const roleCheck=(await restored.query("SELECT rolname,rolbypassrls,rolsuper FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[roles.map(r=>r.rolname)])).rows;
    assert.ok(roleCheck.every(r=>!r.rolbypassrls&&!r.rolsuper));
    result.tables=source; result.roles=roles; result.memberships=memberships;
    result.extensionDependencies=[{name:'pgcrypto',schema:'extensions',usageRole:'bovitrack_rls_identidade',executeFunction:'hmac(bytea,bytea,text)'}];
    result.applicationSchemas=schemas;result.completed=true;
    if(production)Object.assign(result,{sourceSha:releaseSha,verifiedRestore:true,finishedAt:new Date().toISOString(),archive:file});
    console.log(JSON.stringify({completed:true,database,tables:source.length,bytes:result.bytes,sha256:result.sha256,backupMs:result.backupMs,restoreMs:result.restoreMs}));
  } finally {
    await Promise.allSettled([remote.end(),restored?.end()]);
    fs.writeFileSync(path.join(directory,'backup-restore-results.json'),JSON.stringify(result,null,2));
  }
}
main().catch(e=>{console.error('Backup/restore interrompido:',e.code||e.name,e.message==='pg_restore falhou'?'pg_restore':'');process.exitCode=1;});
