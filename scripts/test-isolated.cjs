// Cria/remove somente banco novo local. O runner não lê .env; a URL explícita
// prevalece mesmo nos processos filhos legados que utilizam dotenv.
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("../backend/node_modules/pg");
const bcrypt = require("../backend/node_modules/bcryptjs");

const root = path.resolve(__dirname, "..");
const mode = process.argv[2] || "all";
if (!["all", "integration", "e2e", "offline", "email", "email-flag", "rls"].includes(mode)) throw new Error("Modo inválido");
const adminUrl = new URL(process.env.BOVITRACK_TEST_POSTGRES_URL || "postgresql://postgres@127.0.0.1:55432/postgres");
if (adminUrl.search || adminUrl.hash || !['postgres:', 'postgresql:'].includes(adminUrl.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname)) {
  throw new Error("Testes exigem PostgreSQL em loopback; URLs externas são recusadas");
}
const database = `bovitrack_test_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${database}`;
const loginDominio = database.replace("bovitrack_test", "rls_dominio");
const loginAuth = database.replace("bovitrack_test", "rls_auth");
const senhasLogin = {
  [loginDominio]: crypto.randomBytes(32).toString("hex"),
  [loginAuth]: crypto.randomBytes(32).toString("hex"),
};
const urlLogin = (usuario) => {
  const url = new URL(databaseUrl);
  url.username = usuario;
  url.password = senhasLogin[usuario];
  return url.href;
};
const env = {
  ...process.env, NODE_ENV: "test", VERCEL: "", DATABASE_URL: urlLogin(loginDominio),
  DATABASE_AUTH_URL: urlLogin(loginAuth), BOVITRACK_TEST_ADMIN_URL: databaseUrl.href,
  DB_RLS_CONTEXT_KEY: crypto.randomBytes(32).toString("hex"),
  DB_SSL: "disable", DB_SSL_CA_BASE64: "", DB_SSL_CA_PATH: "",
  JWT_SECRET: crypto.randomBytes(48).toString("hex"), JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d", JWT_ISSUER: "bovitrack-api", JWT_AUDIENCE: "bovitrack-web",
  FRONTEND_URL: "http://127.0.0.1:5175", CORS_ALLOW_LOCALHOST: "false",
  CSRF_ALLOW_NO_ORIGIN: "true", COOKIE_SECURE: "false", COOKIE_SAME_SITE: "lax",
  APP_TIMEZONE: "America/Sao_Paulo", ALLOW_TEST_DB_WRITES: "true",
  RESEND_API_KEY: 're_mock_isolated_no_network', EMAIL_VERIFICATION_PEPPER: crypto.randomBytes(48).toString('hex'),
  EMAIL_VERIFICATION_REQUIRED: mode === 'email-flag' ? 'false' : (process.env.BOVITRACK_TEST_EMAIL_REQUIRED || 'true'),
  EMAIL_FROM: 'BoviTrack <onboarding@resend.dev>',
  TEST_ADMIN_EMAIL: "admin@example.test", TEST_ADMIN_SENHA: "IsolatedAdmin#2026",
  BOVITRACK_E2E_ISOLATED: "true", PORT: "3005", VITE_API_URL: "http://127.0.0.1:3005",
};

