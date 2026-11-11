const express = require("express");
const bcrypt = require("bcryptjs");
const { obterPoolAutenticacao } = require("../database/poolAutenticacao");
const { comAtor, identidadeDaRequisicao } = require("../database/contextoRls");
const { responderCriacaoUsuario } = require("../controllers/usuariosController");
const { autenticar } = require("../middleware/autenticacao");
const { protegerContraCsrf } = require("../middleware/csrf");
const { limitarRequisicoes } = require("../middleware/rateLimit");
const {
  criarSessaoRefresh,
  criarTokenAcesso,
  definirCookieRefresh,
  encerrarSessaoRefresh,
  encerrarTodasSessoes,
  lerRefreshToken,
  limparCookieRefresh,
  renovarSessaoRefresh,
} = require("../services/sessoes");
const { registrarErro, registrarEvento } = require("../utils/log");
const { obterIpCliente } = require("../utils/rede");
const { validarCamposPermitidos } = require("../utils/validacoes");
const { consumirLimite } = require("../services/limitesRequisicao");
const verificacaoEmail = require('../services/verificacaoEmail');
const { VERIFICACAO_EMAIL, verificacaoEmailObrigatoria } = require('../config/email');
const { politicaEmail } = require('../middleware/politicaEmail');

const router = express.Router();
const MINUTO = 60 * 1000;
const HASH_LOGIN_INEXISTENTE = "$2b$12$jjD8VPuhN1s7VpV2So/I9OW3DqBZCFmDMPPeCx8KbXhRUeoUrhh3m";

function emailNormalizado(req) {
  return typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase().slice(0, 255)
    : "email-invalido";
}

const limitarLoginConta = limitarRequisicoes({
  escopo: "LOGIN_CONTA",
  limite: 8,
  janelaMs: 15 * MINUTO,
  obterChave: (req) => `${obterIpCliente(req)}|${emailNormalizado(req)}`,
});
const limitarLoginIp = limitarRequisicoes({
  escopo: "LOGIN_IP",
  limite: 40,
  janelaMs: 15 * MINUTO,
  obterChave: (req) => obterIpCliente(req),
});
const limitarCadastro = limitarRequisicoes({
  escopo: "CADASTRO_IP",
  limite: 5,
  janelaMs: 60 * MINUTO,
  obterChave: (req) => obterIpCliente(req),
});
const limitarCadastroEmail = limitarRequisicoes({
  escopo: 'CADASTRO_EMAIL', limite: 5, janelaMs: 60 * MINUTO,
  obterChave: emailNormalizado,
});
const limitarEnvioIp = limitarRequisicoes({ escopo: 'EMAIL_ENVIO_IP', limite: VERIFICACAO_EMAIL.envioIpPorHora,
  janelaMs: 60 * MINUTO, obterChave: obterIpCliente });
const limitarRefresh = limitarRequisicoes({
  escopo: "REFRESH_SESSAO_IP",
  limite: 30,
  janelaMs: MINUTO,
  obterChave: (req) => `${obterIpCliente(req)}|${lerRefreshToken(req) || "sem-cookie"}`,
});

router.get('/auth/config', politicaEmail, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ verificacaoEmailObrigatoria: verificacaoEmailObrigatoria() });
});

router.post("/auth/cadastro", protegerContraCsrf, politicaEmail, limitarCadastro, limitarCadastroEmail,
  (req, res, next) => verificacaoEmailObrigatoria() ? limitarEnvioIp(req, res, next) : next(), async (req, res) => {
  await responderCriacaoUsuario(
    req,
    res,
    "Conta criada com sucesso. Agora você já pode entrar no BoviTrack.",
    { cadastroPublico: true },
  );
});

