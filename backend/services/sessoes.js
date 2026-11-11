const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { assinarContexto, transacao } = require("../database/contextoRls");
const {
  audience,
  expiracaoAcesso,
  issuer,
} = require("../config/ambiente");

const COOKIE_REFRESH = "bovitrack_refresh";
const COOKIE_REFRESH_LEGADO = "agrocontrol_refresh";
const DURACAO_REFRESH_PADRAO = "7d";
const ALGORITMO_JWT = "HS256";

function duracaoEmMilissegundos(valor) {
  const partes = /^(\d+)\s*([smhd])$/i.exec(String(valor || "").trim());
  if (!partes) {
    throw new Error(
      "JWT_REFRESH_EXPIRES_IN deve usar segundos (s), minutos (m), horas (h) ou dias (d)",
    );
  }
  const multiplicadores = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return Number(partes[1]) * multiplicadores[partes[2].toLowerCase()];
}

function gerarIdentificadorSessao() {
  return crypto.randomBytes(32).toString("hex");
}

function criarTokenAcesso(usuario, sessao) {
  if (!sessao?.sessionId) {
    throw new Error("Uma sessão ativa é obrigatória para emitir o access token");
  }

  const autenticadoEm = sessao.lastAuthenticatedAt || new Date();
  return jwt.sign(
    {
      perfil: usuario.perfil,
      sid: sessao.sessionId,
      auth_time: Math.floor(new Date(autenticadoEm).getTime() / 1000),
    },
    process.env.JWT_SECRET,
    {
      algorithm: ALGORITMO_JWT,
      audience,
      expiresIn: expiracaoAcesso,
      issuer,
      subject: String(usuario.id),
    },
  );
}

function verificarTokenAcesso(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: [ALGORITMO_JWT],
    audience,
    issuer,
  });
}

function gerarRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function lerRefreshToken(req) {
  const cookies = String(req.headers.cookie || "").split(";");
  let tokenLegado = null;

  for (const cookie of cookies) {
    const separador = cookie.indexOf("=");
    if (separador === -1) continue;
    const nome = cookie.slice(0, separador).trim();
    if (nome !== COOKIE_REFRESH && nome !== COOKIE_REFRESH_LEGADO) continue;

    try {
      const token = decodeURIComponent(cookie.slice(separador + 1).trim());
      if (nome === COOKIE_REFRESH) return token;
      tokenLegado = token;
    } catch {
      req.refreshCookieInvalido = true;
      return null;
    }
  }

  return tokenLegado;
}

function opcoesCookie(expires) {
  const sameSiteRecebido = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
  const sameSitePermitidos = new Set(["lax", "strict", "none"]);
  const sameSite = sameSitePermitidos.has(sameSiteRecebido)
    ? sameSiteRecebido
    : "lax";
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production");

  return {
    httpOnly: true,
    secure: sameSite === "none" ? true : secure,
    sameSite,
    path: "/auth",
    ...(expires ? { expires: new Date(expires) } : {}),
  };
}

function definirCookieRefresh(res, token, expiresAt) {
  res.clearCookie(COOKIE_REFRESH_LEGADO, opcoesCookie());
  res.cookie(COOKIE_REFRESH, token, opcoesCookie(expiresAt));
}

function limparCookieRefresh(res) {
  res.clearCookie(COOKIE_REFRESH, opcoesCookie());
  res.clearCookie(COOKIE_REFRESH_LEGADO, opcoesCookie());
}

async function criarSessaoRefresh(pool, usuarioId, senhaObservada) {
  const token = gerarRefreshToken();
  const tokenHash = hashToken(token);
  const sessionId = gerarIdentificadorSessao();
  const familyId = gerarIdentificadorSessao();
  const duracao = duracaoEmMilissegundos(
    process.env.JWT_REFRESH_EXPIRES_IN || DURACAO_REFRESH_PADRAO,
  );
  const expiresAt = new Date(Date.now() + duracao);
  const lastAuthenticatedAt = new Date();
  const aberta = await transacao(pool, async (cliente) => {
    const { rows: [{ desafio }] } = await cliente.query("SELECT bovitrack_seg.desafio() AS desafio");
    const prova = assinarContexto(`bovitrack-login-v1:${desafio}:${usuarioId}:${tokenHash}:${sessionId}:${familyId}`);
    const resultado = await cliente.query(
      "SELECT bovitrack_seg.abrir_sessao($1,$2,$3,$4,$5,$6,$7,$8) AS aberta",
      [usuarioId, senhaObservada, tokenHash, sessionId, familyId, expiresAt, lastAuthenticatedAt, prova],
    );
    return resultado.rows[0]?.aberta;
  });
  if (!aberta) {
    throw Object.assign(new Error("Usuário desativado. Entre em contato com o administrador"), { status: 403 });
  }
  return { token, expiresAt, sessionId, familyId, lastAuthenticatedAt };
}

async function renovarSessaoRefresh(pool, tokenAtual) {
  if (typeof tokenAtual !== "string" || tokenAtual.length < 32) return null;

  const tokenAtualHash = hashToken(tokenAtual);
  const novoToken = gerarRefreshToken();
  const novoHash = hashToken(novoToken);
  const { rows: [atual] } = await pool.query(
    "SELECT * FROM bovitrack_seg.rodar_refresh($1,$2)", [tokenAtualHash, novoHash],
  );
  if (!atual) return null;
  if (atual.estado !== "ok") return { [atual.estado]: true };
  return {
    token: novoToken, expiresAt: atual.expires_at, sessionId: atual.session_id,
    familyId: atual.family_id, lastAuthenticatedAt: atual.last_authenticated_at,
    usuario: { id: atual.usuario_id, nome: atual.nome, email: atual.email, perfil: atual.perfil, ativo: atual.ativo },
  };
}

async function encerrarSessaoRefresh(pool, token) {
  if (typeof token !== "string" || !token) return;
  await pool.query("SELECT bovitrack_seg.encerrar_refresh($1)", [hashToken(token)]);
}

async function encerrarTodasSessoes(cliente) {
  await cliente.query("SELECT bovitrack_seg.encerrar_minhas_sessoes()");
}

module.exports = {
  ALGORITMO_JWT,
  COOKIE_REFRESH,
  criarSessaoRefresh,
  criarTokenAcesso,
  definirCookieRefresh,
  encerrarSessaoRefresh,
  encerrarTodasSessoes,
  hashToken,
  lerRefreshToken,
  limparCookieRefresh,
  renovarSessaoRefresh,
  verificarTokenAcesso,
};
