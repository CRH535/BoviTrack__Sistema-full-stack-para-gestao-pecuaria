require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { criarConfiguracaoPorUrl } = require("../database/config");
const { registrarErro } = require("../utils/log");

async function executar() {
  const url = process.env.SUPABASE_MIGRATION_URL;
  if (!url) throw new Error("SUPABASE_MIGRATION_URL nao foi configurada");
  const cliente = new Client(criarConfiguracaoPorUrl(url, {
    sslMode: process.env.DB_SSL,
    sslCaPath: process.env.DB_SSL_CA_PATH,
    sslCaBase64: process.env.DB_SSL_CA_BASE64,
    producao: process.env.NODE_ENV === "production",
  }));
  try {
    await cliente.connect();
    const sql = fs.readFileSync(path.join(__dirname, "../database/migrations/012_integridade_parentesco_indices.sql"), "utf8");
    await cliente.query(sql);
    console.log("Migration 012 de integridade e indices aplicada sem alterar historicos.");
  } finally {
    await cliente.end().catch(() => {});
  }
}

executar().catch((erro) => {
  registrarErro("migration_integridade_erro", erro);
  console.error("Falha na migration 012. Verifique a configuracao administrativa e as migrations anteriores.");
  process.exitCode = 1;
});