router.post("/auth/login", protegerContraCsrf, politicaEmail, limitarLoginIp, limitarLoginConta, async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["email", "senha"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const { email: emailRecebido, senha } = req.body;
    if (typeof emailRecebido !== "string" || typeof senha !== "string") {
      return res.status(400).json({ mensagem: "Email e senha são obrigatórios" });
    }

    const email = emailRecebido.trim().toLowerCase();
    if (email.length > 255 || Buffer.byteLength(senha, "utf8") > 72) {
      return res.status(401).json({ mensagem: "Credenciais inválidas" });
    }
    if (!email || !senha) {
      return res.status(400).json({ mensagem: "Email e senha são obrigatórios" });
    }

    const resultado = await obterPoolAutenticacao().query(
      "SELECT * FROM bovitrack_seg.credencial_login($1)",
      [email],
    );
    const usuario = resultado.rows[0];
    const comparacao = await bcrypt.compare(senha, usuario?.senha || HASH_LOGIN_INEXISTENTE);
    const senhaCorreta = Boolean(usuario && comparacao);

    if (!senhaCorreta) {
      registrarEvento("aviso", "login_falhou", {
        request_id: req.id,
        chave: emailNormalizado(req).slice(0, 3),
      });
      return res.status(401).json({ mensagem: "Email ou senha inválidos" });
    }
    // O limitador específico de admin não deve revelar a role em senha errada.
    // Tentativas sem credenciais válidas continuam nos limitadores conta/IP.
    if (usuario.perfil === "admin") {
      const limiteAdmin = await consumirLimite({
        escopo: "LOGIN_ADMIN",
        chave: `${obterIpCliente(req)}|${email}`,
        limite: 5,
        janelaMs: 15 * MINUTO,
      });
      if (!limiteAdmin.permitido) {
        res.setHeader("Retry-After", String(limiteAdmin.retryAfter));
        registrarEvento("aviso", "rate_limit_admin", { request_id: req.id });
        return res.status(429).json({ mensagem: "Muitas tentativas. Aguarde antes de tentar novamente" });
      }
    }
    if (!usuario.ativo) {
      return res.status(403).json({
        mensagem: "Usuário desativado. Entre em contato com o administrador",
      });
    }

    if (verificacaoEmailObrigatoria() && usuario.email_verificado !== true) {
      limparCookieRefresh(res);
      const resultado = await consumirLimite({ escopo: 'EMAIL_ENVIO_IP', chave: obterIpCliente(req),
        limite: VERIFICACAO_EMAIL.envioIpPorHora, janelaMs: 60 * MINUTO });
      const envio = resultado.permitido ? await verificacaoEmail.solicitarCodigo(email) : { estado: 'RATE_LIMIT', retryAfter: resultado.retryAfter };
      return res.status(403).json({ codigo: 'EMAIL_NOT_VERIFIED', mensagem: 'Verifique seu e-mail para continuar.',
        verificacao: { ticket: verificacaoEmail.criarTicket(email, true), emailMascarado: verificacaoEmail.mascararEmail(email),
          validadeMinutos: VERIFICACAO_EMAIL.validadeMs / 60000,
          envio: envio.estado, retryAfter: envio.retryAfter } });
    }

    const sessaoRefresh = await criarSessaoRefresh(obterPoolAutenticacao(), usuario.id, usuario.senha);
    const token = criarTokenAcesso(usuario, sessaoRefresh);
    definirCookieRefresh(res, sessaoRefresh.token, sessaoRefresh.expiresAt);

    if (usuario.perfil === "admin") {
      registrarEvento("info", "login_admin", {
        request_id: req.id,
        usuario_id: usuario.id,
      });
    }

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        ativo: usuario.ativo,
      },
    });
  } catch (erro) {
    if (erro.status === 403) return res.status(403).json({ mensagem: erro.message });
    registrarErro("login_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao realizar login" });
  }
});

router.post(
  "/auth/refresh",
  protegerContraCsrf,
  politicaEmail,
  limitarRefresh,
  async (req, res) => {
    try {
      const refreshToken = lerRefreshToken(req);
      if (req.refreshCookieInvalido) {
        limparCookieRefresh(res);
        return res.status(400).json({ mensagem: "Cookie de sessão inválido" });
      }

      const sessao = await renovarSessaoRefresh(obterPoolAutenticacao(), refreshToken);
      if (sessao?.emailNaoVerificado) {
        limparCookieRefresh(res);
        return res.status(403).json({ codigo: 'EMAIL_NOT_VERIFIED', mensagem: 'Verifique seu e-mail. Entre novamente para continuar.' });
      }
      if (sessao?.replay) {
        limparCookieRefresh(res);
        registrarEvento("aviso", "refresh_replay_detectado", {
          request_id: req.id,
        });
        return res.status(401).json({
          mensagem: "Sessão invalidada por segurança. Entre novamente",
          codigo: "REFRESH_REPLAY",
        });
      }
      if (sessao?.concorrente) {
        return res.status(409).json({
          mensagem: "A sessão já está sendo renovada",
          codigo: "REFRESH_CONCORRENTE",
        });
      }
      if (!sessao) {
        limparCookieRefresh(res);
        return res.status(401).json({
          mensagem: "Sessão expirada. Entre novamente",
          codigo: "SESSAO_EXPIRADA",
        });
      }

      const token = criarTokenAcesso(sessao.usuario, sessao);
      definirCookieRefresh(res, sessao.token, sessao.expiresAt);
      res.json({ token, usuario: sessao.usuario });
    } catch (erro) {
      registrarErro("refresh_erro", erro, req);
      res.status(500).json({ mensagem: "Erro ao renovar sessão" });
    }
  },
);

router.post("/auth/logout", protegerContraCsrf, async (req, res) => {
  try {
    const refreshToken = lerRefreshToken(req);
    await encerrarSessaoRefresh(obterPoolAutenticacao(), refreshToken);
    limparCookieRefresh(res);
    if (req.refreshCookieInvalido) {
      return res.status(400).json({ mensagem: "Cookie de sessão inválido" });
    }
    res.json({ mensagem: "Logout realizado com sucesso" });
  } catch (erro) {
    registrarErro("logout_erro", erro, req);
    limparCookieRefresh(res);
    res.status(500).json({ mensagem: "Erro ao encerrar sessão" });
  }
});

router.post(
  "/auth/logout-all",
  protegerContraCsrf,
  autenticar,
  async (req, res) => {
    try {
      await comAtor(identidadeDaRequisicao(req), encerrarTodasSessoes);
      limparCookieRefresh(res);
      registrarEvento("info", "logout_todos_dispositivos", {
        request_id: req.id,
        usuario_id: req.usuario.id,
      });
      res.json({ mensagem: "Todas as sessões foram encerradas" });
    } catch (erro) {
      registrarErro("logout_all_erro", erro, req);
      res.status(500).json({ mensagem: "Erro ao encerrar sessões" });
    }
  },
);

module.exports = router;
