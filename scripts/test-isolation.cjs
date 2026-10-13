const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
for (const url of [
  "postgresql://postgres@database.external.invalid/postgres",
  "postgresql://postgres@127.0.0.1:55432/postgres?host=database.external.invalid",
  "postgresql://postgres@127.0.0.1:55432/postgres?port=5432",
]) {
  const result = spawnSync(process.execPath, ["scripts/test-isolated.cjs", "offline"], {
    cwd: root, encoding: "utf8", env: { ...process.env, BOVITRACK_TEST_POSTGRES_URL: url },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /URLs externas são recusadas/);
}
const result = spawnSync(process.execPath, ["backend/tests/backend-regressions-integration.js"], {
  cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "test", ALLOW_TEST_DB_WRITES: "true",
    DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/bovitrack_test_fake?host=database.external.invalid" },
});
assert.equal(result.status, 1);
assert.match(result.stderr, /DATABASE_URL local explicita/);
const configResult = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./frontend/playwright.config.js')"], {
  cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "test", BOVITRACK_E2E_ISOLATED: "true",
    DATABASE_URL: "http://127.0.0.1/bovitrack_test_fake" },
});
assert.equal(configResult.status, 1);
assert.match(configResult.stderr, /Banco E2E deve ser local/);
console.log("OK: URLs externas, protocolo inválido e parâmetros que substituem o host são recusados antes de conectar");
