// Ferramenta FUTURA, fechada por padrao. Nenhuma acao de producao foi executada
// na etapa 3. Modos de escrita exigem autorizacao por SHA, backup restaurado,
// marcador SQL provisionado pelo operador e deployment de manutencao ativo.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const dotenv=require('../backend/node_modules/dotenv');
const {Client}=require('../backend/node_modules/pg');
const {criarConfiguracaoPorUrl}=require('../backend/database/config');
const {files,applyMigration}=require('./release-migration-executor.cjs');
const REF='znpmzebrryqtjkgnvlcw';
const root=path.resolve(__dirname,'..');
function assertReleaseCheckout(sha){
  const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  assert.equal(git.status,0);assert.equal(git.stdout.trim(),sha);
  const state=spawnSync('git',['status','--porcelain','--untracked-files=all','--','backend','scripts','release'],{cwd:root,encoding:'utf8'});
  assert.equal(state.status,0);assert.equal(state.stdout.trim(),'','Codigo de release nao commitado');
}
function validateConfig(env,mode){
  assert.ok(['--check','--freeze-legacy','--prepare','--provision','--activate','--rollback-rls'].includes(mode));
  const url=new URL(env.BOVITRACK_RELEASE_ADMIN_URL);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(!url.search&&!url.hash);
  assert.equal(url.pathname,'/postgres');assert.equal(url.port,'5432');assert.ok(url.password);
  if(url.hostname==='db.'+REF+'.supabase.co')assert.equal(decodeURIComponent(url.username),'postgres');
  else{
    assert.match(env.BOVITRACK_RELEASE_POOLER_HOST||'',/^aws-\d+-sa-east-1\.pooler\.supabase\.com$/);
    assert.equal(url.hostname,env.BOVITRACK_RELEASE_POOLER_HOST);assert.equal(decodeURIComponent(url.username),'postgres.'+REF);
  }
  assert.equal(env.DB_SSL,'verify-full');assert.match(env.BOVITRACK_RELEASE_SHA||'',/^[a-f0-9]{40}$/);
  if(mode!=='--check')assert.equal(env.BOVITRACK_PRODUCTION_APPROVAL,'approve:'+REF+':'+env.BOVITRACK_RELEASE_SHA);
  return url;
}
async function main(){
  const mode=process.argv[2]||'--check';assert.ok(process.argv.length<=3);
  const env=dotenv.parse(fs.readFileSync(path.join(root,'backend/.env.release-production')));
  validateConfig(env,mode);assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  assertReleaseCheckout(env.BOVITRACK_RELEASE_SHA);
  const c=new Client({...criarConfiguracaoPorUrl(env.BOVITRACK_RELEASE_ADMIN_URL,{sslMode:'verify-full',sslCaPath:env.DB_SSL_CA_PATH,producao:true}),connectionTimeoutMillis:10000,query_timeout:30000});
  const marker='bovitrack-release:'+REF+':'+env.BOVITRACK_RELEASE_SHA;
  const guard=async()=>{
    const r=(await c.query("SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
    assert.equal(r.database,'postgres');assert.equal(r.role,'postgres');assert.ok(r.version>=170000&&r.version<180000);assert.equal(r.marker,marker);
  };
  try{
    await c.connect();assert.equal(c.connection.stream.encrypted,true);assert.equal(c.connection.stream.authorized,true);
    if(mode==='--check'){
      await c.query('BEGIN READ ONLY');
      const r=(await c.query("SELECT current_database() AS database,current_user AS role,current_setting('server_version') AS version,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity) AS protected_tables")).rows[0];
      await c.query('COMMIT');console.log(JSON.stringify({ref:REF,...r,written:false}));return;
    }
    await guard();
    const response=await fetch('https://bovitrack-api.vercel.app/auth/login',{signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,503);assert.equal((await response.json()).codigo,'MANUTENCAO');
    if(mode==='--freeze-legacy'){
      const legacy=(await c.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname='bovitrack_app_login'")).rows[0];
      assert.ok(legacy&&!legacy.rolsuper&&!legacy.rolbypassrls&&!legacy.rolcreaterole&&!legacy.rolcreatedb);
      await c.query('BEGIN');await guard();await c.query('ALTER ROLE bovitrack_app_login NOLOGIN');await c.query('COMMIT');
      await c.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='bovitrack_app_login' AND pid<>pg_backend_pid()");
      assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='bovitrack_app_login'")).rows[0].n,0);
      console.log('OK login legado bloqueado e conexoes encerradas; nenhum dado de negocio alterado');return;
    }
    const backup=JSON.parse(fs.readFileSync(env.BOVITRACK_RELEASE_BACKUP_MANIFEST,'utf8'));
    assert.equal(backup.projectRef,REF);assert.equal(backup.verifiedRestore,true);assert.equal(backup.sourceSha,env.BOVITRACK_RELEASE_SHA);
    assert.ok(Date.parse(backup.finishedAt)>=Date.parse(env.BOVITRACK_RELEASE_MAINTENANCE_STARTED_AT));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(backup.archive)).digest('hex'),backup.sha256);
    if(mode==='--prepare'){
      const ledger=(await c.query("SELECT to_regclass('bovitrack_release.migrations') AS name")).rows[0].name;
      if(!ledger){
        assert.equal((await c.query("SELECT to_regnamespace('bovitrack_seg') IS NULL AS absent")).rows[0].absent,true,'Schema preparado sem ledger: reconciliar manualmente');
        await guard();await c.query('CREATE SCHEMA bovitrack_release;REVOKE ALL ON SCHEMA bovitrack_release FROM PUBLIC;CREATE TABLE bovitrack_release.migrations(name text PRIMARY KEY,sha256 text NOT NULL)');
      }
      for(const file of files.slice(0,-1)){await applyMigration(c,file,guard);console.log('OK migration '+file);}
    }else if(mode==='--provision'){
      assert.match(env.DB_RLS_CONTEXT_KEY||'',/^[a-f0-9]{64}$/);assert.ok((env.BOVITRACK_AUTH_LOGIN_PASSWORD||'').length>=32);assert.ok((env.BOVITRACK_DOMAIN_LOGIN_PASSWORD||'').length>=32);
      await c.query('BEGIN');await guard();
      assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='bovitrack_app_auth_login'")).rows[0].n,0,'Nao rotacionar login existente automaticamente');
      assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='bovitrack_app_rls_login'")).rows[0].n,0,'Nao rotacionar login existente automaticamente');
      assert.equal((await c.query('SELECT count(*)::int AS n FROM bovitrack_seg.chaves_contexto')).rows[0].n,0,'Nao sobrescrever chave existente');
      await c.query("CREATE FUNCTION pg_temp.provisionar_login(text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',$1,$2);END $$");
      await c.query('SELECT pg_temp.provisionar_login($1,$2)',['bovitrack_app_auth_login',env.BOVITRACK_AUTH_LOGIN_PASSWORD]);
      await c.query('SELECT pg_temp.provisionar_login($1,$2)',['bovitrack_app_rls_login',env.BOVITRACK_DOMAIN_LOGIN_PASSWORD]);
      await c.query('GRANT bovitrack_auth_runtime TO bovitrack_app_auth_login');
      await c.query('GRANT bovitrack_runtime TO bovitrack_app_rls_login');
      await c.query("INSERT INTO bovitrack_seg.chaves_contexto VALUES (decode($1,'hex'))",[env.DB_RLS_CONTEXT_KEY]);await c.query('COMMIT');
      console.log('OK provisionamento; segredos nao exibidos');
    }else if(mode==='--activate'){
      assert.equal((await c.query('SELECT count(DISTINCT tablename)::int AS n FROM pg_policies WHERE schemaname=\'public\'')).rows[0].n,16);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM bovitrack_seg.chaves_contexto WHERE chave=decode($1,'hex')",[env.DB_RLS_CONTEXT_KEY])).rows[0].n,1);
      for(const file of files.slice(0,-1)){
        const expected=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'backend/database/migrations',file))).digest('hex');
        const recorded=(await c.query('SELECT sha256 FROM bovitrack_release.migrations WHERE name=$1',[file])).rows[0];
        assert.equal(recorded?.sha256,expected,'Dependencia sem registro correspondente');
      }
      await applyMigration(c,files.at(-1),guard,{reactivate:true});console.log('OK 019 ativada');
    }else{
      await guard();await c.query(fs.readFileSync(path.join(root,'backend/database/rollback/019_rls_rollback_dev.sql'),'utf8'));console.log('OK rollback RLS; dados e schema preservados');
    }
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
}
if(require.main===module)main().catch(e=>{console.error('Release recusado:',e.code||e.name,'Consulte runbook, aprovacao, destino, TLS, backup e manutencao.');process.exitCode=1;});
module.exports={validateConfig,assertReleaseCheckout};
