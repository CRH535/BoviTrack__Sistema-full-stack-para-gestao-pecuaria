const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validarAllowlist, validarUrl, validarIdentidade } = require('./check-supabase-homologacao.cjs');
// Identificador fictício; este teste não abre conexões.
const ref = 'abcdefghijklmnopqrst';
const alvo = { projectRef: ref, region: 'sa-east-1', poolerHost: 'aws-0-sa-east-1.pooler.supabase.com',
  database: 'postgres', databaseMarker: `bovitrack-homologacao:${ref}:${'a'.repeat(64)}`,
  adminRole: 'postgres', domainRole: 'bovitrack_homolog_dominio', authRole: 'bovitrack_homolog_auth' };
const url = `postgresql://${alvo.domainRole}.${ref}:fixture@${alvo.poolerHost}:6543/postgres`;
validarUrl(url, 'domain', alvo);
validarUrl(`postgresql://postgres:fixture@db.${ref}.supabase.co:5432/postgres`, 'admin', alvo);
validarUrl(`postgresql://${alvo.authRole}.${ref}:fixture@${alvo.poolerHost}:6543/postgres`, 'auth', alvo);
for (const projectRef of [null, 'znpmzebrryqtjkgnvlcw', 'xvkowermbihkqslcgwzo']) {
  assert.throws(() => validarAllowlist({ ...alvo, projectRef }));
}
for (const invalida of [
  url + '?host=db.znpmzebrryqtjkgnvlcw.supabase.co', url + '?sslmode=disable', url + '#override',
  url.replace(':6543', ':5432'), url.replace(ref, 'znpmzebrryqtjkgnvlcw'),
  url.replace(alvo.poolerHost, 'unexpected.invalid'), url.replace('/postgres', '/another'),
  url.replace('postgresql:', 'https:'), url.replace(':fixture@', '@'),
  url.replace(alvo.domainRole, alvo.authRole),
]) assert.throws(() => validarUrl(invalida, 'domain', alvo));
const row = { database: 'postgres', marker: alvo.databaseMarker, version: 170006,
  session_user: alvo.domainRole, current_user: alvo.domainRole, privileged: false,
  owns_objects: false, internal_membership: false, expected_membership: true, other_membership: false };
validarIdentidade(row, 'domain', alvo);
for (const mudanca of [
  { database: 'other' }, { marker: 'bovitrack-homologacao:wrong' }, { version: 180004 },
  { version: 160000 }, { session_user: 'postgres' }, { current_user: 'postgres' },
  { privileged: true }, { owns_objects: true }, { internal_membership: true },
  { expected_membership: false }, { other_membership: true },
]) assert.throws(() => validarIdentidade({ ...row, ...mudanca }, 'domain', alvo));
const result = spawnSync(process.execPath, [require.resolve('./check-supabase-homologacao.cjs')], { encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: 'postgresql://postgres:must-not-print@db.znpmzebrryqtjkgnvlcw.supabase.co:5432/postgres' } });
assert.equal(result.status, 1);
assert.match(result.stderr, /Preflight recusado/);
assert.ok(!result.stderr.includes('must-not-print'));
console.log('OK guard de homologação: destinos, projetos protegidos, identidade SQL, versão, roles e falha fechada sem credenciais nos logs');
