const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { mensagens } = require('./helpers/email');
const { app } = require('../app');
const pool = require("./helpers/bancoFixture");
const emailService = require('../services/emailService');
const service = require('../services/verificacaoEmail');
const { VERIFICACAO_EMAIL: config, obterConfiguracaoEmail } = require('../config/email');
const { criarSessaoRefresh, criarTokenAcesso, hashToken } = require('../services/sessoes');
const { templateVerificacaoEmail } = require('../emails/verificacaoEmail');
const jwt = require('jsonwebtoken');
let server, base;
let total = 0;
const suffix = crypto.randomUUID();
const email = `verification-${suffix}@example.test`;
const password = 'Verify#Fixture2026';
let userId;
async function check(nome, fn) { await fn(); total++; console.log(`OK ${nome}`); }
async function request(path, { body, ticket, token, cookie, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (ticket) headers['X-Email-Verification'] = ticket;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const r = await fetch(base + path, { method: body !== undefined ? 'POST' : 'GET', headers, body: body == null ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json(), cookie: r.headers.getSetCookie().find((c) => c.startsWith('bovitrack_refresh=')), retry: r.headers.get('Retry-After') };
}
async function resetLimits() { await pool.query('DELETE FROM limites_requisicao'); }
async function allowResend(target = email) {
  await pool.query(`UPDATE verificacoes_email SET criado_em = criado_em - INTERVAL '61 seconds'
    WHERE usuario_id = (SELECT id FROM usuarios WHERE email=$1)`, [target]);
}
async function latest() { return (await pool.query('SELECT * FROM verificacoes_email WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 1', [userId])).rows[0]; }
async function newCode() { await allowResend(); assert.equal((await service.solicitarCodigo(email)).estado, 'ENVIADO'); return mensagens.get(email).codigo; }

(async () => {
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  await resetLimits();
  let registration, ticket, code;
  await check('cadastro normal, conta pendente, envio inicial e nenhuma sessão completa', async () => {
    registration = await request('/auth/cadastro', { body: { nome: 'Verificação', email, senha: password } });
    assert.equal(registration.status, 202); assert.equal(registration.data.usuario, undefined);
    assert.equal(registration.cookie, undefined);
    const u = (await pool.query('SELECT * FROM usuarios WHERE email=$1', [email])).rows[0];
    userId = u.id; assert.equal(u.email_verificado, false); assert.equal(u.email_verificado_em, null);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessoes_refresh WHERE usuario_id=$1', [userId])).rows[0].n, 0);
    code = mensagens.get(email).codigo; assert.match(code, /^\d{6}$/); ticket = registration.data.verificacao.ticket;
    assert.ok((await latest()).enviado_em);
  });
  await check('CSPRNG, HMAC contextual, pepper, comparação e ticket com finalidade restrita', async () => {
    const oldRandom = Math.random; Math.random = () => { throw new Error('OTP não pode usar Math.random'); };
    try { for (let i=0;i<100;i++) assert.match(service.gerarCodigo(), /^\d{6}$/); } finally { Math.random = oldRandom; }
    const challenge = await latest(); const stored = challenge.codigo_hash;
    assert.notEqual(stored, code); assert.notEqual(stored, crypto.createHash('sha256').update(code).digest('hex'));
    assert.equal(stored, service.hashCodigo({ usuarioId: userId, email, desafioId: challenge.id, codigo: code }));
    assert.notEqual(stored, service.hashCodigo({ usuarioId: userId + 1, email, desafioId: challenge.id, codigo: code }));
    const pepper = process.env.EMAIL_VERIFICATION_PEPPER;
    try { process.env.EMAIL_VERIFICATION_PEPPER = crypto.randomBytes(48).toString('hex'); assert.notEqual(stored, service.hashCodigo({ usuarioId: userId, email, desafioId: challenge.id, codigo: code })); }
    finally { process.env.EMAIL_VERIFICATION_PEPPER = pepper; }
    const claims = jwt.decode(ticket); assert.equal(claims.email, undefined); assert.equal(claims.sub, undefined);
    assert.throws(() => service.validarTicket(ticket, 'victim@example.test'));
    assert.throws(() => obterConfiguracaoEmail({ RESEND_API_KEY:'fake', EMAIL_VERIFICATION_PEPPER:'curto' }));
  });
  await check('sem bypass por API direta, JWT restrito, campos extras ou URL manual', async () => {
    for (const path of ['/dashboard', '/usuarios', '/propriedades', '/animais', '/vacinas', '/receitas', '/auth/me']) {
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, { token: ticket })).status, 401);
    }
    const attack = await request('/auth/email/verificar', { ticket, body: { email, codigo: code, email_verificado: true } });
    assert.equal(attack.status, 400);
    assert.equal((await request('/auth/email/verificar', { body: { email, codigo: code } })).status, 401);
  });
  await check('senha errada não revela conta pendente; login correto retorna EMAIL_NOT_VERIFIED', async () => {
    const wrong = await request('/auth/login', { body: { email, senha:'Wrong#12345' } });
    assert.equal(wrong.status, 401); assert.equal(wrong.data.verificacao, undefined);
    const login = await request('/auth/login', { body: { email, senha: password } });
    assert.equal(login.status, 403); assert.equal(login.data.codigo, 'EMAIL_NOT_VERIFIED');
    assert.equal(login.data.token, undefined); assert.ok(login.data.verificacao.ticket);
    ticket = login.data.verificacao.ticket;
    assert.equal(login.data.verificacao.envio, 'COOLDOWN');
  });
  await check('código incorreto incrementa tentativas de forma persistente', async () => {
    const wrong = code === '000000' ? '111111' : '000000';
    const r = await request('/auth/email/verificar', { ticket, body: { email, codigo:wrong } });
    assert.equal(r.data.codigo, 'CODE_INVALID'); assert.equal((await latest()).tentativas, 1);
  });
  await check('código correto verifica data, consome desafio e exige novo login', async () => {
    const r = await request('/auth/email/verificar', { ticket, body: { email, codigo:code } });
    assert.equal(r.data.codigo, 'EMAIL_VERIFIED'); assert.equal(r.cookie, undefined);
    const u = (await pool.query('SELECT email_verificado,email_verificado_em FROM usuarios WHERE id=$1', [userId])).rows[0];
    assert.equal(u.email_verificado, true); assert.ok(u.email_verificado_em);
    assert.ok((await latest()).usado_em); assert.ok((await latest()).invalidado_em);
  });
  await check('reutilização de código é rejeitada; login após verificar libera sessão', async () => {
    assert.equal((await request('/auth/email/verificar', { ticket, body: { email, codigo:code } })).data.codigo, 'CODE_USED');
    const login = await request('/auth/login', { body: { email, senha: password } });
    assert.equal(login.status, 200); assert.ok(login.data.token); assert.ok(login.cookie);
    assert.equal((await request('/auth/me', { token: login.data.token })).status, 200);
  });
  await pool.query('UPDATE usuarios SET email_verificado=FALSE,email_verificado_em=NULL WHERE id=$1', [userId]);
  await resetLimits();
  await check('código expirado é invalidado', async () => {
    code = await newCode();
    const currentId = (await latest()).id;
    await pool.query(`UPDATE verificacoes_email SET criado_em=criado_em-INTERVAL '11 minutes' WHERE usuario_id=$1`, [userId]);
    await pool.query(`UPDATE verificacoes_email SET expira_em=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=$1`, [currentId]);
    assert.equal((await request('/auth/email/verificar', { ticket, body: { email, codigo:code } })).data.codigo, 'CODE_EXPIRED');
    assert.ok((await latest()).invalidado_em);
  });
  await check('cinco tentativas bloqueiam inclusive o código correto', async () => {
    code = await newCode(); const wrong = code === '000000' ? '111111' : '000000';
    for (let n=1;n<=5;n++) {
      const r = await request('/auth/email/verificar', { ticket, body: { email, codigo:wrong } });
      assert.equal(r.data.codigo, n===5 ? 'CODE_ATTEMPTS_EXCEEDED' : 'CODE_INVALID');
    }
    assert.equal((await latest()).tentativas, 5); assert.ok((await latest()).invalidado_em);
    assert.equal((await service.verificarCodigo(email, code)).estado, 'CODE_ATTEMPTS_EXCEEDED');
  });
  await check('cooldown persistente e reenvio invalidam o código anterior', async () => {
    code = await newCode();
    const cooldown = await request('/auth/email/reenviar', { ticket, body: { email } });
    assert.equal(cooldown.status, 429); assert.equal(cooldown.data.envio, 'COOLDOWN'); assert.ok(Number(cooldown.retry)>0);
    await allowResend();
    const old = await latest();
    const resend = await request('/auth/email/reenviar', { ticket, body: { email } });
    assert.equal(resend.status, 202); assert.equal(resend.data.envio, 'ENVIADO');
    const current = await latest(); assert.notEqual(old.id, current.id);
    assert.notEqual(code, mensagens.get(email).codigo);
    assert.equal((await service.verificarCodigo(email, code)).estado, 'CODE_INVALID');
    assert.equal((await pool.query('SELECT motivo FROM verificacoes_email WHERE id=$1', [old.id])).rows[0].motivo, 'REENVIO');
  });
  await resetLimits();
  await check('requisições de envio simultâneas criam somente um desafio ativo', async () => {
    await allowResend();
    const results = await Promise.all([service.solicitarCodigo(email), service.solicitarCodigo(email)]);
    assert.deepEqual(results.map((r)=>r.estado).sort(), ['COOLDOWN','ENVIADO']);
    const active = await pool.query('SELECT count(*)::int AS n FROM verificacoes_email WHERE usuario_id=$1 AND invalidado_em IS NULL', [userId]);
    assert.equal(active.rows[0].n, 1);
    const challenge = await latest();
    await assert.rejects(pool.query('INSERT INTO verificacoes_email(id,usuario_id,codigo_hash,expira_em) VALUES ($1,$2,$3,$4)', [crypto.randomUUID(), userId, challenge.codigo_hash, new Date(Date.now()+600000)]), (e)=>e.code==='23505');
  });
  await check('validações simultâneas consomem o código uma única vez', async () => {
    code = mensagens.get(email).codigo;
    const results = await Promise.all([service.verificarCodigo(email,code), service.verificarCodigo(email,code)]);
    assert.deepEqual(results.map((r)=>r.estado).sort(), ['CODE_USED','EMAIL_VERIFIED']);
  });
  await pool.query('UPDATE usuarios SET email_verificado=FALSE,email_verificado_em=NULL WHERE id=$1', [userId]);
  await resetLimits();
  await check('falha da Resend preserva conta única; novo envio recupera após cooldown', async () => {
    await allowResend();
    const failing = service.criarVerificacaoEmailService({ banco:pool, enviar:async()=>{ throw new Error('mensagem interna não pode sair'); } });
    assert.equal((await failing.solicitarCodigo(email)).estado, 'FALHA_TEMPORARIA');
    assert.equal((await latest()).motivo, 'FALHA_ENVIO');
    assert.equal((await latest()).enviado_em, null);
    const duplicate = await request('/auth/cadastro', { body: { nome:'Duplicado', email, senha:password } });
    assert.equal(duplicate.status, 202);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM usuarios WHERE email=$1',[email])).rows[0].n,1);
    assert.equal((await service.solicitarCodigo(email)).estado,'COOLDOWN');
    code = await newCode(); assert.ok((await latest()).enviado_em);
  });
  await check('usuário antigo com access/refresh anteriores é bloqueado; verificação não ressuscita sessão', async () => {
    await pool.query('UPDATE usuarios SET email_verificado=TRUE,email_verificado_em=CURRENT_TIMESTAMP WHERE id=$1',[userId]);
    const u = (await pool.query('SELECT id,perfil,senha FROM usuarios WHERE id=$1',[userId])).rows[0];
    const session = await criarSessaoRefresh(pool,userId,u.senha); const token = criarTokenAcesso(u,session);
    await pool.query('UPDATE usuarios SET email_verificado=FALSE,email_verificado_em=NULL WHERE id=$1',[userId]);
    assert.equal((await request('/dashboard',{token})).data.codigo,'EMAIL_NOT_VERIFIED');
    const refresh = await request('/auth/refresh',{body:null,cookie:`bovitrack_refresh=${session.token}`});
    assert.equal(refresh.status,403); assert.equal(refresh.data.codigo,'EMAIL_NOT_VERIFIED'); assert.equal(refresh.data.token,undefined);
    const row = (await pool.query('SELECT revoked_at FROM sessoes_refresh WHERE token_hash=$1',[hashToken(session.token)])).rows[0]; assert.ok(row.revoked_at);
    code = await newCode(); assert.equal((await service.verificarCodigo(email,code)).estado,'EMAIL_VERIFIED');
    assert.equal((await request('/dashboard',{token})).status,401);
    assert.equal((await request('/auth/refresh',{body:null,cookie:`bovitrack_refresh=${session.token}`})).status,401);
  });
  await resetLimits();
  await check('senha errada de admin não revela role pelo limite específico', async () => {
    const { consumirLimite }=require('../services/limitesRequisicao');
    for(let n=0;n<5;n++) await consumirLimite({escopo:'LOGIN_ADMIN',chave:`127.0.0.1|${process.env.TEST_ADMIN_EMAIL}`,limite:5,janelaMs:900000});
    const r=await request('/auth/login',{body:{email:process.env.TEST_ADMIN_EMAIL,senha:'Wrong#123456'}});
    assert.equal(r.status,401); assert.equal(r.data.verificacao,undefined);
  });
  await resetLimits();
  await check('administrador pendente não tem bypass e volta ao fluxo normal após verificar', async () => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL;
    await pool.query('UPDATE usuarios SET email_verificado=FALSE,email_verificado_em=NULL WHERE email=$1',[adminEmail]);
    const login = await request('/auth/login',{body:{email:adminEmail,senha:process.env.TEST_ADMIN_SENHA}});
    assert.equal(login.status,403); assert.equal(login.data.codigo,'EMAIL_NOT_VERIFIED');
    const verify = await request('/auth/email/verificar',{ticket:login.data.verificacao.ticket,body:{email:adminEmail,codigo:mensagens.get(adminEmail).codigo}});
    assert.equal(verify.status,200);
    assert.equal((await request('/auth/login',{body:{email:adminEmail,senha:process.env.TEST_ADMIN_SENHA}})).status,200);
  });
  await check('troca de e-mail por admin retira verificação, invalida desafios e revoga sessões', async () => {
    const login = await request('/auth/login',{body:{email,senha:password}});
    const adminLogin = await request('/auth/login',{body:{email:process.env.TEST_ADMIN_EMAIL,senha:process.env.TEST_ADMIN_SENHA}});
    const novoEmail = `changed-${suffix}@example.test`;
    const r = await fetch(`${base}/usuarios/${userId}`, {method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminLogin.data.token}`},body:JSON.stringify({nome:'Alterado',email:novoEmail})});
    assert.equal(r.status,200);
    const u=(await pool.query('SELECT email_verificado,email_verificado_em FROM usuarios WHERE id=$1',[userId])).rows[0];
    assert.equal(u.email_verificado,false); assert.equal(u.email_verificado_em,null);
    assert.equal((await request('/auth/me',{token:login.data.token})).status,401);
    const unchanged = await pool.query('SELECT count(*)::int AS n FROM sessoes_refresh WHERE usuario_id=$1 AND revoked_at IS NULL',[userId]); assert.equal(unchanged.rows[0].n,0);
    await pool.query('UPDATE usuarios SET email=$1 WHERE id=$2',[email,userId]);
  });
  await resetLimits();
  await check('troca do próprio e-mail encerra sessão e exige nova verificação', async () => {
    const codigo = await newCode();
    assert.equal((await service.verificarCodigo(email,codigo)).estado,'EMAIL_VERIFIED');
    const login = await request('/auth/login',{body:{email,senha:password}});
    assert.equal(login.status,200);
    const novo = `own-change-${suffix}@example.test`;
    const r=await fetch(`${base}/usuarios/me`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${login.data.token}`},body:JSON.stringify({nome:'Minha conta',email:novo})});
    assert.equal(r.status,200); assert.equal((await r.json()).usuario.email_verificado,false);
    assert.equal((await request('/auth/me',{token:login.data.token})).status,401);
    await pool.query('UPDATE usuarios SET email=$1 WHERE id=$2',[email,userId]);
  });
  await resetLimits();
  await check('conta inexistente, pendente, verificada e falha têm mesmo envelope público', async () => {
    const absent=`absent-${suffix}@example.test`;
    const verified=process.env.TEST_ADMIN_EMAIL;
    const failing=service.criarVerificacaoEmailService({banco:pool,enviar:async()=>{throw new Error('falha');}});
    const envelopes=[]; const durations=[];
    for (const [target, fail] of [[absent,false],[email,false],[verified,false],[email,true]]) {
      await allowResend(target);
      const original=service.solicitarCodigo;
      if(fail) service.solicitarCodigo=failing.solicitarCodigo;
      const start=Date.now();
      try { const r=await request('/auth/email/reenviar',{ticket:service.criarTicket(target),body:{email:target}}); assert.equal(r.status,202); envelopes.push(JSON.stringify(r.data)); durations.push(Date.now()-start); }
      finally { service.solicitarCodigo=original; }
    }
    assert.equal(new Set(envelopes).size,1); assert.ok(durations.every((d)=>d>=config.respostaPublicaMinMs-30));
    const publicWrong=await request('/auth/email/verificar',{ticket:service.criarTicket(absent),body:{email:absent,codigo:'123456'}});
    const pendingWrong=await request('/auth/email/verificar',{ticket:service.criarTicket(email),body:{email,codigo:'123456'}});
    assert.deepEqual(publicWrong.data,pendingWrong.data);
  });
  await resetLimits();
  await check('rate limits por e-mail e IP persistem; validação e cadastro são limitados', async () => {
    const absent=`rate-${suffix}@example.test`;
    for(let n=0;n<config.envioPorHora;n++) await service.solicitarCodigo(absent);
    assert.equal((await service.solicitarCodigo(absent)).estado,'RATE_LIMIT');
    // Usa a infraestrutura real do banco, sem depender de dezenas de envios.
    const { consumirLimite }=require('../services/limitesRequisicao');
    for(let n=0;n<config.validacaoPorHora;n++) await consumirLimite({escopo:'EMAIL_VALIDACAO_CONTA',chave:absent,limite:config.validacaoPorHora,janelaMs:3600000});
    assert.equal((await request('/auth/email/verificar',{ticket:service.criarTicket(absent),body:{email:absent,codigo:'123456'}})).status,429);
    for(let n=0;n<config.envioIpPorHora;n++) await consumirLimite({escopo:'EMAIL_ENVIO_IP',chave:'127.0.0.1',limite:config.envioIpPorHora,janelaMs:3600000});
    assert.equal((await request('/auth/email/reenviar',{ticket:service.criarTicket(absent),body:{email:absent}})).status,429);
    assert.equal((await request('/auth/cadastro',{body:{nome:'Sem abuso',email:absent,senha:password}})).status,429);
  });
  await resetLimits();
  await check('CSRF e tickets expirados/alterados são rejeitados', async () => {
    assert.equal((await request('/auth/email/reenviar',{ticket,origin:'https://evil.example',body:{email}})).status,403);
    const expired=jwt.sign({finalidade:'verificacao-email'},process.env.JWT_SECRET,{algorithm:'HS256',audience:'bovitrack-email-verification',issuer:'bovitrack-api',expiresIn:-1});
    assert.equal((await request('/auth/email/verificar',{ticket:expired,body:{email,codigo:'123456'}})).data.codigo,'VERIFICATION_CONTEXT_EXPIRED');
    assert.equal((await request('/auth/email/reenviar',{ticket,body:{email:'victim@example.test'}})).status,401);
  });
  await check('SDK oficial usa EMAIL_FROM, idempotência, timeout e não registra resposta interna', async () => {
    const calls=[]; const transport=emailService.criarEmailService({criarCliente:()=>({emails:{send:async(...args)=>{calls.push(args);return {data:{id:'mock-id'},error:null};}}})});
    await transport.enviarVerificacao({email,codigo:'123456',desafioId:'mock-challenge'});
    assert.equal(calls[0][0].from,process.env.EMAIL_FROM); assert.equal(calls[0][1].idempotencyKey,'email-verification/mock-challenge'); assert.ok(calls[0][1].signal);
    const original=global.fetch, oldConsole=console.error; const logs=[];
    const badTransport=emailService.criarEmailService();
    console.error=(...args)=>logs.push(args);
    global.fetch=async(_url, options)=>{assert.ok(options.signal);return new Response(JSON.stringify({name:'validation_error',message:`private-code ${code} ${email}`}),{status:403});};
    try { await assert.rejects(badTransport.enviarVerificacao({email,codigo:'123456',desafioId:'mock'}),(e)=>e.code==='EMAIL_SEND_FAILED'&&!e.message.includes(email)); assert.equal(logs.length,0); }
    finally { global.fetch=original; console.error=oldConsole; }
    const t=templateVerificacaoEmail('123456',10); assert.ok(t.text.includes('123 456')); assert.ok(t.html.includes('role="presentation"')); assert.doesNotMatch(t.html,/<script|javascript:/i);
    assert.throws(()=>templateVerificacaoEmail('<img>',10));
  });
  await resetLimits();
  await check('falha no envio inicial de cadastro é recuperável, sem nova conta ou detalhes internos', async () => {
    const target=`initial-failure-${suffix}@example.test`;
    const original=emailService.enviarVerificacao;
    emailService.enviarVerificacao=async()=>{throw new Error('detalhes privados do provedor');};
    let response;
    try {
      response=await request('/auth/cadastro',{body:{nome:'Falha inicial',email:target,senha:password}});
      assert.equal(response.status,202); assert.equal(response.data.verificacao.envio,'SOLICITADO');
      assert.ok(!JSON.stringify(response.data).includes('detalhes privados'));
      const state=await pool.query('SELECT u.email_verificado,v.motivo FROM usuarios u JOIN verificacoes_email v ON v.usuario_id=u.id WHERE u.email=$1',[target]);
      assert.equal(state.rows[0].email_verificado,false); assert.equal(state.rows[0].motivo,'FALHA_ENVIO');
      await allowResend(target);
      const login=await request('/auth/login',{body:{email:target,senha:password}});
      assert.equal(login.status,403); assert.equal(login.data.codigo,'EMAIL_NOT_VERIFIED');
      assert.equal(login.data.verificacao.envio,'FALHA_TEMPORARIA');
    } finally { emailService.enviarVerificacao=original; }
    await allowResend(target);
    const resend=await request('/auth/email/reenviar',{ticket:response.data.verificacao.ticket,body:{email:target}});
    assert.equal(resend.status,202);
    assert.equal((await service.verificarCodigo(target,mensagens.get(target).codigo)).estado,'EMAIL_VERIFIED');
    await pool.query('DELETE FROM usuarios WHERE email=$1',[target]);
  });
  await check('RLS, privilégio público, trigger com papel interno e consistência dos timestamps', async () => {
    const table=(await pool.query(`SELECT relrowsecurity,relacl,relowner FROM pg_class WHERE oid='public.verificacoes_email'::regclass`)).rows[0];
    assert.equal(table.relrowsecurity,true);
    const grants=await pool.query(`SELECT * FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='public.verificacoes_email'::regclass AND a.grantee=0`);
    assert.equal(grants.rowCount,0);
    const fn=(await pool.query(`SELECT prosecdef,proconfig FROM pg_proc WHERE oid='bovitrack_seg.invalidar_ao_alterar_email()'::regprocedure`)).rows[0];
    assert.equal(fn.prosecdef,true); assert.ok(fn.proconfig.some((s)=>s.includes('pg_catalog')));
    await assert.rejects(pool.query('UPDATE usuarios SET email_verificado=TRUE,email_verificado_em=NULL WHERE id=$1',[userId]),(e)=>e.code==='23514');
    const before=(await pool.query('SELECT email FROM usuarios WHERE id=$1',[userId])).rows[0].email;
    await assert.rejects(pool.query('UPDATE usuarios SET email=$1 WHERE id=$2',[before.toUpperCase(),2]),(e)=>e.code==='23505');
  });
  await check('runtime sem acesso direto aos desafios', async () => {
    const { pool: runtime } = require('../app');
    await assert.rejects(runtime.query('SELECT id FROM verificacoes_email'), { code: '42501' });
    await assert.rejects(runtime.query('UPDATE verificacoes_email SET tentativas=0'), { code: '42501' });
  });
  await check('migration reaplicável preserva contas/dados e revoga sessões pendentes', async () => {
    const before=(await pool.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n;
    const fs=require('node:fs'), path=require('node:path');
    await pool.query(fs.readFileSync(path.join(__dirname,'../database/migrations/013_verificacao_email.sql'),'utf8'));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n,before);
    assert.equal((await pool.query('SELECT email_verificado FROM usuarios WHERE id=$1',[userId])).rows[0].email_verificado,false);
    await pool.query('DELETE FROM usuarios WHERE id=$1',[userId]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM verificacoes_email WHERE usuario_id=$1',[userId])).rows[0].n,0);
  });
  console.log(`${total} grupos de verificação de e-mail aprovados; Resend mock, PostgreSQL real e nenhuma entrega externa.`);
})().catch((e)=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(server) await new Promise((resolve)=>server.close(resolve));
  await resetLimits().catch(()=>{}); await pool.end();
});
