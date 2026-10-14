require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { criarConfiguracaoPorUrl } = require('../database/config');

async function executar() {
  if (!process.env.SUPABASE_MIGRATION_URL) throw new Error('SUPABASE_MIGRATION_URL não foi configurada');
  const cliente = new Client(criarConfiguracaoPorUrl(process.env.SUPABASE_MIGRATION_URL, {
    sslMode: process.env.DB_SSL, sslCaPath: process.env.DB_SSL_CA_PATH,
    sslCaBase64: process.env.DB_SSL_CA_BASE64, producao: process.env.NODE_ENV === 'production',
  }));
  try {
    await cliente.connect();
    await cliente.query('BEGIN READ ONLY');
    const { rows } = await cliente.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE email IS NULL OR btrim(email) = '')::int AS sem_email,
      count(*) FILTER (WHERE email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')::int AS invalidos,
      count(*) FILTER (WHERE email <> lower(btrim(email)))::int AS nao_normalizados,
      count(*) FILTER (WHERE perfil = 'admin')::int AS administradores,
      count(*) FILTER (WHERE perfil NOT IN ('admin', 'usuario'))::int AS perfis_especiais,
      count(*) FILTER (WHERE split_part(email,'@',2) ~ '(^localhost$|[.](local|test|invalid|example)$)')::int AS dominios_nao_publicos,
      (SELECT count(*)::int FROM (SELECT lower(btrim(email)) FROM usuarios GROUP BY lower(btrim(email)) HAVING count(*) > 1) d) AS duplicados
      FROM usuarios`);
    await cliente.query('COMMIT');
    console.log('Auditoria agregada (sem endereços pessoais):', rows[0]);
    if (rows[0].sem_email || rows[0].invalidos || rows[0].nao_normalizados || rows[0].duplicados || rows[0].perfis_especiais || rows[0].dominios_nao_publicos) {
      throw new Error('Auditoria encontrou inconsistências. Resolva antes de aplicar a migration');
    }
    if (process.argv.includes('--check')) return;
    const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/013_verificacao_email.sql'), 'utf8');
    await cliente.query(sql);
    console.log('Migration 013 aplicada. Contas pendentes precisam verificar o e-mail e fazer novo login.');
  } finally { await cliente.end().catch(() => {}); }
}
executar().catch(() => {
  // Mensagens de conexão/SQL podem conter informações pessoais ou credenciais.
  console.error('Migration 013 não aplicada. Verifique auditoria, credencial administrativa, TLS e migrations anteriores.');
  process.exitCode = 1;
});
