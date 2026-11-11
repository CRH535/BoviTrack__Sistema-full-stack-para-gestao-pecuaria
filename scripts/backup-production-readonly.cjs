// Origem de producao SOMENTE LEITURA. Dump em memoria, arquivo cifrado DPAPI,
// restore em cluster novo SCRAM/loopback com ACL Windows privada. Sem SQL remoto de escrita.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Client } = require("../backend/node_modules/pg");
const { source, attest, REF } = require("./production-admin-source.cjs");
const {
  dpapi,
  privateDirectory,
  savePrivate,
} = require("./windows-private-store.cjs");
const {
  pgBin,
  postgresEnv,
  fingerprint,
  securitySnapshot,
  ident,
  root,
} = require("./stage3-helpers.cjs");
const output = path.join(root, "outputs/rls-email-flag");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
async function main() {
  assert.equal(process.argv.length, 2);
  const { env, url, config } = source();
  const remote = new Client({
    ...config,
    options: "-c default_transaction_read_only=on",
  });
  let local,
    started = false,
    directory,
    dataDirectory,
    dump;
  const result = {
    projectRef: REF,
    sourceSha: env.BOVITRACK_RELEASE_SHA,
    startedAt: new Date().toISOString(),
    verifiedRestore: false,
    writtenToSource: false,
  };
  function run(exe, args, settings = {}) {
    const r = spawnSync(path.join(pgBin, exe + ".exe"), args, {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 128 * 1024 * 1024,
      ...settings,
    });
    if (directory)
      fs.writeFileSync(path.join(directory, exe + ".log"), r.stderr || "");
    assert.equal(r.status, 0, exe + " falhou");
    return r;
  }
  try {
    await remote.connect();
    await attest(remote);
    await remote.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(
      (await remote.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "on",
    );
    const before = await fingerprint(remote),
      security = await securitySnapshot(remote);
    const roleDefinitions = (
      await remote.query(
        "SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname LIKE 'bovitrack_%' ORDER BY rolname",
      )
    ).rows;
    assert.ok(
      roleDefinitions.every(
        (r) =>
          !r.rolsuper &&
          !r.rolbypassrls &&
          !r.rolcreatedb &&
          !r.rolcreaterole &&
          !r.rolreplication,
      ),
    );
    const roles = roleDefinitions.map((r) => r.rolname);
    const memberships = (
      await remote.query(
        "SELECT DISTINCT p.rolname AS parent,m.rolname AS member FROM pg_auth_members a JOIN pg_roles p ON p.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE p.rolname LIKE 'bovitrack_%' AND (m.rolname LIKE 'bovitrack_%' OR m.rolname='postgres') ORDER BY 1,2",
      )
    ).rows;
    const schemas = (
      await remote.query(
        "SELECT nspname FROM pg_namespace WHERE nspname IN ('public','bovitrack_seg','bovitrack_release') ORDER BY nspname",
      )
    ).rows.map((r) => r.nspname);
    const snapshot = (await remote.query("SELECT pg_export_snapshot() AS id"))
      .rows[0].id;
    directory = path.join(
      process.env.LOCALAPPDATA,
      "BoviTrack",
      "private-release",
      "snapshot-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
    );
    privateDirectory(directory);
    const dumpEnv = postgresEnv(process.env, {
      PGHOST: url.hostname,
      PGPORT: url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: "postgres",
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: env.DB_SSL_CA_PATH,
      PGOPTIONS: "-c default_transaction_read_only=on",
      PGAPPNAME: "bovitrack-readonly-release-backup",
    });
    dump = run(
      "pg_dump",
      [
        "--format=custom",
        ...schemas.map((s) => "--schema=" + s),
        "--no-publications",
        "--no-subscriptions",
        "--snapshot=" + snapshot,
      ],
      { env: dumpEnv },
    ).stdout;
    assert.ok(dump.length > 0);
    await remote.query("COMMIT");
    const archive = path.join(directory, "production.dump.dpapi");
    fs.writeFileSync(archive, dpapi(dump));
    const restoredBytes = dpapi(fs.readFileSync(archive), true);
    assert.equal(hash(restoredBytes), hash(dump));
    result.archive = archive;
    result.sha256 = hash(fs.readFileSync(archive));
    result.dumpSha256 = hash(dump);
    result.bytes = dump.length;
    const password = crypto.randomBytes(32).toString("hex");
    dataDirectory = path.join(directory, "postgres17-data");
    const pwfile = path.join(directory, "local-password.dpapi");
    fs.writeFileSync(pwfile, password + "\n");
    try {
      run("initdb", [
        "-D",
        dataDirectory,
        "-U",
        "bovitrack_restore_admin",
        "--auth=scram-sha-256",
        "--pwfile=" + pwfile,
        "--encoding=UTF8",
        "--locale=C",
        "--no-clean",
      ]);
    } finally {
      fs.writeFileSync(pwfile, dpapi(Buffer.from(password)));
    }
    run("pg_ctl", [
      "-D",
      dataDirectory,
      "-l",
      path.join(directory, "postgres.log"),
      "-o",
      "-p 55442 -h 127.0.0.1",
      "-w",
      "start",
    ]);
    started = true;
    const localConfig = {
      host: "127.0.0.1",
      port: 55442,
      user: "bovitrack_restore_admin",
      password,
      database: "postgres",
      ssl: false,
    };
    local = new Client(localConfig);
    await local.connect();
    const system = (
      await local.query(
        "SELECT (pg_control_system()).system_identifier::text AS id,current_setting('data_directory') AS directory,current_setting('server_version') AS version,inet_server_port() AS port",
      )
    ).rows[0];
    assert.equal(
      path.resolve(system.directory).toLowerCase(),
      path.resolve(dataDirectory).toLowerCase(),
    );
    assert.equal(system.version, "17.6");
    assert.equal(system.port, 55442);
    await local.query(
      "COMMENT ON DATABASE postgres IS 'bovitrack-private-restore:" +
        system.id +
        "'",
    );
    for (const name of [
      "postgres",
      "anon",
      "authenticated",
      "service_role",
      "supabase_admin",
      ...roles,
    ]) {
      assert.match(name, /^[a-z_][a-z0-9_]*$/);
      await local.query(
        "CREATE ROLE " +
          ident(name) +
          " NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION",
      );
    }
    for (const m of memberships)
      await local.query("GRANT " + ident(m.parent) + " TO " + ident(m.member));
    await local.query(
      "CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions",
    );
    if (roles.includes("bovitrack_rls_identidade"))
      await local.query(
        "GRANT USAGE ON SCHEMA extensions TO bovitrack_rls_identidade;GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO bovitrack_rls_identidade",
      );
    const localEnv = postgresEnv(process.env, {
      PGHOST: "127.0.0.1",
      PGPORT: "55442",
      PGUSER: "bovitrack_restore_admin",
      PGPASSWORD: password,
      PGDATABASE: "postgres",
      PGSSLMODE: "disable",
    });
    run(
      "pg_restore",
      ["--exit-on-error", "--clean", "--if-exists", "--dbname=postgres"],
      { env: localEnv, input: restoredBytes },
    );
    restoredBytes.fill(0);
    dump.fill(0);
    assert.deepEqual(await fingerprint(local), before);
    assert.deepEqual(await securitySnapshot(local), security);
    assert.equal(
      (
        await local.query(
          "SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated",
        )
      ).rows[0].n,
      0,
    );
    const denied = new Client({
      ...localConfig,
      password: "invalid-self-check",
    });
    await assert.rejects(denied.connect(), { code: "28P01" });
    await denied.end().catch(() => {});
    savePrivate(path.join(directory, "restore-connection.dpapi"), {
      localConfig,
      dataDirectory,
      systemIdentifier: system.id,
      marker: "bovitrack-private-restore:" + system.id,
    });
    for (const m of memberships)
      assert.equal(
        (
          await local.query("SELECT pg_has_role($1,$2,'MEMBER') AS member", [
            m.member,
            m.parent,
          ])
        ).rows[0].member,
        true,
      );
    result.roles = roleDefinitions;
    result.memberships = memberships;
    result.verifiedRestore = true;
    result.finishedAt = new Date().toISOString();
    result.tables = before;
    result.schemas = schemas;
    result.localSystemIdentifier = system.id;
    fs.writeFileSync(
      path.join(directory, "backup-manifest.json"),
      JSON.stringify(result, null, 2),
    );
    fs.writeFileSync(
      path.join(output, "production-backup-result.json"),
      JSON.stringify(
        {
          projectRef: REF,
          sourceSha: result.sourceSha,
          verifiedRestore: true,
          manifest: path.join(directory, "backup-manifest.json"),
          tables: before.length,
          bytes: result.bytes,
          sha256: result.sha256,
          sourceReadOnly: true,
          restoreAuthentication: "SCRAM-SHA-256",
          archiveEncryption: "Windows DPAPI CurrentUser",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        projectRef: REF,
        verifiedRestore: true,
        tables: before.length,
        bytes: result.bytes,
        sourceReadOnly: true,
        encrypted: true,
      }),
    );
  } finally {
    dump?.fill(0);
    await Promise.allSettled([remote.end(), local?.end()]);
    if (started)
      run("pg_ctl", ["-D", dataDirectory, "-w", "stop", "-m", "fast"]);
  }
}
main().catch((e) => {
  console.error("Backup readonly recusado:", e.code || e.name);
  console.error(
    e.stack
      ?.split("\n")
      .filter((l) => /^\s+at /.test(l))
      .slice(0, 2)
      .join("\n"),
  );
  process.exitCode = 1;
});
