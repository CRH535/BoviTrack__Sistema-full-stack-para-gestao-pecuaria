const { verificacaoEmailObrigatoria } = require("../config/email");
const { obterPoolAutenticacao } = require("../database/poolAutenticacao");

function conferirPoliticaEmail(valorBanco) {
  if (valorBanco !== verificacaoEmailObrigatoria()) {
    const erro = new Error("Configuracao de autenticacao indisponivel");
    erro.status = 503;
    erro.codigo = "EMAIL_POLICY_MISMATCH";
    throw erro;
  }
}

async function politicaEmail(req, res, next) {
  try {
    const {
      rows: [config],
    } = await obterPoolAutenticacao().query(
      "SELECT bovitrack_seg.email_verificacao_obrigatoria() AS obrigatoria",
    );
    conferirPoliticaEmail(config?.obrigatoria);
    next();
  } catch {
    res
      .status(503)
      .json({
        codigo: "AUTH_CONFIG_UNAVAILABLE",
        mensagem: "Autenticacao temporariamente indisponivel",
      });
  }
}

module.exports = { conferirPoliticaEmail, politicaEmail };
