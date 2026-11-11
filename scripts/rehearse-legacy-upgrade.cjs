const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const bcrypt=require('../backend/node_modules/bcryptjs');
const {root,output,ident,createLocalDatabase,writeLocal,fingerprint,securitySnapshot}=require('./stage3-helpers.cjs');
const {applyMigration}=require('./release-migration-executor.cjs');
const hex=()=>crypto.randomBytes(32).toString('hex');

async function main(){
  assert.equal(process.argv.length,2);
  const database='bovitrack_stage3_legacy_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex');
  const c=await createLocalDatabase(database);
  const login='stage3_legacy_'+crypto.randomBytes(3).toString('hex'),authLogin='stage3_auth_'+crypto.randomBytes(3).toString('hex');
  const password=hex(),key=hex();
  const env={...process.env,NODE_ENV:'test',VERCEL:'',DB_SSL:'disable',DB_SSL_CA_PATH:'',DB_SSL_CA_BASE64:'',
    DATABASE_URL:'postgresql://'+login+'@127.0.0.1:55441/'+database,DATABASE_AUTH_URL:'postgresql://'+authLogin+'@127.0.0.1:55441/'+database,
    DB_RLS_CONTEXT_KEY:key,JWT_SECRET:hex(),EMAIL_VERIFICATION_PEPPER:hex(),TEST_ADMIN_SENHA:password,
    RESEND_API_KEY:'re_mock_stage3_no_network',EMAIL_FROM:'BoviTrack <onboarding@resend.dev>',EMAIL_VERIFICATION_REQUIRED:'true',
    FRONTEND_URL:'http://127.0.0.1:5176,http://127.0.0.1:5177',COOKIE_SECURE:'false',COOKIE_SAME_SITE:'lax',CSRF_ALLOW_NO_ORIGIN:'true',
    JWT_ISSUER:'bovitrack-api',JWT_AUDIENCE:'bovitrack-web',JWT_ACCESS_EXPIRES_IN:'15m',JWT_REFRESH_EXPIRES_IN:'7d',APP_TIMEZONE:'America/Sao_Paulo'};
  const result={database,postgres:'17.6',legacyCommit:'d22d106889debe59cad67f344efbe94810c7912a',emailCommit:'91a07aadab54a42ccce82966ed1368e2847e0a88',migrations:[],cases:[],completed:false};
  async function probe(variant,name,{browser=false,failure=false}={}){
    await writeLocal(c,database,'DELETE FROM limites_requisicao');
    const r=spawnSync(process.execPath,[path.join(root,'scripts/stage3-runtime-probe.cjs'),variant],{cwd:root,
      env:{...env,BOVITRACK_PROBE_CASE:name,BOVITRACK_PROBE_BROWSER:String(browser),BOVITRACK_EXPECT_LOGIN_FAILURE:String(failure)},encoding:'utf8',timeout:120000});
    fs.writeFileSync(path.join(output,'probe-'+name+'.log'),r.stdout+'\n'+r.stderr);
    assert.equal(r.status,0,'Probe falhou: '+name);
    result.cases.push(JSON.parse(fs.readFileSync(path.join(output,'probe-'+name+'.json'),'utf8')));
    console.log('OK compatibilidade '+name);
  }
  async function migration(name){
    result.migrations.push(await applyMigration(c,name,()=>require('./stage3-helpers.cjs').attestLocal(c,database)));
  }
  try{
    const historic=path.join(output,'revisions/legacy/backend/database');
    for(const file of['supabase/001_schema_bovitrack.sql','supabase/003_sessoes_refresh.sql','migrations/007_criar_producoes_leiteiras.sql','migrations/008_criar_pesagens_desmamas.sql','migrations/009_seguranca_sessoes_rate_limit.sql','migrations/010_hardening_supabase_runtime.sql'])
      await writeLocal(c,database,fs.readFileSync(path.join(historic,file),'utf8'));
    await writeLocal(c,database,'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO bovitrack_runtime;CREATE ROLE '+ident(login)+' LOGIN IN ROLE bovitrack_runtime;CREATE ROLE '+ident(authLogin)+' LOGIN');
    await writeLocal(c,database,'CREATE SCHEMA bovitrack_release;CREATE TABLE bovitrack_release.migrations(name text PRIMARY KEY,sha256 text NOT NULL)');
    const hash=await bcrypt.hash(password,12);
    const ids=[];
    for(const [email,perfil]of[['stage3-admin@example.com','admin'],['stage3-verified@example.com','usuario'],['stage3-pending@example.com','usuario']])
      ids.push((await writeLocal(c,database,"INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Fixture legada',$1,$2,$3) RETURNING id",[email,hash,perfil])).rows[0].id);
    for(const uid of ids.slice(1)){
      const p=(await writeLocal(c,database,"INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ('Legado','Teste','SP',10,$1) RETURNING id",[uid])).rows[0].id;
      const mom=(await writeLocal(c,database,"INSERT INTO animais(nome,especie,sexo,propriedade_id) VALUES ('Mae legada','Bovino','F',$1) RETURNING id",[p])).rows[0].id;
      const calf=(await writeLocal(c,database,"INSERT INTO animais(nome,especie,sexo,propriedade_id,mae_id) VALUES ('Bezerro legado','Bovino','M',$1,$2) RETURNING id",[p,mom])).rows[0].id;
      const l=(await writeLocal(c,database,"INSERT INTO lotes(nome,propriedade_id) VALUES ('Lote legado',$1) RETURNING id",[p])).rows[0].id;
      const v=(await writeLocal(c,database,"INSERT INTO vacinas(nome,usuario_id) VALUES ('Vacina legada',$1) RETURNING id",[uid])).rows[0].id;
      await writeLocal(c,database,'INSERT INTO animais_lotes VALUES ($1,$2)',[calf,l]);
      await writeLocal(c,database,'INSERT INTO vacinacoes(animal_id,vacina_id,data_aplicacao) VALUES ($1,$2,current_date)',[calf,v]);
      await writeLocal(c,database,"INSERT INTO despesas(descricao,categoria,valor,data,propriedade_id) VALUES ('Despesa legada','Outros',10,current_date,$1)",[p]);
      await writeLocal(c,database,"INSERT INTO receitas(descricao,categoria,valor,data,propriedade_id) VALUES ('Receita legada','OUTROS',20,current_date,$1)",[p]);
      await writeLocal(c,database,"INSERT INTO producoes_leiteiras(animal_id,data,turno,quantidade_litros) VALUES ($1,current_date,'manha',10)",[mom]);
      const weight=(await writeLocal(c,database,"INSERT INTO pesagens(animal_id,data_pesagem,peso_kg,tipo_pesagem,lote_id,registrado_por) VALUES ($1,current_date,100,'DESMAMA',$2,$3) RETURNING id",[calf,l,uid])).rows[0].id;
      await writeLocal(c,database,"INSERT INTO desmamas(animal_id,mae_id,data_planejada,tipo_desmama,status,peso_desmama_id,lote_destino_id,registrado_por) VALUES ($1,$2,current_date,'CONVENCIONAL','PLANEJADA',$3,$4,$5)",[calf,mom,weight,l,uid]);
    }
    await probe('legacy','legacy-baseline',{browser:true});
    const oldSessions=[];
    for(const [i,uid]of ids.entries())oldSessions.push((await writeLocal(c,database,"INSERT INTO sessoes_refresh(usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at) VALUES ($1,$2,$3,$4,now()+$5::interval,now()) RETURNING id",[uid,hex(),hex(),hex(),i===2?'-1 hour':'1 hour'])).rows[0].id);
    const before=await fingerprint(c);fs.writeFileSync(path.join(output,'legacy-before.json'),JSON.stringify(before,null,2));
    assert.equal(before.length,15);
    await migration('012_integridade_parentesco_indices.sql');
    const after012=await fingerprint(c);
    // Login probes criam sessoes/limites; comparar todas as tabelas de negocio.
    const business=rows=>rows.filter(r=>!['public.sessoes_refresh','public.sessoes_refresh_usados','public.limites_requisicao','public.usuarios','public.verificacoes_email','bovitrack_seg.chaves_contexto','bovitrack_seg.configuracao_email'].includes(r.table));
    assert.deepEqual(business(after012),business(before));
    await writeLocal(c,database,fs.readFileSync(path.join(root,'backend/database/migrations/012_integridade_parentesco_indices.sql'),'utf8'));
    assert.deepEqual(business(await fingerprint(c)),business(before));
    await migration('013_verificacao_email.sql');
    assert.equal((await c.query('SELECT count(*)::int AS n FROM usuarios WHERE email_verificado')).rows[0].n,0);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM sessoes_refresh WHERE id=ANY($1) AND revoked_at IS NOT NULL',[oldSessions])).rows[0].n,3);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM sessoes_refresh WHERE id=ANY($1)',[oldSessions])).rows[0].n,3);
    result.originalSessionEffects={originalSessions:3,revoked:3,accountsRemoved:0};
    await writeLocal(c,database,'UPDATE usuarios SET email_verificado=true,email_verificado_em=now() WHERE id=ANY($1)',[[ids[0],ids[1]]]);
    await writeLocal(c,database,fs.readFileSync(path.join(root,'backend/database/migrations/013_verificacao_email.sql'),'utf8'));
    for(const file of['014_rls_contexto.sql','015_rls_autenticacao.sql','016_rls_verificacao_email.sql','017_rls_integridade.sql','018_rls_politicas.sql'])await migration(file);
    await migration('021_email_verificacao_configuravel.sql');
    assert.equal((await c.query('SELECT obrigatoria FROM bovitrack_seg.configuracao_email WHERE singleton')).rows[0].obrigatoria,true);
    await writeLocal(c,database,'GRANT bovitrack_auth_runtime TO '+ident(authLogin));
    await writeLocal(c,database,"INSERT INTO bovitrack_seg.chaves_contexto VALUES (decode($1,'hex'))",[key]);
    await probe('legacy','legacy-prepared');
    await probe('candidate','candidate-prepared',{browser:true});
    await migration('019_rls_ativacao.sql');
    const active=await securitySnapshot(c);
    await probe('candidate','candidate-active',{browser:true});
    await probe('legacy','legacy-with-rls',{failure:true});
    await writeLocal(c,database,fs.readFileSync(path.join(root,'backend/database/rollback/019_rls_rollback_dev.sql'),'utf8'));
    await probe('email','email-rollback');
    await probe('legacy','legacy-rollback');
    await probe('candidate','candidate-rollback');
    await writeLocal(c,database,fs.readFileSync(path.join(root,'backend/database/migrations/019_rls_ativacao.sql'),'utf8'));
    assert.deepEqual(await securitySnapshot(c),active);
    assert.deepEqual(business(await fingerprint(c)),business(before));
    assert.equal((await c.query('SELECT count(*)::int AS n FROM usuarios WHERE id=ANY($1)',[ids])).rows[0].n,3);
    result.sessionsAfterLegacyCleanup=(await c.query('SELECT count(*)::int AS n FROM sessoes_refresh WHERE id=ANY($1)',[oldSessions])).rows[0].n;
    fs.writeFileSync(path.join(output,'legacy-after.json'),JSON.stringify(await fingerprint(c),null,2));
    result.businessPreserved=true;result.completed=true;
    console.log('OK upgrade legado PG17.6: dados preservados, 012/013 reaplicadas, 014-019 versionadas, matriz e binarios de rollback validados');
  }finally{await c.end();fs.writeFileSync(path.join(output,'legacy-upgrade-results.json'),JSON.stringify(result,null,2));}
}
main().catch(e=>{console.error('Ensaio legado interrompido:',e.code||e.name,e.message.startsWith('Probe falhou:')?e.message:'');console.error(e.stack?.split('\n').filter(x=>/^\s+at /.test(x)).slice(0,2).join('\n'));process.exitCode=1;});
