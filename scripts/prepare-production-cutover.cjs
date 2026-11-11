// Executar --authorize SOMENTE apos aprovacao humana do SHA e corte do banco.
// Gera segredos no cofre DPAPI local; nao escreve SQL nem altera Vercel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { root } = require("./stage3-helpers.cjs");
const { source, REF } = require("./production-admin-source.cjs");
const { assertReleaseCheckout } = require("./release-production.cjs");
const { savePrivate, readPrivate } = require("./windows-private-store.cjs");
const file = path.join(root, "backend/.env.release-production.dpapi");
function backup() {
  const proof = JSON.parse(
    fs.readFileSync(
      path.join(root, "outputs/rls-email-flag/production-backup-result.json"),
    ),
  );
  assert.equal(proof.projectRef, REF);
  assert.equal(proof.verifiedRestore, true);
  const manifest = JSON.parse(fs.readFileSync(proof.manifest));
  assert.equal(manifest.projectRef, REF);
  assert.equal(manifest.verifiedRestore, true);
  assert.equal(
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(manifest.archive))
      .digest("hex"),
    manifest.sha256,
  );
  return { proof, manifest };
}
async function main() {
  const [mode, sha] = process.argv.slice(2);
  assert.equal(process.argv.length, 4);
  assert.ok(["--authorize", "--maintenance", "--backup"].includes(mode));
  assert.match(sha || "", /^[0-9a-f]{40}$/);
  assertReleaseCheckout(sha);
  if (mode === "--authorize") {
    assert.ok(
      !fs.existsSync(file),
      "Cofre ja existe; nao rotacionar segredos automaticamente",
    );
    const { env } = source();
    const { proof } = backup();
    const domainPassword = crypto.randomBytes(48).toString("hex"),
      authPassword = crypto.randomBytes(48).toString("hex");
    const connection = (name, password) => {
      const u = new URL(env.BOVITRACK_RELEASE_ADMIN_URL);
      u.username = name + "." + REF;
      u.password = password;
      u.port = "6543";
      return u.href;
    };
    savePrivate(file, {
      ...env,
      NODE_ENV: "production",
      BOVITRACK_RELEASE_SHA: sha,
      BOVITRACK_PRODUCTION_APPROVAL: "approve:" + REF + ":" + sha,
      BOVITRACK_RELEASE_BACKUP_MANIFEST: proof.manifest,
      BOVITRACK_RELEASE_MAINTENANCE_STARTED_AT: "",
      DB_RLS_CONTEXT_KEY: crypto.randomBytes(32).toString("hex"),
      BOVITRACK_DOMAIN_LOGIN_PASSWORD: domainPassword,
      BOVITRACK_AUTH_LOGIN_PASSWORD: authPassword,
      DATABASE_URL: connection("bovitrack_app_rls_login", domainPassword),
      DATABASE_AUTH_URL: connection("bovitrack_app_auth_login", authPassword),
    });
    console.log(
      "OK cofre DPAPI preparado; nenhum segredo exibido, nenhum SQL executado",
    );
    return;
  }
  const env = readPrivate(file);
  assert.equal(env.BOVITRACK_RELEASE_SHA, sha);
  assert.equal(env.BOVITRACK_PRODUCTION_APPROVAL, "approve:" + REF + ":" + sha);
  const response = await fetch("https://bovitrack-api.vercel.app/auth/login", {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).codigo, "MANUTENCAO");
  if (mode === "--maintenance") {
    assert.equal(
      env.BOVITRACK_RELEASE_MAINTENANCE_STARTED_AT,
      "",
      "Janela ja registrada; nao deslocar marco temporal",
    );
    env.BOVITRACK_RELEASE_MAINTENANCE_STARTED_AT = new Date().toISOString();
  } else {
    const { proof, manifest } = backup();
    assert.equal(manifest.sourceSha, sha);
    assert.ok(
      Date.parse(manifest.startedAt) >=
        Date.parse(env.BOVITRACK_RELEASE_MAINTENANCE_STARTED_AT),
    );
    env.BOVITRACK_RELEASE_BACKUP_MANIFEST = proof.manifest;
  }
  savePrivate(file, env);
  console.log("OK registro privado " + mode + "; nenhum SQL executado");
}
main().catch((e) => {
  console.error("Preparacao recusada:", e.code || e.name);
  process.exitCode = 1;
});
