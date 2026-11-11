// Carga sintetica limitada: 3 configuracoes, no maximo 30 HTTPs concorrentes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('../backend/node_modules/pg');
const {carregar,configuracaoAdmin,confirmarDestino}=require('./prepare-supabase-homologacao.cjs');
const {inspecionar,validarUrl}=require('./check-supabase-homologacao.cjs');
const {root,output}=require('./stage3-helpers.cjs');
const hex=()=>crypto.randomBytes(32).toString('hex');
function quantiles(values){const v=[...values].sort((a,b)=>a-b);return {samples:v.length,p50Ms:v[Math.ceil(v.length*.5)-1],p95Ms:v[Math.ceil(v.length*.95)-1],p99Ms:v[Math.ceil(v.length*.99)-1],maxMs:v.at(-1)};}

async function worker(size,env,alvo){
  assert.ok([2,3,5].includes(size));
  validarUrl(env.DATABASE_URL,'domain',alvo);validarUrl(env.DATABASE_AUTH_URL,'auth',alvo);
  await inspecionar(env.DATABASE_URL,'domain',alvo,env);
  Object.assign(process.env,env,{DB_POOL_MAX:String(size),VERCEL:''});
  const actors=JSON.parse(process.env.BOVITRACK_STAGE3_LOAD_ACTORS);
  const pool=require('../backend/database/pool');
  const auth=require('../backend/database/poolAutenticacao').obterPoolAutenticacao();
  const {criarTokenAcesso}=require('../backend/services/sessoes');
  const tokens=actors.slice(0,3).map(a=>criarTokenAcesso(a,{sessionId:a.sessionId}));
  const waits={domain:[],auth:[]};
  for(const [name,p]of[['domain',pool],['auth',auth]]){
    const connect=p.connect.bind(p);
    p.connect=function(callback){const start=performance.now();
      if(typeof callback==='function')return connect((error,client,release)=>{waits[name].push(performance.now()-start);callback(error,client,release);});
      return connect().then(client=>{waits[name].push(performance.now()-start);return client;});
    };
  }
  const app=require('../backend/app').app;
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  const result={poolPerRole:size,maxApplicationPools:2,rounds:[],completed:false};
  const get=async(index)=>{
    const i=index%3,start=performance.now();
    const response=await fetch(base+'/propriedades?limit=100',{headers:{Authorization:'Bearer '+tokens[i]},signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);const rows=await response.json();assert.ok(Array.isArray(rows));
    if(i<2){assert.equal(rows.length,1);assert.equal(rows[0].usuario_id,actors[i].id);}
    else for(const a of actors.slice(0,2))assert.ok(rows.some(p=>p.id===a.property));
    return performance.now()-start;
  };
  try{
    await Promise.all([get(0),get(1),get(2)]);
    for(const concurrency of[1,5,10,30]){
      waits.domain.length=0;waits.auth.length=0;const durations=[];let index=0,maxWaiting=0,maxClients=0;
      const sampling=setInterval(()=>{maxWaiting=Math.max(maxWaiting,pool.waitingCount+auth.waitingCount);maxClients=Math.max(maxClients,pool.totalCount+auth.totalCount);},5);
      const start=performance.now();
      try{await Promise.all(Array.from({length:concurrency},async()=>{while(index<100){const i=index++;durations.push(await get(i));}}));}
      finally{clearInterval(sampling);}
      const q=quantiles(durations),timeoutMs=Number(env.DB_QUERY_TIMEOUT_MS||15000);
      assert.ok(q.p99Ms<timeoutMs/2,'Margem tecnica do timeout insuficiente');
      assert.equal(pool.waitingCount+auth.waitingCount,0);
      result.rounds.push({concurrency,...q,errors:0,elapsedMs:performance.now()-start,maxWaiting,maxClients,
        domainAcquire:quantiles(waits.domain),authAcquire:waits.auth.length?quantiles(waits.auth):null,
        technicalGuardMs:timeoutMs/2,guardDefinition:'p99 inferior a metade do query_timeout configurado; nao e SLA de negocio'});
    }
    const logins=await Promise.all(actors.filter(a=>a.email!=='homolog-admin@example.com').slice(0,10).map(async a=>{
      const start=performance.now();const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:a.email,senha:env.TEST_ADMIN_SENHA}),signal:AbortSignal.timeout(15000)});
      assert.equal(r.status,200);const data=await r.json();assert.ok(data.token);return performance.now()-start;
    }));
    result.authentication={...quantiles(logins),errors:0};result.completed=true;
  }finally{
    await new Promise(resolve=>server.close(resolve));await Promise.allSettled([pool.end(),auth.end()]);
    fs.writeFileSync(path.join(output,'pool-'+size+'.json'),JSON.stringify(result,null,2));
  }
}

