// Modifica exclusivamente a COPIA privada restaurada, nunca a origem Supabase.
// Prova preservacao de dados/sessoes legadas e runtime novo com token do codigo antigo.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Client, Pool } = require("../backend/node_modules/pg");
const bcrypt = require("../backend/node_modules/bcryptjs");
const { readPrivate } = require("./windows-private-store.cjs");
const {
  root,
  pgBin,
  fingerprint,
  securitySnapshot,
  ident,
} = require("./stage3-helpers.cjs");
const {
  optionalEmailFiles,
  applyMigration,
} = require("./release-migration-executor.cjs");
const output = path.join(root, "outputs/rls-email-flag");
const hex = () => crypto.randomBytes(32).toString("hex");
async function main() {
  assert.equal(process.argv.length, 2);
  const proof = JSON.parse(
    fs.readFileSync(path.join(output, "production-backup-result.json"), "utf8"),
  );
  assert.equal(proof.projectRef, "znpmzebrryqtjkgnvlcw");
  assert.equal(proof.verifiedRestore, true);
  const folder = path.dirname(proof.manifest),
    privateBase = path.join(
      process.env.LOCALAPPDATA,
      "BoviTrack/private-release",
    );
  assert.ok(
    path.resolve(folder).startsWith(path.resolve(privateBase) + path.sep),
  );
  const { localConfig, dataDirectory, systemIdentifier, marker } = readPrivate(
    path.join(folder, "restore-connection.dpapi"),
  );
  assert.equal(localConfig.host, "127.0.0.1");
  assert.equal(localConfig.port, 55442);
  assert.equal(localConfig.user, "bovitrack_restore_admin");
  assert.equal(localConfig.database, "postgres");
  assert.equal(path.dirname(dataDirectory), folder);
  const pgctl = (args) => {
    const r = spawnSync(path.join(pgBin, "pg_ctl.exe"), args, {
      windowsHide: true,
      stdio: "ignore",
      timeout: 30000,
    });
    assert.equal(r.status, 0, "pg_ctl privado falhou");
  };
  let c,
    server,
    legacyPool,
    started = false;
  const result = {
    sourceProjectRef: proof.projectRef,
    productionWritten: false,
    completed: false,
    migrations: [],
  };
  try {
    pgctl([
      "-D",
      dataDirectory,
      "-l",
      path.join(folder, "postgres.log"),
      "-o",
      "-p 55442 -h 127.0.0.1",
      "-w",
      "start",
    ]);
    started = true;
    c = new Client(localConfig);
    await c.connect();
    const guard = async () => {
      const r = (
        await c.query(
          "SELECT (pg_control_system()).system_identifier::text AS id,current_setting('data_directory') AS directory,inet_server_port() AS port,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0];
      assert.equal(r.id, systemIdentifier);
      assert.equal(path.resolve(r.directory), path.resolve(dataDirectory));
      assert.equal(r.port, 55442);
      assert.equal(r.marker, marker);
    };
    await guard();
    const manifest = JSON.parse(fs.readFileSync(proof.manifest));
    assert.deepEqual(await fingerprint(c), manifest.tables);
    assert.equal(
      (
        await c.query(
          "SELECT to_regnamespace('bovitrack_seg') IS NULL AS legacy",
        )
      ).rows[0].legacy,
      true,
      "Ensaio exige copia ainda legada",
    );
    const user = (
      await c.query(
        "INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Fixture de compatibilidade','snapshot-fixture@example.test',$1,'usuario') RETURNING id,nome,email,perfil",
        [await bcrypt.hash(hex(), 4)],
      )
    ).rows[0];
    const property = (
      await c.query(
        "INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ('Fixture de compatibilidade','Teste','SP',1,$1) RETURNING id",
        [user.id],
      )
    ).rows[0].id;
    const domain = "snapshot_domain_" + hex().slice(0, 8),
      auth = "snapshot_auth_" + hex().slice(0, 8),
      password = hex(),
      key = hex();
    const runtimeUrl = (name) =>
      "postgresql://" + name + ":" + password + "@127.0.0.1:55442/postgres";
    Object.assign(process.env, {
      NODE_ENV: "test",
      VERCEL: "",
      DB_SSL: "disable",
      DB_SSL_CA_PATH: "",
      DB_SSL_CA_BASE64: "",
      DATABASE_URL: runtimeUrl(domain),
      DATABASE_AUTH_URL: runtimeUrl(auth),
      DB_RLS_CONTEXT_KEY: key,
      JWT_SECRET: hex(),
      JWT_ISSUER: "bovitrack-api",
      JWT_AUDIENCE: "bovitrack-web",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
      EMAIL_VERIFICATION_REQUIRED: "false",
      RESEND_API_KEY: "",
      EMAIL_VERIFICATION_PEPPER: "",
      COOKIE_SECURE: "false",
      COOKIE_SAME_SITE: "lax",
      CSRF_ALLOW_NO_ORIGIN: "true",
      FRONTEND_URL: "http://127.0.0.1",
      DB_POOL_MAX: "3",
    });
    const legacy = require(
      path.join(
        root,
        "outputs/rls-etapa3/revisions/legacy/backend/services/sessoes.js",
      ),
    );
    // O binario antigo limpa expiradas no login. Preservar a fotografia na
    // preparacao da fixture para medir somente o efeito das migrations.
    await c.query(
      "CREATE TEMP TABLE saved_sessions AS TABLE public.sessoes_refresh;CREATE TEMP TABLE saved_used AS TABLE public.sessoes_refresh_usados",
    );
    legacyPool = new Pool(localConfig);
    const oldSession = await legacy.criarSessaoRefresh(legacyPool, user.id),
      oldToken = legacy.criarTokenAcesso(user, oldSession);
    await legacyPool.end();
    legacyPool = null;
    await c.query(
      "INSERT INTO public.sessoes_refresh SELECT * FROM saved_sessions ON CONFLICT DO NOTHING;INSERT INTO public.sessoes_refresh_usados SELECT * FROM saved_used ON CONFLICT DO NOTHING",
    );
    const before = await fingerprint(c);
    await guard();
    await c.query(
      "CREATE SCHEMA bovitrack_release;CREATE TABLE bovitrack_release.migrations(name text PRIMARY KEY,sha256 text NOT NULL)",
    );
    for (const file of optionalEmailFiles) {
      result.migrations.push(await applyMigration(c, file, guard));
      if (file === "014_rls_contexto.sql")
        await c.query(
          "INSERT INTO bovitrack_seg.chaves_contexto VALUES(decode($1,'hex'))",
          [key],
        );
      if (file === "021_email_verificacao_configuravel.sql")
        await c.query(
          "UPDATE bovitrack_seg.configuracao_email SET obrigatoria=false",
        );
    }
    const after = await fingerprint(c);
    for (const table of before.filter((t) => t.table !== "public.usuarios"))
      assert.deepEqual(
        after.find((t) => t.table === table.table),
        table,
        "Dado legado alterado: " + table.table,
      );
    const users = (
      await c.query(
        "SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(u)-'email_verificado'-'email_verificado_em' ORDER BY (to_jsonb(u)-'email_verificado'-'email_verificado_em')::text)::text,'[]')) AS digest FROM usuarios u",
      )
    ).rows[0];
    assert.deepEqual(users, {
      count: before.find((t) => t.table === "public.usuarios").count,
      digest: before.find((t) => t.table === "public.usuarios").digest,
    });
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM usuarios WHERE email_verificado",
        )
      ).rows[0].n,
      0,
    );
    for (const name of [domain, auth]) {
      await c.query(
        "CREATE FUNCTION pg_temp.criar_login(text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',$1,$2); END $$",
      );
      await c.query("SELECT pg_temp.criar_login($1,$2)", [name, password]);
      await c.query("DROP FUNCTION pg_temp.criar_login(text,text)");
      await c.query(
        "GRANT " +
          (name === domain ? "bovitrack_runtime" : "bovitrack_auth_runtime") +
          " TO " +
          ident(name),
      );
    }
    let emails = 0;
    require("../backend/services/emailService").enviarVerificacao =
      async () => {
        emails++;
        throw Error("Envio inesperado");
      };
    const app = require("../backend/app");
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = "http://127.0.0.1:" + server.address().port;
    const get = async (route) => {
      const r = await fetch(base + route, {
        headers: { Authorization: "Bearer " + oldToken },
      });
      return { status: r.status, body: await r.json() };
    };
    assert.equal((await get("/auth/me")).status, 200);
    assert.deepEqual(
      (await get("/propriedades")).body.map((p) => p.id),
      [property],
    );
    const refreshed = await fetch(base + "/auth/refresh", {
      method: "POST",
      headers: {
        Cookie: "bovitrack_refresh=" + oldSession.token,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(refreshed.status, 200);
    const active = await securitySnapshot(c);
    await guard();
    await c.query(
      fs.readFileSync(
        path.join(root, "backend/database/rollback/019_rls_rollback_dev.sql"),
        "utf8",
      ),
    );
    assert.equal((await get("/propriedades")).status, 200);
    await applyMigration(c, "019_rls_ativacao.sql", guard, {
      reactivate: true,
    });
    assert.deepEqual(await securitySnapshot(c), active);
    assert.equal((await get("/propriedades")).status, 200);
    assert.equal(emails, 0);
    const checker = spawnSync(
      process.execPath,
      ["backend/scripts/check-security-readonly.js"],
      { cwd: root, env: process.env, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(checker.status, 0);
    result.completed = true;
    result.sourceTablesPreserved = before.length;
    result.originalUserFieldsPreserved = true;
    result.sessionRowsPreservedBeforeRuntime = true;
    result.legacyTokenAccepted = true;
    result.legacyRefreshAccepted = true;
    result.rollbackAndReactivation = true;
    result.emailsSent = emails;
    console.log(JSON.stringify(result));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const mod of [
      "../backend/database/pool",
      "../backend/database/poolAutenticacao",
    ]) {
      const loaded = require.cache[require.resolve(mod)];
      if (loaded) {
        const m = loaded.exports;
        await (m.end ? m.end() : m.obterPoolAutenticacao().end()).catch(
          () => {},
        );
      }
    }
    await Promise.allSettled([c?.end(), legacyPool?.end()]);
    if (started) pgctl(["-D", dataDirectory, "-w", "stop", "-m", "fast"]);
    fs.writeFileSync(
      path.join(output, "production-snapshot-rehearsal.json"),
      JSON.stringify(result, null, 2),
    );
  }
}
main().catch((e) => {
  console.error("Ensaio de copia privada recusado:", e.code || e.name);
  console.error(
    e.stack
      ?.split("\n")
      .filter((l) => /^\s+at /.test(l))
      .slice(0, 2)
      .join("\n"),
  );
  process.exitCode = 1;
});
