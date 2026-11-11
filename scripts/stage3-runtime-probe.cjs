// Probe de versoes reais em banco local atestado; nao aceita destinos remotos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { root, output, localName, localClient } = require('./stage3-helpers.cjs');

async function main() {
  const variant=process.argv[2];
  assert.ok(['legacy','email','candidate'].includes(variant));
  const url=new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55441');assert.ok(!url.search&&!url.hash);
  const database=url.pathname.slice(1);assert.match(database,localName);
  const fixture=await localClient(database);
  await fixture.end();
  const baseDir=variant==='candidate'?root:path.join(output,'revisions',variant);
  const mailPath=path.join(baseDir,'backend/services/emailService.js');
  if(fs.existsSync(mailPath))require(mailPath).enviarVerificacao=async()=>{};
  const exported=require(path.join(baseDir,'backend/app.js'));
  const app=exported.app||exported;
  const server=await new Promise(resolve=>{const s=app.listen(3006,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:3006';
  const request=async(route,{body,token,cookie}={})=>{
    const headers={'Content-Type':'application/json'};
    if(token)headers.Authorization='Bearer '+token;if(cookie)headers.Cookie=cookie;
    const res=await fetch(base+route,{method:body?'POST':'GET',headers,body:body&&JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    return{status:res.status,data:await res.json(),cookie:res.headers.getSetCookie().find(x=>x.startsWith('bovitrack_refresh='))?.split(';')[0]};
  };
  const result={variant,case:process.env.BOVITRACK_PROBE_CASE,completed:false};
  const sites=[];let browser;
  try {
    const login=await request('/auth/login',{body:{email:'stage3-verified@example.com',senha:process.env.TEST_ADMIN_SENHA}});
    result.loginStatus=login.status;
    if(process.env.BOVITRACK_EXPECT_LOGIN_FAILURE==='true'){
      assert.equal(login.status,503);assert.equal(login.data.token,undefined);result.expectedIncompatibility=true;result.completed=true;return;
    }
    assert.equal(login.status,200);assert.ok(login.data.token);
    assert.equal((await request('/auth/me',{token:login.data.token})).status,200);
    const properties=await request('/propriedades',{token:login.data.token});
    assert.equal(properties.status,200);
    assert.ok(Array.isArray(properties.data)&&properties.data.length===1);
    assert.ok(properties.data.every(p=>p.usuario_id===login.data.usuario.id));
    const refresh=await request('/auth/refresh',{body:{},cookie:login.cookie});assert.equal(refresh.status,200);
    assert.equal((await request('/auth/logout',{body:{},cookie:refresh.cookie})).status,200);
    assert.equal((await request('/auth/me',{token:refresh.data.token})).status,401);
    const pending=await request('/auth/login',{body:{email:'stage3-pending@example.com',senha:process.env.TEST_ADMIN_SENHA}});
    result.pendingStatus=pending.status;
    assert.equal(pending.status,variant==='legacy'?200:403);
    result.probes=['login','me','propriedades','refresh','logout','revogacao','conta-pendente'];
    if(process.env.BOVITRACK_PROBE_BROWSER==='true'){
      const serve=async(dir,port)=>{
        const s=http.createServer((req,res)=>{
          let target=path.resolve(dir,'.'+new URL(req.url,'http://localhost').pathname);
          if(!target.startsWith(path.resolve(dir)+path.sep)&&target!==path.resolve(dir)){res.writeHead(403).end();return;}
          if(!fs.existsSync(target)||fs.statSync(target).isDirectory())target=path.join(dir,'index.html');
          const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'}[path.extname(target)]||'application/octet-stream';
          res.writeHead(200,{'Content-Type':mime});fs.createReadStream(target).pipe(res);
        });await new Promise(resolve=>s.listen(port,'127.0.0.1',resolve));sites.push(s);
      };
      await serve(path.join(output,'revisions/legacy/frontend/dist'),5176);
      await serve(path.join(output,'candidate-web'),5177);
      const {chromium}=require('../frontend/node_modules/@playwright/test');browser=await chromium.launch({headless:true});
      result.frontends=[];
      for(const [frontend,port]of[['legacy',5176],['candidate',5177]]){
        const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
        const page=await context.newPage();
        await page.goto('http://127.0.0.1:'+port+'/login');
        await page.getByLabel('Email',{exact:true}).fill('stage3-pending@example.com');
        await page.getByLabel('Senha',{exact:true}).fill(process.env.TEST_ADMIN_SENHA);
        const response=page.waitForResponse(r=>r.url()===base+'/auth/login');
        await page.getByRole('button',{name:'Entrar',exact:true}).click();
        const status=(await response).status();
        if(variant==='legacy')await page.waitForURL(u=>!u.pathname.startsWith('/login'));
        else if(frontend==='candidate')await page.waitForURL('**/verificar-email');
        else await page.getByRole('alert').waitFor({state:'visible'});
        result.frontends.push({frontend,pendingStatus:status,path:new URL(page.url()).pathname,
          verificationReachable:!new URL(page.url()).pathname.startsWith('/login')});
        await page.screenshot({path:path.join(output,'compat-'+result.case+'-'+frontend+'.png')});
        await context.close();
      }
    }
    result.completed=true;
  } finally {
    await browser?.close();
    await Promise.all(sites.map(s=>new Promise(resolve=>s.close(resolve))));
    await new Promise(resolve=>server.close(resolve));
    const pool=require(path.join(baseDir,'backend/database/pool.js'));
    const pools=[pool.end()];
    if(variant==='candidate')pools.push(require('../backend/database/poolAutenticacao').obterPoolAutenticacao().end());
    await Promise.allSettled(pools);
    fs.writeFileSync(path.join(output,'probe-'+result.case+'.json'),JSON.stringify(result,null,2));
  }
}
main().catch(e=>{console.error('Probe interrompido:',e.code||e.name);console.error(e.stack?.split('\n').filter(x=>/^\s+at /.test(x)).slice(0,2).join('\n'));process.exitCode=1;});
