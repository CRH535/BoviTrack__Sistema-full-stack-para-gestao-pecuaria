const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  audience,
  expiracaoAcesso,
  issuer,
} = require("../config/ambiente");

const COOKIE_REFRESH = "bovitrack_refresh";
const COOKIE_REFRESH_LEGADO = "agrocontrol_refresh";
const DURACAO_REFRESH_PADRAO = "7d";
const ALGORITMO_JWT = "HS256";
const JANELA_CONCORRENCIA_REPLAY_MS = 5000;

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

async function criarSessaoRefresh(pool, usuarioId) {
  const token = gerarRefreshToken();
  const tokenHash = hashToken(token);
  const sessionId = gerarIdentificadorSessao();
  const familyId = gerarIdentificadorSessao();
  const duracao = duracaoEmMilissegundos(
    process.env.JWT_REFRESH_EXPIRES_IN || DURACAO_REFRESH_PADRAO,
  );
  const expiresAt = new Date(Date.now() + duracao);
  const lastAuthenticatedAt = new Date();
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const usuarioAtivo = await cliente.query(
      "SELECT id FROM usuarios WHERE id = $1 AND ativo = TRUE FOR SHARE",
      [usuarioId],
    );
    if (!usuarioAtivo.rows[0]) {
      const erro = new Error("Usuário desativado. Entre em contato com o administrador");
      erro.status = 403;
      throw erro;
    }
    await cliente.query(
      "DELETE FROM sessoes_refresh WHERE expires_at <= CURRENT_TIMESTAMP",
    );
    await cliente.query(
      `INSERT INTO sessoes_refresh
              (usuario_id, token_hash, session_id, family_id, expires_at,
               last_authenticated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuarioId, tokenHash, sessionId, familyId, expiresAt, lastAuthenticatedAt],
    );
    await cliente.query(
      `DELETE FROM sessoes_refresh
        WHERE usuario_id = $1
          AND id NOT IN (
            SELECT id FROM sessoes_refresh
             WHERE usuario_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT 10
          )`,
      [usuarioId],
    );
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }

  return { token, expiresAt, sessionId, familyId, lastAuthenticatedAt };
}

async function renovarSessaoRefresh(pool, tokenAtual) {
  if (typeof tokenAtual !== "string" || tokenAtual.length < 32) return null;

  const tokenAtualHash = hashToken(tokenAtual);
  const novoToken = gerarRefreshToken();
  const novoHash = hashToken(novoToken);
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const atualResultado = await cliente.query(
      `SELECT sr.id, sr.session_id, sr.family_id, sr.expires_at,
              sr.last_authenticated_at, sr.revoked_at,
              u.id AS usuario_id, u.nome, u.email, u.perfil, u.ativo
         FROM sessoes_refresh sr
         JOIN usuarios u ON u.id = sr.usuario_id
        WHERE sr.token_hash = $1
        FOR UPDATE OF sr`,
      [tokenAtualHash],
    );
    const atual = atualResultado.rows[0];

    if (!atual) {
      const usadoResultado = await cliente.query(
        `SELECT su.family_id, su.used_at, sr.revoked_at
           FROM sessoes_refresh_usados su
           LEFT JOIN sessoes_refresh sr ON sr.id = su.sessao_id
          WHERE su.token_hash = $1`,
        [tokenAtualHash],
      );
      const usado = usadoResultado.rows[0];
      if (usado && !usado.revoked_at) {
        const idade = Date.now() - new Date(usado.used_at).getTime();
        if (idade > JANELA_CONCORRENCIA_REPLAY_MS) {
          await cliente.query(
            `UPDATE sessoes_refresh
                SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'REPLAY'
              WHERE family_id = $1 AND revoked_at IS NULL`,
            [usado.family_id],
          );
          await cliente.query("COMMIT");
          return { replay: true };
        }
        await cliente.query("ROLLBACK");
        return { concorrente: true };
      }
      await cliente.query("ROLLBACK");
      return null;
    }

    if (
      atual.revoked_at ||
      !atual.ativo ||
      new Date(atual.expires_at).getTime() <= Date.now()
    ) {
      await cliente.query("ROLLBACK");
      return null;
    }

    await cliente.query(
      `INSERT INTO sessoes_refresh_usados
              (token_hash, sessao_id, family_id, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO NOTHING`,
      [tokenAtualHash, atual.id, atual.family_id, atual.expires_at],
    );
    await cliente.query(
      `UPDATE sessoes_refresh
          SET token_hash = $1, rotated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [novoHash, atual.id],
    );
    await cliente.query("COMMIT");

    return {
      token: novoToken,
      expiresAt: atual.expires_at,
      sessionId: atual.session_id,
      familyId: atual.family_id,
      lastAuthenticatedAt: atual.last_authenticated_at,
      usuario: {
        id: atual.usuario_id,
        nome: atual.nome,
        email: atual.email,
        perfil: atual.perfil,
        ativo: atual.ativo,
      },
    };
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

async function encerrarSessaoRefresh(pool, token) {
  if (typeof token !== "string" || !token) return;
  const tokenHash = hashToken(token);
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    // O lock espera uma rotacao em andamento. A consulta seguinte ganha um novo
    // snapshot e encontra o hash antigo no historico que acabou de ser gravado.
    let resultado = await cliente.query(
      "SELECT id FROM sessoes_refresh WHERE token_hash = $1 FOR UPDATE",
      [tokenHash],
    );
    if (!resultado.rows[0]) {
      resultado = await cliente.query(
        `SELECT sr.id FROM sessoes_refresh sr
          JOIN sessoes_refresh_usados su ON su.sessao_id = sr.id
         WHERE su.token_hash = $1 FOR UPDATE OF sr`,
        [tokenHash],
      );
    }
    if (resultado.rows[0]) {
      await cliente.query(
        `UPDATE sessoes_refresh
            SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'LOGOUT'
          WHERE id = $1 AND revoked_at IS NULL`,
        [resultado.rows[0].id],
      );
    }
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

async function encerrarTodasSessoes(pool, usuarioId) {
  await pool.query(
    `UPDATE sessoes_refresh
        SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'LOGOUT_ALL'
      WHERE usuario_id = $1 AND revoked_at IS NULL`,
    [usuarioId],
  );
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
