// Provisiona exclusivamente o projeto fixado na allowlist. Segredos são gerados
// no processo e gravados somente no arquivo privado ignorado pelo Git.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('../backend/node_modules/pg');
const dotenv = require('../backend/node_modules/dotenv');
const { criarConfiguracaoPorUrl } = require('../backend/database/config');
const { validarAllowlist, validarUrl, inspecionar } = require('./check-supabase-homologacao.cjs');
const root = path.resolve(__dirname, '..');
const privatePath = path.join(root, 'backend/.env.homologacao');

function carregar() {
  const alvo = JSON.parse(fs.readFileSync(path.join(__dirname, 'supabase-homologacao.json'), 'utf8'));
  validarAllowlist(alvo);
  const env = dotenv.parse(fs.readFileSync(privatePath));
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.BOVITRACK_HOMOLOGACAO, 'true');
  assert.equal(env.DB_SSL, 'verify-full');
  assert.equal(env.BOVITRACK_HOMOLOG_POOLER_HOST, alvo.poolerHost);
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  validarUrl(env.BOVITRACK_HOMOLOG_ADMIN_URL, 'admin', alvo);
  return { alvo, env };
}

function configuracaoAdmin(env) {
  return { ...criarConfiguracaoPorUrl(env.BOVITRACK_HOMOLOG_ADMIN_URL, {
    sslMode: env.DB_SSL, sslCaPath: env.DB_SSL_CA_PATH, sslCaBase64: env.DB_SSL_CA_BASE64, producao: true,
  }), connectionTimeoutMillis: 10000, query_timeout: 15000, statement_timeout: 15000 };
}

async function confirmarDestino(client, alvo) {
  const { rows: [row] } = await client.query(`SELECT current_database() AS database, current_user AS role,
    current_setting('server_version_num')::int AS version,
    pg_catalog.shobj_description(oid,'pg_database') AS marker
    FROM pg_catalog.pg_database WHERE datname=current_database()`);
  assert.equal(row.database, alvo.database);
  assert.equal(row.role, alvo.adminRole);
  assert.ok(row.version >= 170000 && row.version < 180000);
  assert.equal(row.marker, alvo.databaseMarker);
}

async function preparar() {
  assert.equal(process.argv.length, 2, 'Não aceita URLs/argumentos');
  const { alvo, env } = carregar();
  await inspecionar(env.BOVITRACK_HOMOLOG_ADMIN_URL, 'admin', alvo, env);
  const client = new Client(configuracaoAdmin(env));
  try {
    await client.connect();
    await client.query('BEGIN');
    await confirmarDestino(client, alvo);
    const existing = await client.query('SELECT rolname FROM pg_catalog.pg_roles WHERE rolname=ANY($1)',
      [[alvo.domainRole, alvo.authRole]]);
    assert.equal(existing.rowCount, 0, 'Logins já existem: não rotacionar ou sobrescrever credenciais automaticamente');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM bovitrack_seg.chaves_contexto')).rows[0].n, 0);
    const key = crypto.randomBytes(32).toString('hex');
    const domainPassword = crypto.randomBytes(36).toString('hex');
    const authPassword = crypto.randomBytes(36).toString('hex');
    // DDL não aceita bind em PASSWORD. A função temporária usa format(%L), com
    // senhas recebidas por bind; nenhum SQL literal contém o segredo.
    await client.query(`CREATE FUNCTION pg_temp.provisionar_homologacao(text,text) RETURNS void
      LANGUAGE plpgsql AS $$ BEGIN
        EXECUTE format('CREATE ROLE bovitrack_homolog_dominio LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1);
        EXECUTE format('CREATE ROLE bovitrack_homolog_auth LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $2);
      END $$`);
    await client.query('SELECT pg_temp.provisionar_homologacao($1,$2)', [domainPassword, authPassword]);
    await client.query('GRANT bovitrack_runtime TO bovitrack_homolog_dominio; GRANT bovitrack_auth_runtime TO bovitrack_homolog_auth');
    await client.query("INSERT INTO bovitrack_seg.chaves_contexto(chave) VALUES (decode($1,'hex'))", [key]);
    const runtimeUrl = (role, password) => {
      const url = new URL(`postgresql://${alvo.poolerHost}:6543/${alvo.database}`);
      url.username = `${role}.${alvo.projectRef}`; url.password = password;
      return url.href;
    };
    const generated = {
      DATABASE_URL: runtimeUrl(alvo.domainRole, domainPassword),
      DATABASE_AUTH_URL: runtimeUrl(alvo.authRole, authPassword), DB_RLS_CONTEXT_KEY: key,
      JWT_SECRET: crypto.randomBytes(48).toString('hex'), EMAIL_VERIFICATION_PEPPER: crypto.randomBytes(48).toString('hex'),
      TEST_ADMIN_SENHA: crypto.randomBytes(20).toString('hex'), RESEND_API_KEY: 're_mock_homologacao_no_network',
      EMAIL_FROM: 'BoviTrack <onboarding@resend.dev>', JWT_ACCESS_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
      JWT_ISSUER: 'bovitrack-api', JWT_AUDIENCE: 'bovitrack-web', FRONTEND_URL: 'http://127.0.0.1:5175',
      COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax', CSRF_ALLOW_NO_ORIGIN: 'true',
      APP_TIMEZONE: 'America/Sao_Paulo', DB_POOL_MAX: '3', DB_CONNECTION_TIMEOUT_MS: '10000',
      DB_QUERY_TIMEOUT_MS: '15000', DB_STATEMENT_TIMEOUT_MS: '15000',
    };
    for (const name of Object.keys(generated)) assert.ok(!env[name], 'Arquivo já contém configuração gerada; revisão manual necessária');
    validarUrl(generated.DATABASE_URL, 'domain', alvo);
    validarUrl(generated.DATABASE_AUTH_URL, 'auth', alvo);
    // Gravar antes do commit preserva os segredos se a resposta do COMMIT se
    // perder. Não repetir o provisionamento sem inspecionar o estado do banco.
    fs.appendFileSync(privatePath, '\n# Credenciais exclusivas geradas para homologação. Não versionar.\n' +
      Object.entries(generated).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
    await client.query('COMMIT');
    console.log('OK credenciais de domínio/auth e chave provisionadas; segredos somente no arquivo privado');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

if (require.main === module) preparar().catch((error) => {
  console.error('Provisionamento interrompido:', error.code || error.name,
    'Revise o estado do banco e o arquivo privado antes de repetir.');
  process.exitCode = 1;
});
module.exports = { carregar, configuracaoAdmin, confirmarDestino };
