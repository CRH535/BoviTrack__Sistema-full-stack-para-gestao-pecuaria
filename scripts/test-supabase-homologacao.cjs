// Runner remoto exclusivo. Não importa fixtures locais nem altera suas proteções.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('../backend/node_modules/pg');
const { carregar, configuracaoAdmin, confirmarDestino } = require('./prepare-supabase-homologacao.cjs');
const { validarUrl, inspecionar } = require('./check-supabase-homologacao.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/rls-etapa2');
const hex = () => crypto.randomBytes(32).toString('hex');
const sqlFile = (file) => fs.readFileSync(path.join(root, 'backend/database', file), 'utf8');
let checks = 0;
async function check(name, fn) {
  try { await fn(); } catch (error) { error.checkName = name; throw error; }
  checks++; console.log(`OK remoto ${name}`);
}
function child(file, env, args = []) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: path.join(root, 'backend'), env, encoding: 'utf8', timeout: 120000,
  });
  assert.equal(result.status, 0, `${file} falhou; código ${result.status}`);
  return result.stdout;
}
async function snapshot(admin) {
  return (await admin.query(`SELECT jsonb_build_object(
    'tables',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relname) FROM
      (SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') x),
    'policies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY tablename,policyname) FROM
      (SELECT * FROM pg_policies WHERE schemaname='public') x),
    'defaults',(SELECT jsonb_agg(to_jsonb(x) ORDER BY role,schema,type) FROM
      (SELECT pg_get_userbyid(d.defaclrole) AS role,n.nspname AS schema,d.defaclobjtype AS type,d.defaclacl::text
       FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public') x),
    'columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relname,attname) FROM
      (SELECT c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attacl IS NOT NULL) x)
  ) AS state`)).rows[0].state;
}

