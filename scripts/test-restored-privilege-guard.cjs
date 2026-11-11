const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {carregar}=require('./prepare-supabase-homologacao.cjs');
const {root,output,localClient,writeLocal}=require('./stage3-helpers.cjs');
(async()=>{
  const restored=JSON.parse(fs.readFileSync(path.join(output,'backup-restore-results.json'),'utf8'));
  assert.equal(restored.completed,true);const database=restored.database,c=await localClient(database);
  const {env}=carregar();
  const probeEnv={...process.env,...env,NODE_ENV:'test',DB_SSL:'disable',DB_SSL_CA_PATH:'',DB_SSL_CA_BASE64:'',
    DATABASE_URL:'postgresql://bovitrack_homolog_dominio@127.0.0.1:55441/'+database,
    DATABASE_AUTH_URL:'postgresql://bovitrack_homolog_auth@127.0.0.1:55441/'+database};
  const probe=()=>spawnSync(process.execPath,['scripts/check-security-readonly.js'],{cwd:path.join(root,'backend'),env:probeEnv,encoding:'utf8',timeout:30000});
  let granted=false;
  try{
    assert.equal(probe().status,0);
    assert.equal((await c.query("SELECT has_column_privilege('bovitrack_homolog_dominio','public.usuarios','perfil','UPDATE') AS yes")).rows[0].yes,false);
    await writeLocal(c,database,'GRANT UPDATE(perfil) ON public.usuarios TO bovitrack_homolog_dominio');granted=true;
    const rejected=probe();assert.equal(rejected.status,1);assert.match(rejected.stderr,/ERR_ASSERTION/);
  }finally{
    if(granted)await writeLocal(c,database,'REVOKE UPDATE(perfil) ON public.usuarios FROM bovitrack_homolog_dominio');
    await c.end();
  }
  assert.equal(probe().status,0);
  console.log('OK privilege guard: grant direto de escalada rejeitado; revogacao restaurou check positivo, sem dados alterados');
})().catch(e=>{console.error(e.code||e.name);process.exitCode=1;});
