// Todas as dependencias de banco sao substituidas; nenhuma conexao e aberta.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://teste:teste@127.0.0.1:5432/teste";
process.env.DB_SSL = "disable";
process.env.JWT_SECRET ||= "chave-exclusiva-dos-testes-offline";

const assert = require("node:assert/strict");
const express = require("express");
const pool = require("../database/pool");
const { encerrarSessaoRefresh } = require("../services/sessoes");
const { alterarAtivoUsuario, criarUsuarioComum } = require("../services/usuarios");
const {
  converterId, normalizarNumeroFinito, normalizarPaginacao,
  normalizarEstado, normalizarPesagem, normalizarProducaoLeiteira,
  normalizarDesmama,
  dataHojeNoFuso,
} = require("../utils/validacoes");

function bancoFake(responder) {
  const consultas = [];
  let liberado = false;
  return {
    consultas,
    get liberado() { return liberado; },
    async connect() {
      return {
        async query(sql, valores) {
          consultas.push({ sql, valores });
          return responder(sql, valores);
        },
        release() { liberado = true; },
      };
    },
  };
}

async function testarSessoes() {
  let revogado;
  const banco = bancoFake(async (sql, valores) => {
    if (sql.includes("JOIN sessoes_refresh_usados")) return { rows: [{ id: 17 }] };
    if (sql.startsWith("UPDATE sessoes_refresh")) revogado = valores[0];
    return { rows: [] };
  });
  await encerrarSessaoRefresh(banco, "cookie-rotacionado".repeat(3));
  assert.equal(revogado, 17, "logout deve revogar a sessao associada ao cookie antigo");
  assert.equal(banco.consultas[0].sql, "BEGIN");
  assert.equal(banco.consultas.at(-1).sql, "COMMIT");
  assert.equal(banco.liberado, true);

  const comFalha = bancoFake(async (sql) => {
    if (sql.includes("JOIN sessoes_refresh_usados")) throw new Error("falha simulada");
    return { rows: [] };
  });
  await assert.rejects(encerrarSessaoRefresh(comFalha, "cookie"), /falha simulada/);
  assert.equal(comFalha.consultas.at(-1).sql, "ROLLBACK");
  assert.equal(comFalha.liberado, true);

  let ativo = true;
  let revogacoes = 0;
  const usuarios = bancoFake(async (sql, valores) => {
    if (sql.startsWith("SELECT")) return { rows: [{ id: 9, perfil: "usuario" }] };
    if (sql.startsWith("UPDATE usuarios")) { ativo = valores[0]; return { rows: [{ id: 9, ativo }] }; }
    if (sql.includes("USUARIO_DESATIVADO")) revogacoes++;
    return { rows: [] };
  });
  assert.equal((await alterarAtivoUsuario(9, false, usuarios)).ativo, false);
  await alterarAtivoUsuario(9, true, usuarios);
  assert.equal(revogacoes, 1, "reativacao nao deve desfazer revogacao anterior");
  const admin = bancoFake(async () => ({ rows: [{ id: 1, perfil: "admin" }] }));
  await assert.rejects(alterarAtivoUsuario(1, false, admin), { status: 403 });
  assert.equal(admin.consultas.at(-1).sql, "ROLLBACK");
}

