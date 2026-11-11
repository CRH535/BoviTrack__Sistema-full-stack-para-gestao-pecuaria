const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {carregar}=require('./prepare-supabase-homologacao.cjs');
const {root,output,localName,localClient}=require('./stage3-helpers.cjs');
async function main(){
  assert.equal(process.argv.length,2);
  const result=JSON.parse(fs.readFileSync(path.join(output,'backup-restore-results.json'),'utf8'));
  assert.equal(result.completed,true);assert.match(result.database,localName);
  const fixture=await localClient(result.database);
  const {env}=carregar();
  Object.assign(process.env,env,{NODE_ENV:'test',VERCEL:'',DB_SSL:'disable',DB_SSL_CA_PATH:'',DB_SSL_CA_BASE64:'',
    DATABASE_URL:'postgresql://bovitrack_homolog_dominio@127.0.0.1:55441/'+result.database,
    DATABASE_AUTH_URL:'postgresql://bovitrack_homolog_auth@127.0.0.1:55441/'+result.database});
  const security=spawnSync(process.execPath,['scripts/check-security-readonly.js'],{cwd:path.join(root,'backend'),env:process.env,encoding:'utf8',timeout:30000});
  fs.writeFileSync(path.join(output,'restored-security.log'),security.stdout+'\n'+security.stderr);
  if(security.status!==0){await fixture.end();throw new Error('Restored security preflight failed');}
  require('../backend/services/emailService').enviarVerificacao=async()=>{};
  const app=require('../backend/app').app;
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  let completed=false;
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'homolog-admin@example.com',senha:env.TEST_ADMIN_SENHA})});
    assert.equal(login.status,200);const data=await login.json();
    const dashboard=await fetch(base+'/dashboard',{headers:{Authorization:'Bearer '+data.token}});assert.equal(dashboard.status,200);
    const summary=(await dashboard.json()).resumo;
    assert.equal(summary.animais,(await fixture.query('SELECT count(*)::int AS n FROM animais')).rows[0].n);
    assert.equal(summary.propriedades,(await fixture.query('SELECT count(*)::int AS n FROM propriedades')).rows[0].n);
    completed=true;
    console.log('OK restore: logins restritos, contexto assinado, login HTTP e dashboard conferido no banco restaurado');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await Promise.allSettled([fixture.end(),require('../backend/database/pool').end(),require('../backend/database/poolAutenticacao').obterPoolAutenticacao().end()]);
    fs.writeFileSync(path.join(output,'restored-runtime-results.json'),JSON.stringify({completed,database:result.database,checks:['grants','RLS','signed-context','HTTP-login','dashboard-counts']},null,2));
  }
}
main().catch(e=>{console.error('Restore runtime interrompido:',e.code||e.name);console.error(e.stack?.split('\n').filter(x=>/^\s+at /.test(x)).slice(0,2).join('\n'));process.exitCode=1;});
