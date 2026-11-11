require("dotenv").config();

const assert = require("assert/strict");
const pool = require("../database/pool");
const { transacao } = require("../database/contextoRls");

async function testarRollbackDaPropriedade() {
  const consultas = [];
  let liberado = false;
  const connectOriginal = pool.connect;
  const cliente = Object.assign(new (require('node:events').EventEmitter)(), {
    async query(sql) {
      const texto = String(sql).replace(/\s+/g, " ").trim();
      consultas.push(texto);

      if (texto === "BEGIN" || texto === "ROLLBACK" || texto === "COMMIT") {
        return { rows: [], rowCount: 0 };
      }
      if (texto.includes("FROM propriedades p") && texto.includes("FOR UPDATE")) {
        return {
          rows: [{ id: 10, nome: "Fazenda Teste", usuario_id: 7 }],
          rowCount: 1,
        };
      }
      if (texto.startsWith("SELECT")) {
        return { rows: [], rowCount: 0 };
      }
      if (texto.startsWith("DELETE FROM despesas")) {
        throw new Error("falha simulada");
      }

      return { rows: [], rowCount: 1 };
    },
    release() {
      liberado = true;
    },
  });

  pool.connect = async () => cliente;
  delete require.cache[require.resolve("../services/impactoExclusao")];
  const { excluirPropriedadeComDados } = require("../services/impactoExclusao");

  try {
    await assert.rejects(
      transacao(pool, (cliente) => excluirPropriedadeComDados(10, { usuarioId: 7, perfil: "usuario" }, cliente)),
      /falha simulada/,
    );
    assert.ok(consultas.includes("BEGIN"), "a transação deve iniciar");
    assert.ok(consultas.includes("ROLLBACK"), "a falha deve executar rollback");
    assert.ok(!consultas.includes("COMMIT"), "não pode confirmar uma transação com falha");
    assert.ok(liberado, "o client deve ser liberado no finally");
    assert.ok(
      consultas.every((sql) => !sql.startsWith("DELETE FROM vacinas")),
      "excluir propriedade não pode remover o cadastro de vacinas",
    );
  } finally {
    pool.connect = connectOriginal;
    delete require.cache[require.resolve("../services/impactoExclusao")];
  }
}

async function testarAutorizacaoDoPreview() {
  const { obterImpactoExclusaoPropriedade, obterImpactoExclusaoUsuario } =
    require("../services/impactoExclusao");
  const executorSemPropriedade = {
    query: async () => ({ rows: [], rowCount: 0 }),
  };

  await assert.rejects(
    obterImpactoExclusaoPropriedade(
      executorSemPropriedade,
      20,
      { usuarioId: 7, perfil: "usuario" },
    ),
    (erro) => erro.status === 404,
    "preview alheio deve parecer inexistente",
  );

  const executorAdmin = {
    query: async () => ({
      rows: [{ id: 1, nome: "Administrador", email: "admin@example.test", perfil: "admin" }],
      rowCount: 1,
    }),
  };
  await assert.rejects(
    obterImpactoExclusaoUsuario(executorAdmin, 1),
    (erro) => erro.status === 403,
    "conta administrativa deve continuar protegida",
  );
}

Promise.resolve()
  .then(testarRollbackDaPropriedade)
  .then(testarAutorizacaoDoPreview)
  .then(() => {
    console.log("OK preview protegido, rollback atômico e vacina preservada");
  })
  .catch((erro) => {
    console.error(erro.stack || erro.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
