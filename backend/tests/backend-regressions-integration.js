// Escritas permitidas somente em fixture local explicitamente configurada.
const assert = require("node:assert/strict");
const configuracaoUrl = new URL(process.env.DATABASE_URL || "http://ausente.invalid");
if (process.env.ALLOW_TEST_DB_WRITES !== "true" || process.env.NODE_ENV === "production" ||
    configuracaoUrl.search || configuracaoUrl.hash ||
    !["postgres:", "postgresql:"].includes(configuracaoUrl.protocol) ||
    !/^\/bovitrack_test(?:_|$)/.test(configuracaoUrl.pathname) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(configuracaoUrl.hostname)) {
  throw new Error("Regressoes exigem ALLOW_TEST_DB_WRITES=true e DATABASE_URL local explicita fora de producao");
}
process.env.DB_POOL_MAX = "6";
const bcrypt = require("bcryptjs");
const { app, pool } = require("../app");
const { alterarAtivoUsuario } = require("../services/usuarios");
const { excluirUsuarioComDados } = require("../services/impactoExclusao");
const { encerrarSessaoRefresh, renovarSessaoRefresh, hashToken } = require("../services/sessoes");
let servidor;
let base;
let usuarioId;
let token;
let verificacoes = 0;

function confirmar(nome, valor) {
  assert.ok(valor, nome);
  verificacoes++;
  console.log(`OK ${nome}`);
}

async function requisitar(rota, { metodo = "GET", corpo, cookie, autenticacao = token } = {}) {
  const headers = {};
  if (autenticacao) headers.Authorization = `Bearer ${autenticacao}`;
  if (corpo) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: res.status, dados: await res.json(), cookie: res.headers.getSetCookie().find((c) => c.startsWith("bovitrack_refresh="))?.split(";")[0] };
}

