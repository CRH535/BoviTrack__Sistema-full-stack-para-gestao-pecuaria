const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {output,localClient,createLocalDatabase,writeLocal,attestLocal,postgresEnv}=require('./stage3-helpers.cjs');
const {validateConfig}=require('./release-production.cjs');
(async()=>{
  for(const name of['prod','postgresql://postgres@db.znpmzebrryqtjkgnvlcw.supabase.co/postgres','bovitrack_stage3_legacy_fake']){
    await assert.rejects(localClient(name));await assert.rejects(createLocalDatabase(name));await assert.rejects(writeLocal({},name,'SELECT 1'));
  }
  const cluster=JSON.parse(fs.readFileSync(path.join(output,'local-cluster.json'),'utf8'));
  const database='bovitrack_stage3_legacy_123_abcdef';
  const valid={...cluster,database,marker:'bovitrack-stage3:'+database};
  for(const wrong of[{system_identifier:'other'},{version:'18.4'},{port:5432},{database:'postgres'},{marker:'wrong'}]){
    await assert.rejects(attestLocal({query:async()=>({rows:[{...valid,...wrong}]})},database));
  }
  const env=postgresEnv({PATH:'safe',PGHOSTADDR:'unsafe',PGSERVICE:'production',PGSERVICEFILE:'unsafe',PGOPTIONS:'unsafe'},{PGHOST:'approved',PGSSLMODE:'verify-full'});
  assert.deepEqual(env,{PATH:'safe',PGHOST:'approved',PGSSLMODE:'verify-full'});
  const badRef=spawnSync(process.execPath,[require.resolve('./prepare-release-sources.cjs'),'main;invalid'],{encoding:'utf8'});
  assert.equal(badRef.status,1);
  const production={BOVITRACK_RELEASE_ADMIN_URL:'postgresql://postgres:unit-only@db.znpmzebrryqtjkgnvlcw.supabase.co:5432/postgres',DB_SSL:'verify-full',BOVITRACK_RELEASE_SHA:'a'.repeat(40)};
  validateConfig(production,'--check');
  assert.throws(()=>validateConfig(production,'--prepare'));
  for(const wrong of[
    {BOVITRACK_RELEASE_ADMIN_URL:production.BOVITRACK_RELEASE_ADMIN_URL.replace('znpmzebrryqtjkgnvlcw','atlcangotqhtgybjsdau')},
    {BOVITRACK_RELEASE_ADMIN_URL:production.BOVITRACK_RELEASE_ADMIN_URL+'?host=other'},
    {BOVITRACK_RELEASE_ADMIN_URL:production.BOVITRACK_RELEASE_ADMIN_URL.replace(':5432',':6543')},
    {BOVITRACK_RELEASE_SHA:'main'}, {DB_SSL:'require'},
  ])assert.throws(()=>validateConfig({...production,...wrong},'--check'));
  validateConfig({...production,BOVITRACK_PRODUCTION_APPROVAL:'approve:znpmzebrryqtjkgnvlcw:'+'a'.repeat(40)},'--prepare');
  console.log('OK stage3 guards: nomes, cluster, versao, porta, marcador, overrides libpq e ref de release recusados antes de escrever');
})().catch(e=>{console.error(e.code||e.name);process.exitCode=1;});
