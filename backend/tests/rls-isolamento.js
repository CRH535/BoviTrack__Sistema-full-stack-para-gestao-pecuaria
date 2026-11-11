const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fixture = require("./helpers/bancoFixture");
process.env.DB_POOL_MAX = "1";
const pool = require("../database/pool");
const { obterPoolAutenticacao } = require("../database/poolAutenticacao");
const { comAtor, transacao } = require("../database/contextoRls");
const { hashToken, renovarSessaoRefresh } = require("../services/sessoes");

const hex = () => randomBytes(32).toString("hex");

async function criarAtor(id, refresh = hex()) {
  const sessionId = hex();
  await fixture.query(
    `INSERT INTO sessoes_refresh(usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at)
     VALUES ($1,$2,$3,$4,now()+interval '1 hour',now())`, [id, hashToken(refresh), sessionId, hex()],
  );
  return { id, sessionId };
}

async function verificar() {
  const { rows: [{ id: adminId }] } = await fixture.query("SELECT id FROM usuarios WHERE perfil='admin'");
  const { rows: [{ id: produtorId }] } = await fixture.query("SELECT id FROM usuarios WHERE email='e2e-owner@example.test'");
  const { rows: [{ id: segundoId }] } = await fixture.query(
    `INSERT INTO usuarios(nome,email,senha,perfil,email_verificado,email_verificado_em)
     VALUES ('Segundo','rls-segundo@example.test','fixture','usuario',true,now()) RETURNING id`,
  );
  const admin = await criarAtor(adminId);
  const a = await criarAtor(produtorId);
  const b = await criarAtor(segundoId);
  const propriedade = async (ator, nome) => comAtor(ator, async (cliente) => (
    await cliente.query("INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ($1,'Teste','SP',1,$2) RETURNING id", [nome, ator.id])
  ).rows[0].id);
  const propA = await propriedade(a, "RLSTesteA");
  const propB = await propriedade(b, "RLSTesteB");

  const protegidas = await fixture.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND EXISTS (SELECT FROM pg_policy p WHERE p.polrelid=c.oid)
  `);
  assert.equal(protegidas.rowCount, 16);
  for (const sql of [
    "SELECT senha FROM usuarios", "UPDATE usuarios SET perfil='admin'",
    "UPDATE propriedades SET usuario_id=1", "SELECT token_hash FROM sessoes_refresh",
    "SELECT codigo_hash FROM verificacoes_email", "SELECT chave FROM bovitrack_seg.chaves_contexto",
    "SELECT * FROM bovitrack_seg.credencial_login('admin@example.test')",
    "SET ROLE bovitrack_rls_interno", "SET ROLE bovitrack_rls_identidade",
  ]) await assert.rejects(pool.query(sql), { code: "42501" });
  await assert.rejects(obterPoolAutenticacao().query("SELECT * FROM propriedades"), { code: "42501" });
  await assert.rejects(obterPoolAutenticacao().query("SELECT senha FROM usuarios"), { code: "42501" });
  await assert.rejects(transacao(obterPoolAutenticacao(), async (c) => {
    await c.query("SELECT bovitrack_seg.desafio()");
    const { rows: [{ senha }] } = await c.query("SELECT senha FROM bovitrack_seg.credencial_login('admin@example.test')");
    await c.query("SELECT bovitrack_seg.abrir_sessao($1,$2,$3,$4,$5,now()+interval '1 hour',now(),$6)",
      [admin.id, senha, hex(), hex(), hex(), hex()]);
  }), { code: "42501" });
  assert.equal((await pool.query("SELECT id FROM propriedades")).rowCount, 0);

  let assinatura;
  let pid;
  await comAtor(a, async (c) => {
    assert.equal((await c.query("SELECT id FROM propriedades WHERE id=$1", [propB])).rowCount, 0);
    assert.equal((await c.query("UPDATE propriedades SET nome='alheia' WHERE id=$1", [propB])).rowCount, 0);
    assert.equal((await c.query("DELETE FROM propriedades WHERE id=$1", [propB])).rowCount, 0);
    ({ assinatura, pid } = (await c.query("SELECT current_setting('bovitrack.assinatura') assinatura, pg_backend_pid() pid")).rows[0]);
  });
  assert.equal((await pool.query("SELECT current_setting('bovitrack.usuario_id',true) AS id")).rows[0].id, "");
  await transacao(pool, async (c) => {
    await c.query("SELECT bovitrack_seg.desafio()");
    await c.query(`SELECT set_config('bovitrack.usuario_id',$1,true),set_config('bovitrack.session_id',$2,true),
      set_config('bovitrack.assinatura',$3,true),set_config('bovitrack.finalidade','dominio',true)`,
    [String(a.id), a.sessionId, assinatura]);
    assert.equal((await c.query("SELECT pg_backend_pid() pid")).rows[0].pid, pid);
    assert.equal((await c.query("SELECT id FROM propriedades")).rowCount, 0);
  });

  const visiveis = (ator) => comAtor(ator, async (c) => (await c.query(
    "SELECT id FROM propriedades WHERE id IN ($1,$2) ORDER BY id", [propA, propB],
  )).rows.map((r) => r.id));
  assert.deepEqual(await Promise.all([visiveis(admin), visiveis(b), visiveis(a)]), [[propA, propB], [propB], [propA]]);
  await pool.query("CREATE TEMP TABLE propriedades(id integer); INSERT INTO pg_temp.propriedades VALUES (9999)");
  try {
    assert.deepEqual(await visiveis(a), [propA]);
  } finally {
    await pool.query("DROP TABLE pg_temp.propriedades");
  }
  await comAtor(a, async (c) => {
    assert.equal((await c.query("DELETE FROM propriedades WHERE id=$1", [propA])).rowCount, 0);
    await c.query("SET LOCAL bovitrack.finalidade='exclusao'");
    assert.equal((await c.query("SELECT id FROM propriedades")).rowCount, 0);
  });
  await fixture.query("UPDATE sessoes_refresh SET last_authenticated_at=now()-interval '16 minutes' WHERE session_id=$1", [admin.sessionId]);
  await assert.rejects(comAtor(admin, (c) => c.query("SELECT * FROM bovitrack_seg.alterar_ativo($1,false)", [b.id])),
    { code: "42501" });
  await assert.rejects(comAtor({ ...a, sessionId: b.sessionId }, visiveis), { codigo: "SESSAO_INVALIDA" });
  await assert.rejects(comAtor({ ...a, perfil: "admin" }, visiveis), { codigo: "SESSAO_INVALIDA" });
  await assert.rejects(comAtor(a, (c) => c.query(
    "INSERT INTO animais(nome,especie,propriedade_id) VALUES ('Negado','Bovino',$1)", [propB],
  )), { code: "42501" });
  await assert.rejects(comAtor(a, (c) => c.query(
    "INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ('Negado','Teste','SP',1,$1)", [b.id],
  )), { code: "42501" });

  const animalA = await comAtor(a, async (c) => (await c.query(
    "INSERT INTO animais(nome,especie,propriedade_id) VALUES ('Animal A','Bovino',$1) RETURNING id", [propA],
  )).rows[0].id);
  const { loteB, vacinaB } = await comAtor(b, async (c) => {
    const { rows: [{ id: loteB }] } = await c.query(
      "INSERT INTO lotes(nome,propriedade_id) VALUES ('Lote B',$1) RETURNING id", [propB],
    );
    const { rows: [{ id: vacinaB }] } = await c.query(
      "INSERT INTO vacinas(nome,usuario_id) VALUES ('Vacina B',$1) RETURNING id", [b.id],
    );
    await c.query("INSERT INTO despesas(descricao,categoria,valor,data,propriedade_id) VALUES ('Ração','Alimentação',1,current_date,$1)", [propB]);
    return { loteB, vacinaB };
  });
  for (const ator of [a, admin]) {
    await assert.rejects(comAtor(ator, (c) => c.query(
      "INSERT INTO animais_lotes(animal_id,lote_id) VALUES ($1,$2)", [animalA, loteB],
    )), { code: "23514", constraint: "animais_lotes_propriedade_consistente" });
    await assert.rejects(comAtor(ator, (c) => c.query(
      "INSERT INTO vacinacoes(animal_id,vacina_id,data_aplicacao) VALUES ($1,$2,current_date)", [animalA, vacinaB],
    )), { code: "23514", constraint: "vacinacoes_proprietario_consistente" });
  }
  for (const [ator, quantidade] of [[a, 0], [b, 1], [admin, 1]]) {
    await comAtor(ator, async (c) => {
      const consulta = "SELECT id, valor FROM despesas WHERE propriedade_id=$1";
      assert.equal((await c.query(consulta, [propB])).rowCount, quantidade);
      const { rows: [{ "QUERY PLAN": [plano] }] } = await c.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${consulta}`, [propB],
      );
      assert.equal(plano.Plan["Actual Rows"], quantidade);
      console.log(`Plano de despesas (${quantidade} linha visível): ${plano.Plan["Node Type"]}, ${plano["Execution Time"]} ms`);
    });
  }

  await assert.rejects(comAtor(a, async (c) => {
    await c.query("UPDATE propriedades SET nome='rollback' WHERE id=$1", [propA]);
    await c.query("SELECT 1/0");
  }), { code: "22012" });
  assert.equal((await fixture.query("SELECT nome FROM propriedades WHERE id=$1", [propA])).rows[0].nome, "RLSTesteA");
  await assert.rejects(comAtor(a, async (c) => {
    await c.query("SET LOCAL statement_timeout='20ms'");
    await c.query("SELECT pg_sleep(1)");
  }), { code: "57014" });
  assert.deepEqual(await visiveis(b), [propB]);

  await fixture.query("UPDATE sessoes_refresh SET revoked_at=now() WHERE session_id=$1", [a.sessionId]);
  await assert.rejects(visiveis(a), { codigo: "SESSAO_INVALIDA" });
  assert.equal((await pool.query("SELECT id FROM propriedades")).rowCount, 0);
  const refresh = hex();
  const rotativa = await criarAtor(b.id, refresh);
  const auth = obterPoolAutenticacao();
  const novaSessao = await renovarSessaoRefresh(auth, refresh);
  assert.equal(novaSessao.sessionId, rotativa.sessionId);
  assert.notEqual(novaSessao.token, refresh);
  assert.deepEqual(await renovarSessaoRefresh(auth, refresh), { concorrente: true });
  await fixture.query("UPDATE sessoes_refresh_usados SET used_at=now()-interval '6 seconds' WHERE token_hash=$1",
    [hashToken(refresh)]);
  assert.deepEqual(await renovarSessaoRefresh(auth, refresh), { replay: true });
  assert.equal(await renovarSessaoRefresh(auth, novaSessao.token), null);
  await assert.rejects(visiveis(rotativa), { codigo: "SESSAO_INVALIDA" });

  const refreshExpirado = hex();
  const expirada = await criarAtor(b.id, refreshExpirado);
  await fixture.query("UPDATE sessoes_refresh SET expires_at=now()-interval '1 second' WHERE session_id=$1",
    [expirada.sessionId]);
  assert.equal(await renovarSessaoRefresh(auth, refreshExpirado), null);
  await assert.rejects(visiveis(expirada), { codigo: "SESSAO_INVALIDA" });
  await fixture.query("DELETE FROM despesas WHERE propriedade_id=$1", [propB]);
  await fixture.query("DELETE FROM vacinas WHERE id=$1", [vacinaB]);
  await fixture.query("DELETE FROM lotes WHERE id=$1", [loteB]);
  await fixture.query("DELETE FROM animais WHERE id=$1", [animalA]);
  await fixture.query("DELETE FROM propriedades WHERE id IN ($1,$2)", [propA, propB]);
  await fixture.query("DELETE FROM sessoes_refresh WHERE session_id IN ($1,$2,$3)", [admin.sessionId, a.sessionId, b.sessionId]);
  await fixture.query("DELETE FROM usuarios WHERE id=$1", [b.id]);
  console.log("OK RLS: 16 tabelas, grants, A/B/admin, contexto assinado, rollback, timeout, replay e expiração");
}

verificar().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all([fixture.end(), pool.end(), obterPoolAutenticacao().end()]);
});
