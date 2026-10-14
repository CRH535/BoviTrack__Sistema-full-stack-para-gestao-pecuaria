const pool = require("../database/pool");
const { verificarTokenAcesso } = require("../services/sessoes");
const { registrarErro } = require("../utils/log");

async function autenticar(req, res, next) {
  const authorization = req.headers.authorization;

  if (!/^Bearer\s+/i.test(authorization || "")) {
    return res
      .status(401)
      .json({ mensagem: "Token de autenticação não informado" });
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res
      .status(401)
      .json({ mensagem: "Token de autenticação não informado" });
  }

  let dados;

  try {
    dados = verificarTokenAcesso(token);
  } catch (erro) {
    if (erro.name === "TokenExpiredError") {
      return res.status(401).json({
        mensagem: "Token de autenticação expirado",
        codigo: "TOKEN_EXPIRADO",
      });
    }

    if (erro.name !== "JsonWebTokenError") registrarErro("jwt_invalido", erro, req);

    return res.status(401).json({
      mensagem: "Token de autenticação inválido",
      codigo: "TOKEN_INVALIDO",
    });
  }

  try {
    const usuarioId = Number(dados.sub);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !dados.sid) {
      return res.status(401).json({
        mensagem: "Token de autenticação inválido",
        codigo: "TOKEN_INVALIDO",
      });
    }

    const resultado = await pool.query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.email_verificado
         FROM usuarios u
         JOIN sessoes_refresh sr
           ON sr.usuario_id = u.id
          AND sr.session_id = $2
          AND sr.revoked_at IS NULL
          AND sr.expires_at > CURRENT_TIMESTAMP
        WHERE u.id = $1
          AND u.ativo = TRUE`,
      [usuarioId, dados.sid],
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        mensagem: "Sessão inválida ou usuário desativado",
        codigo: "SESSAO_INVALIDA",
      });
    }

    if (resultado.rows[0].email_verificado !== true) {
      return res.status(403).json({ codigo: 'EMAIL_NOT_VERIFIED', mensagem: 'Verifique seu e-mail. Entre novamente para continuar.' });
    }
    req.usuario = resultado.rows[0];
    req.autenticacao = {
      sessionId: dados.sid,
      autenticadoEm: dados.auth_time,
    };
    next();
  } catch (erro) {
    registrarErro("validacao_sessao_falhou", erro, req);
    return res.status(500).json({ mensagem: "Erro ao validar sessão" });
  }
}

function somenteAdmin(req, res, next) {
  if (req.usuario.perfil !== "admin") {
    return res.status(403).json({ mensagem: "Acesso restrito ao administrador" });
  }

  next();
}

function exigirAutenticacaoRecente(maximoSegundos = 15 * 60) {
  return function autenticacaoRecente(req, res, next) {
    const autenticadoEm = Number(req.autenticacao?.autenticadoEm);
    const idade = Math.floor(Date.now() / 1000) - autenticadoEm;
    if (!Number.isFinite(autenticadoEm) || idade < 0 || idade > maximoSegundos) {
      return res.status(403).json({
        mensagem: "Entre novamente antes de realizar esta operação administrativa",
        codigo: "REAUTENTICACAO_NECESSARIA",
      });
    }
    next();
  };
}

module.exports = { autenticar, somenteAdmin, exigirAutenticacaoRecente };