async function testarHttpSemBanco() {
  const queryOriginal = pool.query;
  const consultas = [];
  pool.query = async (sql, valores) => {
    consultas.push({ sql, valores });
    if (sql.includes("AS total_receitas")) throw Object.assign(new Error("tabela ausente simulada"), { code: "42P01" });
    if (sql.includes("AS bezerros_aleitamento")) {
      return { rows: [{ propriedades: 1, animais: 1, lotes: 0, vacinas: 0, total_despesas: "10", bezerros_aleitamento: 0, desmamas_planejadas: 0, desmamas_proximas: 0, desmamados_ano: 0, animais_sem_pesagem_recente: 0 }] };
    }
    // Nenhum dos IDs privados do teste pertence ao usuario simulado.
    return { rows: [], rowCount: 0 };
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.usuario = { id: 7, perfil: "usuario" }; next(); });
  for (const nome of ["propriedades", "animais", "lotes", "vacinas", "vacinacoes", "despesas", "receitas"]) {
    app.use(require(`../routes/${nome}Routes`));
  }
  app.use(require("../routes/dashboardRoutes"));
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, "127.0.0.1", () => resolve(instancia));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const post = (rota, body, method = "POST") => fetch(base + rota, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    const casos = [
      ["/propriedades", { nome: "x".repeat(101), cidade: "Teste", estado: "SP", area: 10 }],
      ["/propriedades", { nome: "Teste", cidade: "Teste", estado: "ZZ", area: 10 }],
      ["/propriedades", { nome: "Teste", cidade: "Teste", estado: "SP", area: 100000000 }],
      ["/animais", { nome: "Teste", especie: "x".repeat(51), sexo: "F", propriedade_id: 1 }],
      ["/lotes", { nome: "Teste", descricao: "x".repeat(256), propriedade_id: 1 }],
      ["/vacinas", { nome: "Teste", fabricante: "x".repeat(101) }],
      ["/vacinacoes", { animal_id: 1, vacina_id: 1, data_aplicacao: "2026-01-01", observacao: "x".repeat(256) }],
      ["/despesas", { descricao: "Teste", categoria: "Teste", valor: 100000000, data: "2026-01-01", propriedade_id: 1 }],
      ["/receitas", { descricao: "Teste", categoria: "Teste", valor: 1000000000000, data: "2026-01-01", propriedade_id: 1 }],
    ];
    for (const [rota, body] of casos) assert.equal((await post(rota, body)).status, 400, rota);
    assert.equal(consultas.length, 0, "dados invalidos devem ser rejeitados antes do banco");
    for (const rota of ["vacinacoes", "despesas", "receitas"]) {
      consultas.length = 0;
      assert.equal((await post(`/${rota}/123`, {}, "PUT")).status, 404);
      assert.equal(consultas.length, 1, "recurso alheio deve ser filtrado antes das novas referencias");
    }
    for (const id of ["1e0", "0x1", "2147483648"]) {
      assert.equal((await fetch(`${base}/propriedades/${id}`)).status, 400);
    }
    const dashboard = await fetch(`${base}/dashboard`);
    assert.equal(dashboard.status, 200);
    const dados = await dashboard.json();
    assert.equal(dados.resumo.total_receitas, null);
    assert.equal(dados.resumo.lucro_liquido, null);
    assert.equal(dados.resumo.total_despesas, 10);
    assert.equal(dados.receitas_disponiveis, false);
  } finally {
    pool.query = queryOriginal;
    await new Promise((resolve) => servidor.close(resolve));
  }
}

(async () => {
  for (const id of [true, false, [], [1], {}, "1e0", "0x1", "", " ", "1.0", 2147483648, Number.MAX_SAFE_INTEGER]) {
    assert.equal(converterId(id), null, `ID invalido: ${JSON.stringify(id)}`);
  }
  assert.equal(converterId("2147483647"), 2147483647);
  for (const numero of [null, true, false, [], [1], {}, "", " ", "0x10", "1e2", Infinity]) {
    assert.ok(normalizarNumeroFinito(numero, "Valor").erro);
  }
  assert.equal(normalizarNumeroFinito("123.45", "Valor").valor, 123.45);
  for (const page of [true, [1], "1e0", "2147483648", "9007199254740991"]) assert.ok(normalizarPaginacao({ page }).erro);
  assert.equal(normalizarEstado(" sp ").valor, "SP");
  assert.ok(normalizarEstado("ZZ").erro);
  const fusoAnterior = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = "America/Sao_Paulo";
  assert.equal(dataHojeNoFuso(new Date("2026-01-02T01:00:00Z")), "2026-01-01");
  if (fusoAnterior === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = fusoAnterior;
  assert.ok(normalizarPesagem({ data_pesagem: "2026-01-01", peso_kg: true, tipo_pesagem: "ROTINA" }).erro);
  assert.ok(normalizarPesagem({ data_pesagem: "2026-01-01", peso_kg: 100, tipo_pesagem: "ROTINA", lote_id: false }).erro);
  assert.ok(normalizarProducaoLeiteira({ data: "2026-01-01", turno: "manha", quantidade_litros: [1] }).erro);
  assert.ok(normalizarDesmama({ data_planejada: "2026-01-01", tipo_desmama: "TEMPORARIA", status: true }).erro);
  for (const body of [undefined, [], { nome: "Teste", email: "t@e.st", senha: "senha-teste", usuario_id: 1 }]) {
    await assert.rejects(criarUsuarioComum(body), { status: 400 });
  }
  await testarSessoes();
  await testarHttpSemBanco();
  console.log("Regressoes backend offline: validacao HTTP, ownership, logout rotacionado e revogacao validados.");
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
