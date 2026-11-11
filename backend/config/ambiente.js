const dotenv = require("dotenv");
const { obterConfiguracaoEmail, verificacaoEmailObrigatoria } = require('./email');

dotenv.config();

const DURACOES = { s: 1, m: 60, h: 3600, d: 86400 };

function duracaoEmSegundos(valor, nome) {
  const partes = /^(\d+)\s*([smhd])$/i.exec(String(valor || "").trim());
  if (!partes) {
    throw new Error(`${nome} deve usar s, m, h ou d (por exemplo, 15m)`);
  }
  return Number(partes[1]) * DURACOES[partes[2].toLowerCase()];
}

function validarAmbiente(ambiente = process.env) {
  const emailObrigatorio = verificacaoEmailObrigatoria(ambiente);
  const producao = ambiente.NODE_ENV === "production";
  const segredo = ambiente.JWT_SECRET || "";
  const expiracaoAcesso =
    ambiente.JWT_ACCESS_EXPIRES_IN || ambiente.JWT_EXPIRES_IN || "15m";
  const issuer = ambiente.JWT_ISSUER || "bovitrack-api";
  const audience = ambiente.JWT_AUDIENCE || "bovitrack-web";
  const sameSite = String(ambiente.COOKIE_SAME_SITE || "lax").toLowerCase();
  const sslMode = String(ambiente.DB_SSL || "").toLowerCase();
  const urlBanco = ambiente.DATABASE_URL || "";

  if (!segredo) throw new Error("JWT_SECRET não foi configurado");
  if (!issuer.trim()) throw new Error("JWT_ISSUER não foi configurado");
  if (!audience.trim()) throw new Error("JWT_AUDIENCE não foi configurado");

  const segundosAcesso = duracaoEmSegundos(
    expiracaoAcesso,
    "JWT_ACCESS_EXPIRES_IN",
  );
  const segundosRefresh = duracaoEmSegundos(
    ambiente.JWT_REFRESH_EXPIRES_IN || "7d",
    "JWT_REFRESH_EXPIRES_IN",
  );

  if (!new Set(["lax", "strict", "none"]).has(sameSite)) {
    throw new Error("COOKIE_SAME_SITE deve ser lax, strict ou none");
  }

  if (producao) {
    if (emailObrigatorio) obterConfiguracaoEmail(ambiente);
    if (!urlBanco) throw new Error("DATABASE_URL não foi configurada em produção");
    if (!/^[0-9a-f]{64}$/.test(ambiente.DB_RLS_CONTEXT_KEY || "") ||
        ambiente.DB_RLS_CONTEXT_KEY === segredo ||
        ambiente.DB_RLS_CONTEXT_KEY === ambiente.EMAIL_VERIFICATION_PEPPER) {
      throw new Error("DB_RLS_CONTEXT_KEY deve ser uma chave independente de 32 bytes em hexadecimal");
    }
    let urlAuth;
    try {
      urlAuth = new URL(ambiente.DATABASE_AUTH_URL);
      if (!["postgres:", "postgresql:"].includes(urlAuth.protocol) ||
          !urlAuth.username || urlAuth.searchParams.has("user") ||
          decodeURIComponent(urlAuth.username) === decodeURIComponent(new URL(urlBanco).username)) {
        throw new Error("Credencial inválida");
      }
    } catch {
      throw new Error("DATABASE_AUTH_URL deve usar um login PostgreSQL separado");
    }
    if (sslMode !== "verify-full" && urlAuth.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("DATABASE_AUTH_URL deve usar TLS verify-full em produção");
    }
    if (Buffer.byteLength(segredo, "utf8") < 32) {
      throw new Error("JWT_SECRET deve possuir pelo menos 32 bytes em produção");
    }
    if (/troque|change|secret|senha|password|bovitrack/i.test(segredo)) {
      throw new Error("JWT_SECRET utiliza um valor inseguro ou de exemplo");
    }
    if (segundosAcesso < 60 || segundosAcesso > 30 * 60) {
      throw new Error("JWT_ACCESS_EXPIRES_IN deve ficar entre 1m e 30m em produção");
    }
    if (segundosRefresh < 60 * 60 || segundosRefresh > 30 * 86400) {
      throw new Error("JWT_REFRESH_EXPIRES_IN deve ficar entre 1h e 30d em produção");
    }
    if (!ambiente.FRONTEND_URL) {
      throw new Error("FRONTEND_URL não foi configurada em produção");
    }
    const origensInvalidas = ambiente.FRONTEND_URL.split(",").filter((origem) => {
      try {
        return new URL(origem.trim()).protocol !== "https:";
      } catch {
        return true;
      }
    });
    if (origensInvalidas.length) {
      throw new Error("FRONTEND_URL deve conter somente origens HTTPS válidas em produção");
    }
    if (ambiente.COOKIE_SECURE !== "true") {
      throw new Error("COOKIE_SECURE deve ser true em produção");
    }

    let sslUrlSeguro = false;
    try {
      sslUrlSeguro = new URL(urlBanco).searchParams.get("sslmode") === "verify-full";
    } catch {
      throw new Error("DATABASE_URL é inválida");
    }
    if (sslMode !== "verify-full" && !sslUrlSeguro) {
      throw new Error("DB_SSL deve ser verify-full em produção");
    }
    if (sslMode === "verify-full" && !ambiente.DB_SSL_CA_PATH && !ambiente.DB_SSL_CA_BASE64) {
      throw new Error("DB_SSL_CA_PATH ou DB_SSL_CA_BASE64 é obrigatório com DB_SSL=verify-full");
    }
  }

  return { producao, expiracaoAcesso, issuer, audience };
}

const configuracao = validarAmbiente();

module.exports = { ...configuracao, duracaoEmSegundos, validarAmbiente };