async function esperarLocks(tabela, minimo = 1) {
  const prazo = Date.now() + 5000;
  while (Date.now() < prazo) {
    const resultado = await pool.query(
      `SELECT COUNT(*)::integer AS quantidade FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query ILIKE $1 AND pid <> pg_backend_pid()`,
      [`%${tabela}%`],
    );
    if (resultado.rows[0].quantidade >= minimo) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Operacao concorrente nao aguardou lock de ${tabela}`);
}

async function testarLogoutConcorrente(cookie) {
  const refresh = decodeURIComponent(cookie.split("=")[1]);
  const bloqueador = await pool.connect();
  let renovacao;
  let logout;
  try {
    await bloqueador.query("BEGIN");
    await bloqueador.query("SELECT id FROM sessoes_refresh WHERE token_hash=$1 FOR UPDATE", [hashToken(refresh)]);
    renovacao = renovarSessaoRefresh(pool, refresh);
    await esperarLocks("sessoes_refresh");
    logout = encerrarSessaoRefresh(pool, refresh);
    await esperarLocks("sessoes_refresh", 2);
    await bloqueador.query("COMMIT");
    const sessao = await renovacao;
    await logout;
    const estado = await pool.query("SELECT revoked_at FROM sessoes_refresh WHERE session_id=$1", [sessao.sessionId]);
    confirmar("logout simultaneo ao refresh revoga a sessao rotacionada", Boolean(estado.rows[0].revoked_at));
    confirmar("token do login encerrado e bloqueado imediatamente", (await requisitar("/auth/me")).status === 401);
  } finally {
    await bloqueador.query("ROLLBACK").catch(() => {});
    bloqueador.release();
    await Promise.allSettled([renovacao, logout]);
  }
}

async function testarDesmamaConcorrente(id, destino) {
  const bloqueador = await pool.connect();
  let alteracao;
  try {
    await bloqueador.query("BEGIN");
    await bloqueador.query("SELECT id FROM desmamas WHERE id=$1 FOR UPDATE", [id]);
    alteracao = requisitar(`/desmamas/${id}`, {
      metodo: "PUT", corpo: { data_planejada: "2026-01-02", tipo_desmama: "CONVENCIONAL", status: "PLANEJADA" },
    });
    await esperarLocks("desmamas");
    await bloqueador.query(
      "UPDATE desmamas SET status=$1::text, data_desmama=CASE WHEN $1::text='CONCLUIDA' THEN '2026-01-01'::date ELSE NULL END WHERE id=$2",
      [destino, id],
    );
    await bloqueador.query("COMMIT");
    confirmar(`edicao concorrente nao reabre desmama ${destino}`, (await alteracao).status === 409);
    const estado = await pool.query("SELECT status FROM desmamas WHERE id=$1", [id]);
    confirmar(`status ${destino} permanece no banco`, estado.rows[0].status === destino);
  } finally {
    await bloqueador.query("ROLLBACK").catch(() => {});
    bloqueador.release();
    await Promise.allSettled([alteracao]);
  }
}

(async () => {
  const email = `regressoes-${Date.now()}-${Math.random().toString(16).slice(2)}@bovitrack.local`;
  const senha = "Regressoes#Fixture2026";
  const resultado = await pool.query(
    "INSERT INTO usuarios(nome,email,senha,perfil,ativo) VALUES ('Fixture regressoes',$1,$2,'usuario',TRUE) RETURNING id",
    [email, await bcrypt.hash(senha, 4)],
  );
  usuarioId = resultado.rows[0].id;
  servidor = await new Promise((resolve) => { const instancia = app.listen(0, "127.0.0.1", () => resolve(instancia)); });
  base = `http://127.0.0.1:${servidor.address().port}`;
  async function login() {
    const res = await requisitar("/auth/login", { metodo: "POST", corpo: { email, senha }, autenticacao: null });
    assert.equal(res.status, 200);
    token = res.dados.token;
    return res;
  }
  let sessao = await login();
  await testarLogoutConcorrente(sessao.cookie);
  sessao = await login();
  await alterarAtivoUsuario(usuarioId, false);
  confirmar("desativacao bloqueia access token", (await requisitar("/auth/me")).status === 401);
  await alterarAtivoUsuario(usuarioId, true);
  confirmar("reativacao nao recupera access token anterior", (await requisitar("/auth/me")).status === 401);
  confirmar("reativacao nao recupera refresh anterior", (await requisitar("/auth/refresh", { metodo: "POST", cookie: sessao.cookie })).status === 401);
  await login();

  const propriedade = await requisitar("/propriedades", { metodo: "POST", corpo: { nome: "Fixture", cidade: "Teste", estado: "sp", area: 10 } });
  assert.equal(propriedade.status, 201);
  const propriedadeId = propriedade.dados.propriedade.id;
  const animal = await requisitar("/animais", { metodo: "POST", corpo: { nome: "Fixture", especie: "Bovino", sexo: "M", propriedade_id: propriedadeId } });
  assert.equal(animal.status, 201);
  const animalId = animal.dados.animal.id;
  const lotes = [];
  for (const nome of ["Lote A", "Lote B"]) {
    const lote = await requisitar("/lotes", { metodo: "POST", corpo: { nome, propriedade_id: propriedadeId } });
    assert.equal(lote.status, 201);
    lotes.push(lote.dados.lote.id);
    assert.equal((await requisitar(`/lotes/${lote.dados.lote.id}/animais`, { metodo: "POST", corpo: { animal_id: animalId } })).status, 201);
  }
  assert.equal((await requisitar(`/animais/${animalId}/pesagens`, { metodo: "POST", corpo: { data_pesagem: "2026-01-01", peso_kg: 100, tipo_pesagem: "ROTINA" } })).status, 201);
  const resumo = await requisitar(`/animais/${animalId}/pesagens/resumo`);
  confirmar("animal de dois lotes participa dos dois indicadores", resumo.status === 200 && resumo.dados.comparacao_lotes.length === 2 && resumo.dados.comparacao_lotes.every((l) => l.peso_medio === 100 && l.animais_com_pesagem === 1));
  for (const destino of ["CONCLUIDA", "CANCELADA"]) {
    const criada = await requisitar(`/animais/${animalId}/desmamas`, { metodo: "POST", corpo: { data_planejada: "2026-01-01", tipo_desmama: "CONVENCIONAL", status: "PLANEJADA" } });
    assert.equal(criada.status, 201);
    await testarDesmamaConcorrente(criada.dados.desmama.id, destino);
    await pool.query("DELETE FROM desmamas WHERE id=$1", [criada.dados.desmama.id]);
  }
  const hoje = (await pool.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date AS hoje", [process.env.APP_TIMEZONE || "America/Sao_Paulo"])).rows[0].hoje;
  await requisitar("/receitas", { metodo: "POST", corpo: { descricao: "Hoje", categoria: "Fixture", valor: 123.45, data: hoje, propriedade_id: propriedadeId } });
  const financeiro = await requisitar("/receitas/resumo?periodo=hoje");
  confirmar("resumo financeiro usa data APP_TIMEZONE", financeiro.status === 200 && financeiro.dados.receita_total === 123.45);
  confirmar("dashboard usa parametros de timezone validos", (await requisitar("/dashboard")).status === 200);
  confirmar("vacinacoes proximas aceita periodo todos com timezone", (await requisitar("/vacinacoes/proximas?periodo=todos")).status === 200);
  console.log(`${verificacoes} regressoes backend com PostgreSQL local validadas.`);
})().catch((erro) => { console.error(erro); process.exitCode = 1; }).finally(async () => {
  if (usuarioId) await excluirUsuarioComDados(usuarioId).catch((erro) => { console.error("Falha ao limpar fixture", erro.code); process.exitCode = 1; });
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
  await pool.end();
});
