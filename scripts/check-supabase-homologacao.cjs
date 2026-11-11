// Preflight remoto somente leitura. Não carrega .env, não aplica migrations e
// não altera os guards dos runners locais. A allowlist é versionada separadamente.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('../backend/node_modules/pg');
const { criarConfiguracaoPorUrl } = require('../backend/database/config');

const PROJETOS_PROTEGIDOS = ['znpmzebrryqtjkgnvlcw', 'xvkowermbihkqslcgwzo'];

function validarAllowlist(alvo) {
  assert.match(alvo.projectRef || '', /^[a-z]{20}$/, 'Homologação ainda não aprovada na allowlist');
  assert.ok(!PROJETOS_PROTEGIDOS.includes(alvo.projectRef), 'Projeto protegido não pode ser homologação');
  assert.equal(alvo.database, 'postgres');
  assert.equal(alvo.region, 'sa-east-1');
  assert.match(alvo.poolerHost || '', /^aws-\d+-sa-east-1\.pooler\.supabase\.com$/);
  assert.match(alvo.databaseMarker || '', new RegExp(`^bovitrack-homologacao:${alvo.projectRef}:[a-f0-9]{64}$`));
  assert.equal(alvo.adminRole, 'postgres');
  assert.equal(alvo.domainRole, 'bovitrack_homolog_dominio');
  assert.equal(alvo.authRole, 'bovitrack_homolog_auth');
}

