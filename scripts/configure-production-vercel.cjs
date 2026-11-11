// Configuracao production SOMENTE apos corte SQL aprovado/provisionado.
// Valores secretos seguem por stdin ao CLI autenticado, nunca por argv/log.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("../backend/node_modules/pg");
const { criarConfiguracaoPorUrl } = require("../backend/database/config");
const {
  loadReleaseEnv,
  validateConfig,
  assertReleaseCheckout,
} = require("./release-production.cjs");
function cliPath() {
  const cache = path.join(process.env.LOCALAPPDATA, "npm-cache/_npx");
  for (const entry of fs.readdirSync(cache)) {
    const dir = path.join(cache, entry, "node_modules/vercel"),
      file = path.join(dir, "package.json");
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file));
    if (
      pkg.version === "65.14.0" &&
      pkg.repository?.url === "https://github.com/vercel/vercel.git"
    )
      return path.join(dir, pkg.bin.vercel);
  }
  throw Error("Preparar CLI Vercel 65.14.0 revisado antes de configurar");
}
async function main() {
  assert.equal(process.argv.length, 2);
  const env = loadReleaseEnv();
  validateConfig(env, "--provision");
  assertReleaseCheckout(env.BOVITRACK_RELEASE_SHA);
  assert.equal(env.EMAIL_VERIFICATION_REQUIRED, "false");
  const maintenance = await fetch(
    "https://bovitrack-api.vercel.app/auth/login",
    { signal: AbortSignal.timeout(15000) },
  );
  assert.equal(maintenance.status, 503);
  assert.equal((await maintenance.json()).codigo, "MANUTENCAO");
  const c = new Client(
    criarConfiguracaoPorUrl(env.BOVITRACK_RELEASE_ADMIN_URL, {
      sslMode: "verify-full",
      sslCaPath: env.DB_SSL_CA_PATH,
      producao: true,
    }),
  );
  try {
    await c.connect();
    assert.equal(c.connection.stream.authorized, true);
    await c.query("BEGIN READ ONLY");
    assert.equal(
      (
        await c.query(
          "SELECT obrigatoria FROM bovitrack_seg.configuracao_email WHERE singleton",
        )
      ).rows[0]?.obrigatoria,
      false,
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM bovitrack_seg.chaves_contexto WHERE chave=decode($1,'hex')",
          [env.DB_RLS_CONTEXT_KEY],
        )
      ).rows[0].n,
      1,
    );
    const roles = (
      await c.query(
        "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('bovitrack_app_rls_login','bovitrack_app_auth_login')",
      )
    ).rows;
    assert.equal(roles.length, 2);
    assert.ok(
      roles.every(
        (r) =>
          r.rolcanlogin &&
          !r.rolsuper &&
          !r.rolbypassrls &&
          !r.rolcreatedb &&
          !r.rolcreaterole,
      ),
    );
    await c.query("COMMIT");
  } finally {
    await c.end();
  }
  const cli = cliPath();
  const set = (project, name, value, secret) => {
    assert.ok(typeof value === "string" && value.length);
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "env",
        "add",
        name,
        "--environment",
        "production",
        "--project",
        project,
        "--scope",
        "crh535",
        secret ? "--sensitive" : "--no-sensitive",
        "--force",
        "--yes",
        "--non-interactive",
      ],
      {
        input: value + "\n",
        encoding: "utf8",
        windowsHide: true,
        timeout: 120000,
        env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1" },
      },
    );
    assert.equal(r.status, 0, "Vercel env falhou: " + name);
    console.log("OK production " + name + "; valor nao exibido");
  };
  const api = "prj_v0SXYazTtfH659wnuvk97W4bdqR9";
  for (const name of [
    "DATABASE_URL",
    "DATABASE_AUTH_URL",
    "DB_RLS_CONTEXT_KEY",
  ])
    set(api, name, env[name], true);
  set(
    api,
    "DB_SSL_CA_BASE64",
    fs.readFileSync(env.DB_SSL_CA_PATH).toString("base64"),
    true,
  );
  set(api, "DB_SSL", "verify-full", true);
  set(api, "DB_POOL_MAX", "3", true);
  set(api, "EMAIL_VERIFICATION_REQUIRED", "false", false);
  set(
    "prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm",
    "VITE_API_URL",
    "https://bovitrack-api.vercel.app",
    false,
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error("Configuracao Vercel recusada:", e.code || e.name);
    process.exitCode = 1;
  });
module.exports = { cliPath };
