const crypto = require("crypto");
const { obterPoolAutenticacao } = require("../database/poolAutenticacao");
const { registrarErro } = require("../utils/log");

function hashChave(chave) {
  return crypto.createHash("sha256").update(String(chave)).digest("hex");
}

async function consumirLimite({ escopo, chave, limite, janelaMs, executor = obterPoolAutenticacao() }) {
  const agora = Date.now();
  const inicioMs = Math.floor(agora / janelaMs) * janelaMs;
  const janelaInicio = new Date(inicioMs);
  const janelaFim = new Date(inicioMs + janelaMs);
  const chaveHash = hashChave(chave);

  const resultado = await executor.query(
    "SELECT bovitrack_seg.consumir_limite($1,$2,$3,$4) AS contador",
    [escopo, chaveHash, janelaInicio, janelaFim],
  );

  if (Math.random() < 0.01) {
    await executor.query("SELECT bovitrack_seg.limpar_limites()")
      .catch((erro) => registrarErro("limpeza_limites_erro", erro));
  }

  return {
    permitido: resultado.rows[0].contador <= limite,
    restante: Math.max(0, limite - resultado.rows[0].contador),
    retryAfter: Math.max(1, Math.ceil((janelaFim.getTime() - agora) / 1000)),
    chaveHashPrefixo: chaveHash.slice(0, 12),
  };
}

module.exports = { consumirLimite, hashChave };