function validarUrl(valor, tipo, alvo) {
  validarAllowlist(alvo);
  let url;
  try { url = new URL(valor); } catch { throw new Error('URL de homologação ausente ou inválida'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Protocolo PostgreSQL obrigatório');
  assert.ok(!url.search && !url.hash, 'Parâmetros e fragmentos de URL são proibidos');
  assert.equal(url.pathname, `/${alvo.database}`, 'Database inesperado');
  assert.ok(url.password, 'Credencial exclusiva obrigatória');
  const papel = { admin: alvo.adminRole, domain: alvo.domainRole, auth: alvo.authRole }[tipo];
  assert.ok(papel, 'Tipo de conexão inválido');
  if (tipo === 'admin' && url.hostname === `db.${alvo.projectRef}.supabase.co`) {
    assert.equal(url.port, '5432', 'Admin direto exige porta 5432');
    assert.equal(decodeURIComponent(url.username), papel, 'Login administrativo inesperado');
  } else {
    assert.equal(url.hostname, alvo.poolerHost, 'Host fora da allowlist');
    assert.equal(url.port, tipo === 'admin' ? '5432' : '6543', 'Modo do pooler incorreto');
    assert.equal(decodeURIComponent(url.username), `${papel}.${alvo.projectRef}`, 'Login/ref fora da allowlist');
  }
  return url;
}

function validarIdentidade(row, tipo, alvo) {
  assert.equal(row.database, alvo.database, 'Database SQL inesperado');
  assert.equal(row.marker, alvo.databaseMarker, 'Marcador SQL de isolamento não confere');
  assert.ok(row.version >= 170000 && row.version < 180000, 'Homologação exige PostgreSQL 17');
  const papel = { admin: alvo.adminRole, domain: alvo.domainRole, auth: alvo.authRole }[tipo];
  assert.equal(row.session_user, papel, 'Login SQL inesperado');
  assert.equal(row.current_user, papel, 'Role efetiva inesperada');
  if (tipo !== 'admin') {
    assert.equal(row.privileged, false, 'Runtime possui privilégios administrativos');
    assert.equal(row.owns_objects, false, 'Runtime é proprietário de objetos');
    assert.equal(row.internal_membership, false, 'Runtime herda role interna');
    assert.equal(row.expected_membership, true, 'Membership de runtime ausente');
    assert.equal(row.other_membership, false, 'As credenciais de domínio/auth não estão isoladas');
  }
}

async function inspecionar(valor, tipo, alvo, ambiente) {
  const url = validarUrl(valor, tipo, alvo);
  assert.equal(ambiente.DB_SSL, 'verify-full', 'TLS verify-full obrigatório');
  assert.notEqual(ambiente.NODE_TLS_REJECT_UNAUTHORIZED, '0', 'Validação TLS global desabilitada');
  const client = new Client({
    ...criarConfiguracaoPorUrl(url.href, {
      sslMode: 'verify-full', sslCaPath: ambiente.DB_SSL_CA_PATH,
      sslCaBase64: ambiente.DB_SSL_CA_BASE64, producao: true,
    }),
    connectionTimeoutMillis: 10000, query_timeout: 15000, statement_timeout: 15000,
    application_name: 'bovitrack-homologacao-preflight',
  });
  try {
    await client.connect();
    assert.equal(client.connection.stream.encrypted, true, 'Transporte sem TLS');
    assert.equal(client.connection.stream.authorized, true, 'Certificado TLS não autorizado');
    await client.query('BEGIN READ ONLY');
    const { rows: [row] } = await client.query(`
      SELECT current_database() AS database, session_user, current_user,
        current_setting('server_version_num')::int AS version,
        pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
        EXISTS (SELECT FROM pg_catalog.pg_roles r
          WHERE pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER')
          AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)) AS privileged,
        EXISTS (SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE pg_catalog.pg_has_role(current_user,c.relowner,'MEMBER')
            AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema')
          OR EXISTS (SELECT FROM pg_catalog.pg_namespace n
            WHERE pg_catalog.pg_has_role(current_user,n.nspowner,'MEMBER')
              AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema')
          OR EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
            WHERE pg_catalog.pg_has_role(current_user,p.proowner,'MEMBER')
              AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') AS owns_objects,
        EXISTS (SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('bovitrack_rls_interno','bovitrack_rls_identidade')
          AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER')) AS internal_membership,
        EXISTS (SELECT FROM pg_catalog.pg_roles r WHERE r.rolname=$1
          AND pg_catalog.pg_has_role(current_user,r.oid,'USAGE')) AS expected_membership,
        EXISTS (SELECT FROM pg_catalog.pg_roles r WHERE r.rolname=$2
          AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER')) AS other_membership
      FROM pg_catalog.pg_database d WHERE d.datname=current_database()`,
    [tipo === 'auth' ? 'bovitrack_auth_runtime' : 'bovitrack_runtime',
      tipo === 'auth' ? 'bovitrack_runtime' : 'bovitrack_auth_runtime']);
    validarIdentidade(row, tipo, alvo);
    const { rows: tables } = await client.query(`SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
    await client.query('COMMIT');
    // Nunca retorna a URL, senha, CA ou marcador completo.
    return { tipo, projectRef: alvo.projectRef, host: url.hostname, port: Number(url.port),
      database: row.database, version: row.version, role: row.current_user, tls: 'verify-full', tables };
  } finally { await client.end().catch(() => {}); }
}

async function main() {
  assert.equal(process.argv.length, 2, 'Este preflight não aceita argumentos nem URLs por parâmetros');
  const alvo = JSON.parse(readFileSync(path.join(__dirname, 'supabase-homologacao.json'), 'utf8'));
  validarAllowlist(alvo); // Falha antes de qualquer conexão enquanto não houver projeto aprovado.
  assert.equal(process.env.BOVITRACK_HOMOLOGACAO, 'true', 'Configuração exclusiva de homologação obrigatória');
  assert.equal(process.env.NODE_ENV, 'test', 'Preflight exige NODE_ENV=test');
  const urls = { admin: process.env.BOVITRACK_HOMOLOG_ADMIN_URL,
    domain: process.env.DATABASE_URL, auth: process.env.DATABASE_AUTH_URL };
  // Valida todos os destinos antes da primeira conexão.
  for (const [tipo, url] of Object.entries(urls)) validarUrl(url, tipo, alvo);
  for (const [tipo, url] of Object.entries(urls)) console.log(JSON.stringify(await inspecionar(url, tipo, alvo, process.env)));
  const security = spawnSync(process.execPath, ['scripts/check-security-readonly.js'], {
    cwd: path.join(__dirname, '../backend'), env: process.env, encoding: 'utf8', timeout: 120000,
  });
  assert.equal(security.status, 0, 'Flags RLS, policies, grants ou isolamento sem contexto incompatíveis');
  console.log('OK segurança: 16 tabelas com RLS/policies, credenciais separadas, grants sensíveis negados e ausência de contexto');
}

if (require.main === module) main().catch(() => {
  console.error('Preflight recusado: confira allowlist aprovada, marcador SQL, PostgreSQL 17, roles, credenciais exclusivas e TLS. Nenhuma escrita executada.');
  process.exitCode = 1;
});
module.exports = { validarAllowlist, validarUrl, validarIdentidade, inspecionar };
