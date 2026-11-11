// Usa a configuracao administrativa local existente sem exibir seus valores.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("../backend/node_modules/dotenv");
const { criarConfiguracaoPorUrl } = require("../backend/database/config");
const { validateConfig } = require("./release-production.cjs");
const root = path.resolve(__dirname, "..");
const REF = "znpmzebrryqtjkgnvlcw";
function source() {
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(common.status, 0);
  const original = path.dirname(path.resolve(root, common.stdout.trim()));
  const local = dotenv.parse(
    fs.readFileSync(path.join(original, "backend/.env")),
  );
  const ca = dotenv.parse(
    fs.readFileSync(path.join(root, "backend/.env.homologacao")),
  ).DB_SSL_CA_PATH;
  const url = new URL(local.DATABASE_URL);
  assert.ok(
    [...url.searchParams.keys()].every((k) =>
      ["sslmode", "sslrootcert"].includes(k),
    ),
  );
  url.search = "";
  const sha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  const env = {
    BOVITRACK_RELEASE_ADMIN_URL: url.href,
    BOVITRACK_RELEASE_POOLER_HOST: url.hostname,
    BOVITRACK_RELEASE_SHA: sha,
    DB_SSL: "verify-full",
    DB_SSL_CA_PATH: ca,
    EMAIL_VERIFICATION_REQUIRED: "false",
  };
  validateConfig(env, "--check");
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
  const config = criarConfiguracaoPorUrl(url.href, {
    sslMode: "verify-full",
    sslCaPath: ca,
    producao: true,
  });
  return {
    env,
    url,
    config: { ...config, connectionTimeoutMillis: 10000, query_timeout: 30000 },
  };
}
async function attest(client) {
  assert.equal(client.connection.stream.encrypted, true);
  assert.equal(client.connection.stream.authorized, true);
  const r = (
    await client.query(
      "SELECT current_database() AS db,current_user AS role,current_setting('server_version_num')::int AS version",
    )
  ).rows[0];
  assert.equal(r.db, "postgres");
  assert.equal(r.role, "postgres");
  assert.ok(r.version >= 170000 && r.version < 180000);
}
module.exports = { source, attest, REF };