function run(relativeFile, cwd = "backend", args = []) {
  const preload = cwd === 'backend' && relativeFile.startsWith('tests/') && !relativeFile.includes('security-hardening') ? ['--require', './tests/helpers/email.js'] : [];
  const result = spawnSync(process.execPath, [...preload, relativeFile, ...args], { cwd: path.join(root, cwd), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falhou: ${relativeFile} (exit ${result.status})`);
}

const preparacaoRls = ["014_rls_contexto.sql", "015_rls_autenticacao.sql", "016_rls_verificacao_email.sql", "017_rls_integridade.sql", "018_rls_politicas.sql"];
const ativacaoRls = "migrations/019_rls_ativacao.sql";

function lerSql(nome) {
  return readFileSync(path.join(root, "backend/database", nome), "utf8");
}

async function testarRollback() {
  const assert = require("node:assert/strict");
  const cliente = new Client({ connectionString: databaseUrl.href, ssl: false });
  const runtime = new Client({ connectionString: env.DATABASE_URL, ssl: false });
  try {
    await cliente.connect();
    await runtime.connect();
    await cliente.query(lerSql("rollback/019_rls_rollback_dev.sql"));
    const flags = await cliente.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity");
    assert.deepEqual(flags.rows, [{ tablename: "verificacoes_email" }]);
    assert.ok((await runtime.query("SELECT id FROM propriedades")).rowCount > 0);
    assert.ok((await runtime.query("SELECT id FROM usuarios WHERE senha IS NOT NULL")).rowCount > 0);
    await runtime.query("SELECT id FROM verificacoes_email");
    await cliente.query(lerSql(ativacaoRls));
    assert.equal((await runtime.query("SELECT id FROM propriedades")).rowCount, 0);
    await assert.rejects(runtime.query("SELECT id FROM verificacoes_email"), { code: "42501" });
    console.log("OK rollback e reativação: flags e grants efetivos");
  } finally {
    await Promise.all([cliente.end(), runtime.end()]);
  }
}

async function main() {
  if (mode === "offline") {
    for (const file of ["security-hardening", "calf-management", "clima", "deletion-impact", "backend-regressions"]) run(`tests/${file}.js`);
    run("--test", "frontend", ["tests/api.test.js", "tests/financas.test.js"]);
    return;
  }
  const admin = new Client({ connectionString: adminUrl.href, ssl: false });
  let created = false;
  let logins = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const client = new Client({ connectionString: databaseUrl.href, ssl: false });
    try {
      await client.connect();
      for (const file of [
        "supabase/001_schema_bovitrack.sql", "supabase/003_sessoes_refresh.sql",
        "migrations/007_criar_producoes_leiteiras.sql", "migrations/008_criar_pesagens_desmamas.sql",
        "migrations/009_seguranca_sessoes_rate_limit.sql", "migrations/012_integridade_parentesco_indices.sql",
        mode === 'email' ? 'migrations/013_verificacao_email.sql' : 'migrations/020_estrutura_email_sem_revogar_sessoes.sql',
      ]) await client.query(readFileSync(path.join(root, "backend/database", file), "utf8"));
      // A nova migration precisa ser reaplicável sem perda de dados.
      await client.query(readFileSync(path.join(root, "backend/database/migrations/012_integridade_parentesco_indices.sql"), "utf8"));
      await client.query(readFileSync(path.join(root, 'backend/database/migrations', mode === 'email' ? '013_verificacao_email.sql' : '020_estrutura_email_sem_revogar_sessoes.sql'), 'utf8'));
      for (const name of preparacaoRls) await client.query(lerSql(`migrations/${name}`));
      await client.query(lerSql('migrations/021_email_verificacao_configuravel.sql'));
      await client.query('UPDATE bovitrack_seg.configuracao_email SET obrigatoria=$1',[env.EMAIL_VERIFICATION_REQUIRED === 'true']);
      await client.query("INSERT INTO bovitrack_seg.chaves_contexto VALUES (decode($1, 'hex'))", [env.DB_RLS_CONTEXT_KEY]);
      // As senhas hexadecimais são geradas acima e funcionam também com SCRAM.
      await client.query(`CREATE ROLE "${loginDominio}" LOGIN PASSWORD '${senhasLogin[loginDominio]}' IN ROLE bovitrack_runtime; CREATE ROLE "${loginAuth}" LOGIN PASSWORD '${senhasLogin[loginAuth]}' IN ROLE bovitrack_auth_runtime;`);
      logins = true;
      const hash = await bcrypt.hash(env.TEST_ADMIN_SENHA, 12);
      await client.query("INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Admin de teste',$1,$2,'admin')", [env.TEST_ADMIN_EMAIL, hash]);
      await client.query("INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Produtor E2E','e2e-owner@example.test',$1,'usuario')", [hash]);
      // Fixtures pré-verificadas de negócio; contas pendentes têm suíte própria.
      await client.query('UPDATE usuarios SET email_verificado=TRUE,email_verificado_em=CURRENT_TIMESTAMP');
      const prop = await client.query("INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) SELECT 'Fazenda E2E','Uberaba','MG',120,id FROM usuarios WHERE email='e2e-owner@example.test' RETURNING id");
      const propId = prop.rows[0].id;
      const animal = await client.query("INSERT INTO animais(nome,especie,raca,sexo,peso,propriedade_id,numero_brinco,data_nascimento) VALUES ('Mimosa E2E','Bovino','Holandesa','F',450,$1,'E2E-001','2024-01-01') RETURNING id", [propId]);
      const animalId = animal.rows[0].id;
      await client.query("INSERT INTO pesagens(animal_id,data_pesagem,peso_kg,tipo_pesagem) VALUES ($1,'2026-01-01',420,'ROTINA'),($1,'2026-06-01',450,'ROTINA')", [animalId]);
      await client.query("INSERT INTO producoes_leiteiras(animal_id,data,turno,quantidade_litros) VALUES ($1,'2026-01-01','manha',12.5)", [animalId]);
      await client.query("INSERT INTO lotes(nome,descricao,propriedade_id) VALUES ('Lote E2E','Lactação',$1)", [propId]);
      await client.query("INSERT INTO despesas(descricao,categoria,valor,data,propriedade_id) VALUES ('Ração E2E','Alimentação',100,'2026-01-01',$1)", [propId]);
      await client.query("INSERT INTO receitas(descricao,categoria,valor,data,propriedade_id) VALUES ('Leite E2E','VENDA_LEITE',250,'2026-01-01',$1)", [propId]);
      await client.query(lerSql(ativacaoRls));
    } finally { await client.end(); }
    if (mode !== "e2e") {
      const suiteCompleta = ["rls-isolamento", "email-verification", "auth-permissions", "milk-production",
        "receitas", "calf-management-integration", "backend-regressions-integration"];
      const suites = {
        email: ["email-verification"],
        'email-flag': ['email-feature-flag'],
        rls: ["rls-isolamento"],
      }[mode] || suiteCompleta;
      for (const file of suites) run(`tests/${file}.js`);
      if (mode !== "email") await testarRollback();
      run("scripts/check-security-readonly.js");
      const runtimeUrl = env.DATABASE_URL;
      env.DATABASE_URL = databaseUrl.href;
      run("scripts/check-database.js");
      run("scripts/check-deletion-integrity.js");
      env.DATABASE_URL = runtimeUrl;
    }
    if (['all', 'e2e'].includes(mode)) run("node_modules/@playwright/test/cli.js", "frontend", ["test", ...process.argv.slice(3)]);
    console.log(`OK: ${mode}; banco isolado será removido`);
  } finally {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (logins) await admin.query(`DROP ROLE "${loginDominio}", "${loginAuth}"`);
    await admin.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
