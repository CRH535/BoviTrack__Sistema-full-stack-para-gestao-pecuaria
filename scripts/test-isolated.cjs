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
if (!["all", "integration", "e2e", "offline"].includes(mode)) throw new Error("Modo inválido");
const adminUrl = new URL(process.env.BOVITRACK_TEST_POSTGRES_URL || "postgresql://postgres@127.0.0.1:55432/postgres");
if (adminUrl.search || adminUrl.hash || !['postgres:', 'postgresql:'].includes(adminUrl.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname)) {
  throw new Error("Testes exigem PostgreSQL em loopback; URLs externas são recusadas");
}
const database = `bovitrack_test_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${database}`;
const env = {
  ...process.env, NODE_ENV: "test", VERCEL: "", DATABASE_URL: databaseUrl.href,
  DB_SSL: "disable", DB_SSL_CA_BASE64: "", DB_SSL_CA_PATH: "",
  JWT_SECRET: crypto.randomBytes(48).toString("hex"), JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d", JWT_ISSUER: "bovitrack-api", JWT_AUDIENCE: "bovitrack-web",
  FRONTEND_URL: "http://127.0.0.1:5175", CORS_ALLOW_LOCALHOST: "false",
  CSRF_ALLOW_NO_ORIGIN: "true", COOKIE_SECURE: "false", COOKIE_SAME_SITE: "lax",
  APP_TIMEZONE: "America/Sao_Paulo", ALLOW_TEST_DB_WRITES: "true",
  TEST_ADMIN_EMAIL: "admin@example.test", TEST_ADMIN_SENHA: "IsolatedAdmin#2026",
  BOVITRACK_E2E_ISOLATED: "true", PORT: "3005", VITE_API_URL: "http://127.0.0.1:3005",
};

function run(relativeFile, cwd = "backend", args = []) {
  const result = spawnSync(process.execPath, [relativeFile, ...args], { cwd: path.join(root, cwd), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falhou: ${relativeFile} (exit ${result.status})`);
}

async function main() {
  if (mode === "offline") {
    for (const file of ["security-hardening", "calf-management", "clima", "deletion-impact", "backend-regressions"]) run(`tests/${file}.js`);
    run("--test", "frontend", ["tests/api.test.js", "tests/financas.test.js"]);
    return;
  }
  const admin = new Client({ connectionString: adminUrl.href, ssl: false });
  let created = false;
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
      ]) await client.query(readFileSync(path.join(root, "backend/database", file), "utf8"));
      // A nova migration precisa ser reaplicável sem perda de dados.
      await client.query(readFileSync(path.join(root, "backend/database/migrations/012_integridade_parentesco_indices.sql"), "utf8"));
      const hash = await bcrypt.hash(env.TEST_ADMIN_SENHA, 12);
      await client.query("INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Admin de teste',$1,$2,'admin')", [env.TEST_ADMIN_EMAIL, hash]);
      await client.query("INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Produtor E2E','e2e-owner@example.test',$1,'usuario')", [hash]);
      const prop = await client.query("INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) SELECT 'Fazenda E2E','Uberaba','MG',120,id FROM usuarios WHERE email='e2e-owner@example.test' RETURNING id");
      const propId = prop.rows[0].id;
      const animal = await client.query("INSERT INTO animais(nome,especie,raca,sexo,peso,propriedade_id,numero_brinco,data_nascimento) VALUES ('Mimosa E2E','Bovino','Holandesa','F',450,$1,'E2E-001','2024-01-01') RETURNING id", [propId]);
      const animalId = animal.rows[0].id;
      await client.query("INSERT INTO pesagens(animal_id,data_pesagem,peso_kg,tipo_pesagem) VALUES ($1,'2026-01-01',420,'ROTINA'),($1,'2026-06-01',450,'ROTINA')", [animalId]);
      await client.query("INSERT INTO producoes_leiteiras(animal_id,data,turno,quantidade_litros) VALUES ($1,'2026-01-01','manha',12.5)", [animalId]);
      await client.query("INSERT INTO lotes(nome,descricao,propriedade_id) VALUES ('Lote E2E','Lactação',$1)", [propId]);
      await client.query("INSERT INTO despesas(descricao,categoria,valor,data,propriedade_id) VALUES ('Ração E2E','Alimentação',100,'2026-01-01',$1)", [propId]);
      await client.query("INSERT INTO receitas(descricao,categoria,valor,data,propriedade_id) VALUES ('Leite E2E','VENDA_LEITE',250,'2026-01-01',$1)", [propId]);
    } finally { await client.end(); }
    if (mode !== "e2e") {
      for (const file of ["auth-permissions", "milk-production", "receitas", "calf-management-integration", "backend-regressions-integration"]) run(`tests/${file}.js`);
      run("scripts/check-database.js");
      run("scripts/check-deletion-integrity.js");
    }
    if (mode !== "integration") run("node_modules/@playwright/test/cli.js", "frontend", ["test", ...process.argv.slice(3)]);
    console.log(`OK: ${mode}; banco isolado será removido`);
  } finally {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
