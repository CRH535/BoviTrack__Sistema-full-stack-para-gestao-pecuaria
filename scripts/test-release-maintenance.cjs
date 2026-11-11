const assert=require('node:assert/strict');
const http=require('node:http');
const handler=require('../release/maintenance/backend/api/status');
(async()=>{
  const server=await new Promise(resolve=>{const s=http.createServer(handler).listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    for(const method of['GET','POST','PUT','DELETE','OPTIONS']){
      const r=await fetch('http://127.0.0.1:'+server.address().port+'/auth/login',{method,headers:{Origin:'https://bovitrack-xi.vercel.app','Content-Type':'application/json'},body:['POST','PUT'].includes(method)?JSON.stringify({synthetic:true}):undefined});
      assert.equal(r.status,503);assert.equal(r.headers.get('retry-after'),'60');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).codigo,'MANUTENCAO');
    }
    console.log('OK maintenance: cinco metodos retornam 503 sem banco, sem cache e com Retry-After');
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.code||e.name);process.exitCode=1;});