async function main() {
  assert.equal(process.argv.length, 2, 'Runner não aceita URLs/argumentos');
  const { alvo, env } = carregar();
  for (const [tipo, value] of [['admin', env.BOVITRACK_HOMOLOG_ADMIN_URL], ['domain', env.DATABASE_URL], ['auth', env.DATABASE_AUTH_URL]]) {
    validarUrl(value, tipo, alvo);
    await inspecionar(value, tipo, alvo, env);
  }
  Object.assign(process.env, env, { VERCEL: '', NODE_ENV: 'test', EMAIL_VERIFICATION_REQUIRED: 'true' });
  const admin = new Client(configuracaoAdmin(env));
  let pool, auth, server;
  const report = { projectRef: alvo.projectRef, startedAt: new Date().toISOString(), measurements: {}, completed: false };
  try {
    await admin.connect();
    await confirmarDestino(admin, alvo);
    assert.equal((await admin.query("SELECT to_regclass('bovitrack_seg.configuracao_email') IS NOT NULL AS ready")).rows[0].ready,
      true, 'Aplicar a migration 021 administrativamente na homologacao antes desta suite TRUE');
    assert.equal((await admin.query('SELECT bovitrack_seg.email_verificacao_obrigatoria() AS obrigatoria')).rows[0].obrigatoria,
      true, 'Esta suite valida a configuracao TRUE da homologacao');
    const audit = child('scripts/migrate-email-verification.js', { ...process.env,
      SUPABASE_MIGRATION_URL: env.BOVITRACK_HOMOLOG_ADMIN_URL }, ['--check']);
    fs.writeFileSync(path.join(output, 'remote-email-check.log'), audit);
    const readiness = (await admin.query(`SELECT
      (SELECT count(DISTINCT tablename)::int FROM pg_policies WHERE schemaname='public') AS tables,
      (SELECT count(*)::int FROM bovitrack_seg.chaves_contexto WHERE chave=decode($1,'hex')) AS matching_keys,
      to_regprocedure('bovitrack_seg.sessao_atual()') IS NOT NULL
       AND to_regprocedure('bovitrack_seg.rodar_refresh(text,text)') IS NOT NULL
       AND to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NOT NULL AS functions`, [env.DB_RLS_CONTEXT_KEY])).rows[0];
    assert.deepEqual(readiness, { tables: 16, matching_keys: 1, functions: true });
    fs.writeFileSync(path.join(output, 'remote-before-019.json'), JSON.stringify(await snapshot(admin), null, 2));
    await confirmarDestino(admin, alvo);
    await admin.query(sqlFile('migrations/019_rls_ativacao.sql'));
    const active = await snapshot(admin);
    fs.writeFileSync(path.join(output, 'remote-after-019.json'), JSON.stringify(active, null, 2));
    child('scripts/check-security-readonly.js', process.env);
    console.log('OK remoto 019 ativa; 16 tabelas, grants e credenciais verificadas');

    pool = require('../backend/database/pool');
    auth = require('../backend/database/poolAutenticacao').obterPoolAutenticacao();
    const { comAtor, transacao, assinarContexto } = require('../backend/database/contextoRls');
    const sessions = require('../backend/services/sessoes');
    const bcrypt = require('../backend/node_modules/bcryptjs');
    const passwordHash = await bcrypt.hash(env.TEST_ADMIN_SENHA, 12);
    const run = Date.now().toString(36);
    async function actor(email, perfil) {
      let row = (await admin.query('SELECT id,email,senha FROM public.usuarios WHERE perfil=\'admin\'')).rows[0];
      if (perfil !== 'admin' || !row) row = (await admin.query(`INSERT INTO public.usuarios
        (nome,email,senha,perfil,email_verificado,email_verificado_em) VALUES ('Fixture homologação',$1,$2,$3,true,now()) RETURNING id,email,senha`,
      [email, passwordHash, perfil])).rows[0];
      assert.equal(row.email, email);
      const session = await sessions.criarSessaoRefresh(auth, row.id, row.senha);
      return { id: row.id, sessionId: session.sessionId, email, refresh: session.token, perfil };
    }
    const adm = await actor('homolog-admin@example.com', 'admin');
    const a = await actor(`homolog-a-${run}@example.com`, 'usuario');
    const b = await actor(`homolog-b-${run}@example.com`, 'usuario');
    const fixtures = [];
    for (const owner of [a, b]) fixtures.push(await comAtor(owner, async (c) => {
      const insert = async (sql, params) => (await c.query(sql + ' RETURNING id', params)).rows[0].id;
      const prop = await insert("INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ('Homologação','Teste','SP',1,$1)", [owner.id]);
      const mom = await insert("INSERT INTO animais(nome,especie,sexo,propriedade_id) VALUES ('Mãe','Bovino','F',$1)", [prop]);
      const animal = await insert("INSERT INTO animais(nome,especie,sexo,propriedade_id,mae_id) VALUES ('Bezerro','Bovino','M',$1,$2)", [prop, mom]);
      const lote = await insert("INSERT INTO lotes(nome,propriedade_id) VALUES ('Lote homologação',$1)", [prop]);
      const vacina = await insert("INSERT INTO vacinas(nome,usuario_id) VALUES ('Vacina homologação',$1)", [owner.id]);
      await c.query('INSERT INTO animais_lotes(animal_id,lote_id) VALUES ($1,$2)', [animal, lote]);
      const vacinacao = await insert('INSERT INTO vacinacoes(animal_id,vacina_id,data_aplicacao) VALUES ($1,$2,current_date)', [animal, vacina]);
      const despesa = await insert("INSERT INTO despesas(descricao,categoria,valor,data,propriedade_id) VALUES ('Ração','Alimentação',10,current_date,$1)", [prop]);
      const receita = await insert("INSERT INTO receitas(descricao,categoria,valor,data,propriedade_id) VALUES ('Leite','VENDA_LEITE',20,current_date,$1)", [prop]);
      const leite = await insert("INSERT INTO producoes_leiteiras(animal_id,data,turno,quantidade_litros) VALUES ($1,current_date,'manha',10)", [mom]);
      const pesagem = await insert("INSERT INTO pesagens(animal_id,data_pesagem,peso_kg,tipo_pesagem,lote_id,registrado_por) VALUES ($1,current_date,100,'ROTINA',$2,$3)", [animal, lote, owner.id]);
      const desmama = await insert("INSERT INTO desmamas(animal_id,mae_id,data_planejada,tipo_desmama,lote_destino_id,registrado_por) VALUES ($1,$2,current_date,'CONVENCIONAL',$3,$4)", [animal, mom, lote, owner.id]);
      return { prop, mom, animal, lote, vacina, vacinacao, despesa, receita, leite, pesagem, desmama };
    }));
    const [fa, fb] = fixtures;
    const visible = (who) => comAtor(who, async (c) => (await c.query('SELECT id FROM propriedades WHERE id=ANY($1) ORDER BY id', [[fa.prop, fb.prop]])).rows.map(r => r.id));
    await check('A/B/admin, SELECT sem identidade e CRUD cruzado', async () => {
      assert.deepEqual(await visible(a), [fa.prop]); assert.deepEqual(await visible(b), [fb.prop]);
      assert.deepEqual(await visible(adm), [fa.prop, fb.prop]);
      assert.equal((await pool.query('SELECT id FROM propriedades')).rowCount, 0);
      const tables = { animais: ['animal', 'nome'], lotes: ['lote', 'nome'], vacinas: ['vacina', 'nome'],
        vacinacoes: ['vacinacao', 'observacao'], despesas: ['despesa', 'descricao'], receitas: ['receita', 'descricao'],
        producoes_leiteiras: ['leite', 'observacao'], pesagens: ['pesagem', 'observacao'], desmamas: ['desmama', 'observacao'] };
      for (const [table, [key, column]] of Object.entries(tables)) await comAtor(a, async (c) => {
        assert.equal((await c.query(`SELECT id FROM ${table} WHERE id=$1`, [fb[key]])).rowCount, 0);
        assert.equal((await c.query(`UPDATE ${table} SET ${column}='não pode' WHERE id=$1`, [fb[key]])).rowCount, 0);
        assert.equal((await c.query(`DELETE FROM ${table} WHERE id=$1`, [fb[key]])).rowCount, 0);
        assert.equal((await c.query(`SELECT id FROM ${table} WHERE id=$1`, [fa[key]])).rowCount, 1);
      });
      assert.equal((await admin.query('SELECT descricao FROM despesas WHERE id=$1', [fb.despesa])).rows[0].descricao, 'Ração');
    });
    await check('INSERT alheio, troca de dono, vínculos, pesagem, desmama e movimento inválidos', async () => {
      for (const [sql, params, code] of [
        ["INSERT INTO animais(nome,especie,propriedade_id) VALUES ('negado','Bovino',$1)", [fb.prop], '42501'],
        ['UPDATE propriedades SET usuario_id=$1 WHERE id=$2', [b.id, fa.prop], '42501'],
        ['INSERT INTO animais_lotes(animal_id,lote_id) VALUES ($1,$2)', [fa.animal, fb.lote], '23514'],
        ['INSERT INTO vacinacoes(animal_id,vacina_id,data_aplicacao) VALUES ($1,$2,current_date)', [fa.animal, fb.vacina], '23514'],
        ['UPDATE pesagens SET lote_id=$1 WHERE id=$2', [fb.lote, fa.pesagem], '23514'],
        ['UPDATE desmamas SET lote_destino_id=$1 WHERE id=$2', [fb.lote, fa.desmama], '23514'],
        ['UPDATE animais SET propriedade_id=$1 WHERE id=$2', [fb.prop, fa.animal], '23514'],
        ['UPDATE animais SET sexo=NULL WHERE id=$1', [fa.mom], '23514'],
      ]) await assert.rejects(comAtor(a, c => c.query(sql, params)), { code });
      assert.equal((await admin.query('SELECT propriedade_id FROM animais WHERE id=$1', [fa.animal])).rows[0].propriedade_id, fa.prop);
    });
    await check('assinatura, finalidade, sessão e transação interrompida', async () => {
      let signature;
      await comAtor(a, async c => { signature = (await c.query("SELECT current_setting('bovitrack.assinatura') AS s")).rows[0].s; });
      await transacao(pool, async c => {
        await c.query('SELECT bovitrack_seg.desafio()');
        await c.query(`SELECT set_config('bovitrack.usuario_id',$1,true),set_config('bovitrack.session_id',$2,true),
          set_config('bovitrack.assinatura',$3,true),set_config('bovitrack.finalidade','dominio',true)`, [String(a.id), a.sessionId, signature]);
        assert.equal((await c.query('SELECT id FROM propriedades')).rowCount, 0);
      });
      await assert.rejects(comAtor({ ...a, sessionId: b.sessionId }, c => c.query('SELECT 1')), { codigo: 'SESSAO_INVALIDA' });
      await comAtor(a, async c => { await c.query("SET LOCAL bovitrack.finalidade='exclusao'"); assert.equal((await c.query('SELECT id FROM propriedades')).rowCount, 0); });
      await assert.rejects(comAtor(a, async c => { await c.query("UPDATE propriedades SET nome='rollback' WHERE id=$1", [fa.prop]); await c.query('SELECT 1/0'); }), { code: '22012' });
      assert.equal((await admin.query('SELECT nome FROM propriedades WHERE id=$1', [fa.prop])).rows[0].nome, 'Homologação');
      await assert.rejects(comAtor(a, async c => { await c.query("SET LOCAL statement_timeout='20ms'"); await c.query('SELECT pg_sleep(1)'); }), { code: '57014' });
      assert.deepEqual(await visible(b), [fb.prop]);
    });
    await check('UPDATE próprio, finanças, DELETE próprio e referências preservadas', async () => {
      await comAtor(a, async c => {
        for (const [table, key, column] of [['animais','animal','nome'],['lotes','lote','nome'],['vacinas','vacina','nome'],
          ['vacinacoes','vacinacao','observacao'],['producoes_leiteiras','leite','observacao'],['pesagens','pesagem','observacao'],['desmamas','desmama','observacao']]) {
          assert.equal((await c.query(`UPDATE ${table} SET ${column}='Homologação validada' WHERE id=$1`, [fa[key]])).rowCount, 1);
        }
        assert.equal((await c.query('UPDATE despesas SET valor=15 WHERE id=$1', [fa.despesa])).rowCount, 1);
        assert.equal((await c.query('SELECT valor::text FROM despesas WHERE id=$1', [fa.despesa])).rows[0].valor, '15.00');
        const balance = (await c.query('SELECT (SELECT sum(valor) FROM receitas WHERE propriedade_id=$1)-(SELECT sum(valor) FROM despesas WHERE propriedade_id=$1) AS profit', [fa.prop])).rows[0];
        assert.equal(Number(balance.profit), 5);
        assert.equal((await c.query('DELETE FROM animais_lotes WHERE animal_id=$1 AND lote_id=$2', [fa.animal,fa.lote])).rowCount, 1);
        await c.query('INSERT INTO animais_lotes(animal_id,lote_id) VALUES ($1,$2)', [fa.animal,fa.lote]);
        assert.equal((await c.query('DELETE FROM vacinacoes WHERE id=$1', [fa.vacinacao])).rowCount, 1);
        await c.query('INSERT INTO vacinacoes(id,animal_id,vacina_id,data_aplicacao) VALUES ($1,$2,$3,current_date)', [fa.vacinacao,fa.animal,fa.vacina]);
      });
      assert.equal((await admin.query('SELECT valor::text FROM despesas WHERE id=$1', [fb.despesa])).rows[0].valor, '10.00');
    });
    await check('falha física da conexão, timeout do driver e pool recuperado', async () => {
      const { Pool } = require('../backend/node_modules/pg');
      const { criarConfiguracaoBanco } = require('../backend/database/config');
      const isolatedPool = new Pool(criarConfiguracaoBanco({ ...env, DB_POOL_MAX: '1' }));
      isolatedPool.on('error', () => {});
      try {
        await assert.rejects(transacao(isolatedPool, async c => {
          const challenge = (await c.query('SELECT bovitrack_seg.desafio() AS xid')).rows[0].xid;
          const signature = assinarContexto(`bovitrack-rls-v1:${challenge}:${a.id}:${a.sessionId}:dominio`);
          await c.query(`SELECT set_config('bovitrack.usuario_id',$1,true),set_config('bovitrack.session_id',$2,true),
            set_config('bovitrack.assinatura',$3,true),set_config('bovitrack.finalidade','dominio',true)`, [String(a.id),a.sessionId,signature]);
          assert.equal((await c.query('SELECT id FROM propriedades WHERE id=$1', [fa.prop])).rowCount, 1);
          await c.query('SELECT pg_terminate_backend(pg_backend_pid())');
        }), error => error.code === '57P01' || /connection terminated|connection.*closed/i.test(error.message));
        assert.equal((await isolatedPool.query('SELECT count(*)::int AS n FROM propriedades')).rows[0].n, 0);
        await assert.rejects(transacao(isolatedPool, c => c.query({ text: 'SELECT pg_sleep(1)', query_timeout: 50 })), /Query read timeout/);
        assert.equal((await isolatedPool.query('SELECT count(*)::int AS n FROM propriedades')).rows[0].n, 0);
        assert.equal(isolatedPool.waitingCount, 0);
      } finally { await isolatedPool.end(); }
    });
    await check('concorrência real, reutilização de conexões e contexto limpo', async () => {
      const durations = [], pids = new Set(); let maxWaiting = 0, maxClients = 0;
      const sampler = setInterval(() => { maxWaiting = Math.max(maxWaiting, pool.waitingCount); maxClients = Math.max(maxClients, pool.totalCount); }, 5);
      try {
        await Promise.all(Array.from({ length: 90 }, async (_, i) => {
          const who = [a, b, adm][i % 3], expected = i % 3 === 0 ? [fa.prop] : i % 3 === 1 ? [fb.prop] : [fa.prop, fb.prop];
          const start = performance.now();
          await comAtor(who, async c => {
            const { rows: [r] } = await c.query("SELECT pg_backend_pid() AS pid,current_setting('bovitrack.usuario_id')::int AS uid");
            pids.add(r.pid); assert.equal(r.uid, who.id);
            assert.deepEqual((await c.query('SELECT id FROM propriedades WHERE id=ANY($1) ORDER BY id', [[fa.prop, fb.prop]])).rows.map(r => r.id), expected);
          });
          durations.push(performance.now() - start);
        }));
      } finally { clearInterval(sampler); }
      await Promise.all(Array.from({ length: 12 }, () => transacao(pool, async c => {
        assert.ok(!((await c.query("SELECT current_setting('bovitrack.usuario_id',true) AS uid")).rows[0].uid));
        assert.equal((await c.query('SELECT id FROM propriedades')).rowCount, 0);
      })));
      durations.sort((x, y) => x - y);
      report.measurements.concurrency = { operations: 90, errors: 0, p50Ms: durations[44], p95Ms: durations[85], maxMs: durations[89], physicalPids: pids.size, maxWaiting, maxClients, idleAfter: pool.idleCount, waitingAfter: pool.waitingCount };
      console.log(JSON.stringify(report.measurements.concurrency));
    });

    // Mock local explícito: nenhum SDK de entrega é chamado.
    const mail = new Map();
    require('../backend/services/emailService').enviarVerificacao = async data => { mail.set(data.email, data.codigo); };
    const { app } = require('../backend/app');
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (route, { body, token, cookie, ticket, method } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (cookie) headers.Cookie = cookie;
      if (ticket) headers['X-Email-Verification'] = ticket;
      const start = performance.now();
      const r = await fetch(base + route, { method: method || (body ? 'POST' : 'GET'), headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const data = await r.json();
      return { status: r.status, data, durationMs: performance.now() - start, cookie: r.headers.getSetCookie().find(s => s.startsWith('bovitrack_refresh='))?.split(';')[0] };
    };
    await check('HTTP cadastro, conta pendente, código inválido, verificação concorrente, login/refresh/logout', async () => {
      const email = `homolog-new-${run}@example.com`;
      const registered = await request('/auth/cadastro', { body: { nome: 'Nova fixture', email, senha: env.TEST_ADMIN_SENHA } });
      assert.equal(registered.status, 202); assert.equal(registered.cookie, undefined);
      const ticket = registered.data.verificacao.ticket;
      const invalid = await request('/auth/email/verificar', { ticket, body: { email, codigo: mail.get(email) === '000000' ? '111111' : '000000' } });
      assert.equal(invalid.status, 400);
      assert.equal((await request('/auth/login', { body: { email, senha: env.TEST_ADMIN_SENHA } })).status, 403);
      const results = await Promise.all([1, 2].map(() => request('/auth/email/verificar', { ticket, body: { email, codigo: mail.get(email) } })));
      assert.ok(results.some(r => r.status === 200));
      assert.equal((await admin.query('SELECT email_verificado FROM usuarios WHERE email=$1', [email])).rows[0].email_verificado, true);
      const login = await request('/auth/login', { body: { email, senha: env.TEST_ADMIN_SENHA } });
      assert.equal(login.status, 200); assert.ok(login.cookie);
      assert.equal((await request('/auth/me', { token: login.data.token })).status, 200);
      const renewed = await request('/auth/refresh', { body: {}, cookie: login.cookie });
      assert.equal(renewed.status, 200); assert.notEqual(renewed.cookie, login.cookie);
      assert.equal((await request('/auth/logout', { body: {}, cookie: renewed.cookie })).status, 200);
      assert.equal((await request('/auth/me', { token: renewed.data.token })).status, 401);
      assert.equal((await request('/auth/refresh', { body: {}, cookie: renewed.cookie })).status, 401);
    });
    await check('sessões revogadas, expiradas, replay e conta desativada', async () => {
      const rotating = await sessions.criarSessaoRefresh(auth, b.id, passwordHash);
      const next = await sessions.renovarSessaoRefresh(auth, rotating.token); assert.ok(next.token);
      assert.deepEqual(await sessions.renovarSessaoRefresh(auth, rotating.token), { concorrente: true });
      await admin.query("UPDATE sessoes_refresh_usados SET used_at=now()-interval '6 seconds' WHERE token_hash=$1", [sessions.hashToken(rotating.token)]);
      assert.deepEqual(await sessions.renovarSessaoRefresh(auth, rotating.token), { replay: true });
      assert.equal(await sessions.renovarSessaoRefresh(auth, next.token), null);
      await assert.rejects(comAtor({ ...b, sessionId: rotating.sessionId }, c => c.query('SELECT 1')), { codigo: 'SESSAO_INVALIDA' });
      const expired = await sessions.criarSessaoRefresh(auth, b.id, passwordHash);
      await admin.query("UPDATE sessoes_refresh SET expires_at=now()-interval '1 second' WHERE session_id=$1", [expired.sessionId]);
      assert.equal(await sessions.renovarSessaoRefresh(auth, expired.token), null);
      await admin.query('UPDATE usuarios SET ativo=false WHERE id=$1', [b.id]);
      await assert.rejects(visible(b), { codigo: 'SESSAO_INVALIDA' });
      await admin.query('UPDATE usuarios SET ativo=true WHERE id=$1', [b.id]);
      await admin.query('UPDATE sessoes_refresh SET revoked_at=now() WHERE session_id=$1', [a.sessionId]);
      await assert.rejects(visible(a), { codigo: 'SESSAO_INVALIDA' });
      await admin.query('UPDATE sessoes_refresh SET revoked_at=NULL WHERE session_id=$1', [a.sessionId]);
    });
    await check('conta legada, código expirado e mudança de e-mail invalidam acesso', async () => {
      const legacyEmail = `homolog-legacy-${run}@example.com`;
      const { rows: [legacy] } = await admin.query("INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Legado',$1,$2,'usuario') RETURNING id", [legacyEmail,passwordHash]);
      const legacyLogin = await request('/auth/login', { body: { email: legacyEmail, senha: env.TEST_ADMIN_SENHA } });
      assert.equal(legacyLogin.status, 403); assert.ok(mail.has(legacyEmail));
      await admin.query("UPDATE verificacoes_email SET criado_em=now()-interval '20 minutes',expira_em=now()-interval '1 second' WHERE usuario_id=$1", [legacy.id]);
      const verification = require('../backend/services/verificacaoEmail');
      assert.equal((await verification.verificarCodigo(legacyEmail, mail.get(legacyEmail))).estado, 'CODE_EXPIRED');
      assert.equal((await admin.query('SELECT email_verificado FROM usuarios WHERE id=$1', [legacy.id])).rows[0].email_verificado, false);
      await admin.query("UPDATE verificacoes_email SET criado_em=now()-interval '11 minutes' WHERE usuario_id=$1", [legacy.id]);
      await verification.solicitarCodigo(legacyEmail);
      assert.equal((await verification.verificarCodigo(legacyEmail, mail.get(legacyEmail))).estado, 'EMAIL_VERIFIED');
      const legacySession = await sessions.criarSessaoRefresh(auth, legacy.id, passwordHash);
      const identity = { id: legacy.id, sessionId: legacySession.sessionId };
      await comAtor(identity, c => c.query('UPDATE usuarios SET email=$1 WHERE id=$2', [`homolog-changed-${run}@example.com`,legacy.id]));
      const changed = (await admin.query('SELECT email_verificado,(SELECT bool_and(revoked_at IS NOT NULL) FROM sessoes_refresh WHERE usuario_id=$1) AS revoked FROM usuarios WHERE id=$1', [legacy.id])).rows[0];
      assert.deepEqual(changed, { email_verificado: false, revoked: true });
      await assert.rejects(comAtor(identity, c => c.query('SELECT 1')), { codigo: 'SESSAO_INVALIDA' });
    });
    await check('admin HTTP, desativação/reativação e expiração durante transação', async () => {
      const adminLogin = await request('/auth/login', { body: { email: adm.email, senha: env.TEST_ADMIN_SENHA } });
      assert.equal(adminLogin.status, 200);
      const token = adminLogin.data.token;
      const overview = await request('/dashboard', { token });
      assert.equal(overview.status, 200);
      const totals = await comAtor(adm, async c => (await c.query('SELECT (SELECT count(*)::int FROM propriedades) AS propriedades,(SELECT count(*)::int FROM animais) AS animais,(SELECT coalesce(sum(valor),0) FROM despesas) AS despesas,(SELECT coalesce(sum(valor),0) FROM receitas) AS receitas')).rows[0]);
      assert.equal(Number(overview.data.resumo.propriedades), totals.propriedades);
      assert.equal(Number(overview.data.resumo.animais), totals.animais);
      assert.equal(Number(overview.data.resumo.total_despesas), Number(totals.despesas));
      assert.equal(Number(overview.data.resumo.total_receitas), Number(totals.receitas));
      assert.equal((await request(`/usuarios/${b.id}/ativo`, { method: 'PUT', token, body: { ativo: false } })).status, 200);
      await assert.rejects(visible(b), { codigo: 'SESSAO_INVALIDA' });
      assert.equal((await request(`/usuarios/${b.id}/ativo`, { method: 'PUT', token, body: { ativo: true } })).status, 200);
      await assert.rejects(visible(b), { codigo: 'SESSAO_INVALIDA' });
      const replacement = await sessions.criarSessaoRefresh(auth, b.id, passwordHash);
      b.sessionId = replacement.sessionId; b.refresh = replacement.token;
      assert.deepEqual(await visible(b), [fb.prop]);
      await comAtor(a, async c => {
        await admin.query("UPDATE sessoes_refresh SET expires_at=now()-interval '1 second' WHERE session_id=$1", [a.sessionId]);
        assert.equal((await c.query('SELECT id FROM propriedades')).rowCount, 0);
      });
      await admin.query("UPDATE sessoes_refresh SET expires_at=now()+interval '1 hour' WHERE session_id=$1", [a.sessionId]);
      assert.deepEqual(await visible(a), [fa.prop]);
    });

    async function benchmark(label) {
      const samples = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await comAtor(a, async c => {
          await c.query('SELECT p.id,count(a.id)::int AS animais FROM propriedades p LEFT JOIN animais a ON a.propriedade_id=p.id GROUP BY p.id ORDER BY p.id');
          await c.query('SELECT a.id,l.nome FROM animais a LEFT JOIN animais_lotes al ON al.animal_id=a.id LEFT JOIN lotes l ON l.id=al.lote_id ORDER BY a.id');
          await c.query('SELECT sum(valor) FROM despesas WHERE propriedade_id=$1', [fa.prop]);
          assert.equal((await c.query('UPDATE despesas SET valor=valor WHERE id=$1', [fa.despesa])).rowCount, 1);
        });
        samples.push(performance.now() - start);
      }
      samples.sort((x, y) => x - y);
      report.measurements[label] = { samples: 20, p50Ms: samples[9], p95Ms: samples[18], maxMs: samples[19] };
      const login = await request('/auth/login', { body: { email: a.email, senha: env.TEST_ADMIN_SENHA } });
      assert.equal(login.status, 200);
      const refresh = await request('/auth/refresh', { body: {}, cookie: login.cookie });
      assert.equal(refresh.status, 200);
      const routes = {};
      for (const route of ['/propriedades','/animais','/dashboard','/despesas','/receitas']) {
        const response = await request(route, { token: refresh.data.token });
        assert.equal(response.status, 200); routes[route] = response.durationMs;
      }
      report.measurements[label].http = { loginMs: login.durationMs, refreshMs: refresh.durationMs, routes };
      assert.equal((await request('/auth/logout', { body: {}, cookie: refresh.cookie })).status, 200);
    }
    await check('benchmark e rollback com flags/grants/policies, reativação e equivalência de ACLs', async () => {
      await benchmark('rlsOn');
      await confirmarDestino(admin, alvo);
      await admin.query(sqlFile('rollback/019_rls_rollback_dev.sql'));
      try {
        const state = await snapshot(admin);
        fs.writeFileSync(path.join(output, 'remote-rollback-019.json'), JSON.stringify(state, null, 2));
        assert.deepEqual(state.tables.filter(t => t.relrowsecurity).map(t => t.relname), ['verificacoes_email']);
        assert.ok((await pool.query('SELECT id FROM propriedades')).rowCount >= 2);
        await pool.query('SELECT senha FROM usuarios LIMIT 0');
        await pool.query('SELECT id FROM verificacoes_email LIMIT 0');
        await benchmark('rlsOff');
      } finally {
        await confirmarDestino(admin, alvo);
        await admin.query(sqlFile('migrations/019_rls_ativacao.sql'));
      }
      assert.deepEqual(await snapshot(admin), active);
      assert.deepEqual(await visible(a), [fa.prop]); assert.deepEqual(await visible(b), [fb.prop]);
      child('scripts/check-security-readonly.js', process.env);
    });
    await check('exclusão de propriedade com dependências e cascatas mantém B intacto', async () => {
      const { excluirPropriedadeComDados } = require('../backend/services/impactoExclusao');
      await comAtor(a, c => excluirPropriedadeComDados(fa.prop, { usuarioId: a.id, perfil: a.perfil }, c), { finalidade: 'exclusao' });
      assert.equal((await admin.query('SELECT id FROM propriedades WHERE id=$1', [fa.prop])).rowCount, 0);
      for (const [table, key] of [['animais','animal'],['animais','mom'],['lotes','lote'],['pesagens','pesagem'],['desmamas','desmama'],['vacinacoes','vacinacao'],['despesas','despesa'],['receitas','receita'],['producoes_leiteiras','leite']]) {
        assert.equal((await admin.query(`SELECT id FROM ${table} WHERE id=$1`, [fa[key]])).rowCount, 0);
        assert.equal((await admin.query(`SELECT id FROM ${table} WHERE id=$1`, [fb[key]])).rowCount, 1);
      }
      assert.equal((await admin.query('SELECT * FROM animais_lotes WHERE animal_id=$1', [fa.animal])).rowCount, 0);
      assert.deepEqual(await visible(b), [fb.prop]);
    });
    report.completed = true; report.checkGroups = checks;
    console.log(`OK homologação remota: ${checks} grupos, PostgreSQL 17 e Supavisor transacional`);
  } finally {
    report.finishedAt = new Date().toISOString(); report.checkGroups = checks;
    fs.writeFileSync(path.join(output, 'remote-results.json'), JSON.stringify(report, null, 2));
    if (server) await new Promise(resolve => server.close(resolve));
    await Promise.allSettled([pool?.end(), auth?.end(), admin.end()]);
  }
}
main().catch(error => {
  console.error('Runner remoto interrompido:', error.code || error.name, error.constraint || '', error.checkName || 'preparação');
  // Somente posições de código: não imprimir actual/expected, binds ou tokens.
  console.error(error.stack?.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 3).join('\n') || '');
  process.exitCode = 1;
});