async function main(){
  const {alvo,env}=carregar();
  if(process.argv[2]==='--worker'){assert.equal(process.argv.length,4);return worker(Number(process.argv[3]),env,alvo);}
  assert.equal(process.argv.length,2);
  await inspecionar(env.BOVITRACK_HOMOLOG_ADMIN_URL,'admin',alvo,env);
  const c=new Client(configuracaoAdmin(env));await c.connect();
  const actors=[];let capacity;
  try{
    await confirmarDestino(c,alvo);
    capacity=(await c.query("SELECT current_setting('max_connections')::int AS max_connections,(SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()) AS current_database_connections")).rows[0];
    assert.ok(capacity.max_connections>=30);
    assert.ok(capacity.current_database_connections+12<=capacity.max_connections-5,'Sem margem segura para o ensaio');
    const bcrypt=require('../backend/node_modules/bcryptjs');const hash=await bcrypt.hash(env.TEST_ADMIN_SENHA,12),run=Date.now();
    await c.query('BEGIN');await confirmarDestino(c,alvo);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM usuarios WHERE email !~ '^homolog-[a-z0-9-]+@example[.]com$'")).rows[0].n,0);
    await c.query("DELETE FROM limites_requisicao WHERE escopo IN ('LOGIN_IP','LOGIN_CONTA','LOGIN_ADMIN')");
    for(let i=0;i<10;i++){
      const email='homolog-load-'+run+'-'+i+'@example.com';
      const u=(await c.query("INSERT INTO usuarios(nome,email,senha,perfil,email_verificado,email_verificado_em) VALUES ('Carga sintetica',$1,$2,'usuario',true,now()) RETURNING id",[email,hash])).rows[0];
      const property=(await c.query("INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ('Carga sintetica','Teste','SP',1,$1) RETURNING id",[u.id])).rows[0].id;
      const sessionId=hex();await c.query("INSERT INTO sessoes_refresh(usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at) VALUES ($1,$2,$3,$4,now()+interval '1 hour',now())",[u.id,hex(),sessionId,hex()]);
      actors.push({id:u.id,email,perfil:'usuario',property,sessionId});
    }
    const adm=(await c.query("SELECT id,email,perfil FROM usuarios WHERE email='homolog-admin@example.com'")).rows[0];
    const sid=hex();await c.query("INSERT INTO sessoes_refresh(usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at) VALUES ($1,$2,$3,$4,now()+interval '1 hour',now())",[adm.id,hex(),sid,hex()]);
    actors.splice(2,0,{...adm,sessionId:sid});
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
  const results=[];
  for(const size of[2,3,5]){
    const r=spawnSync(process.execPath,[__filename,'--worker',String(size)],{cwd:root,
      env:{...process.env,BOVITRACK_STAGE3_LOAD_ACTORS:JSON.stringify(actors)},encoding:'utf8',timeout:180000});
    fs.writeFileSync(path.join(output,'pool-'+size+'.log'),r.stdout+'\n'+r.stderr);
    assert.equal(r.status,0,'Carga interrompida no pool '+size);
    results.push(JSON.parse(fs.readFileSync(path.join(output,'pool-'+size+'.json'),'utf8')));
    console.log('OK carga pool '+size+': 400 GETs e 10 logins; isolamento e fila final conferidos');
  }
  fs.writeFileSync(path.join(output,'pool-sizing-results.json'),JSON.stringify({capacity,maximumHttpConcurrency:30,expectedConcurrentPeople:'10-30, informado pelo usuario',applicationPools:2,results,completed:true},null,2));
}
main().catch(e=>{console.error('Carga interrompida:',e.code||e.name,e.message?.startsWith('Carga interrompida')?e.message:'');process.exitCode=1;});
