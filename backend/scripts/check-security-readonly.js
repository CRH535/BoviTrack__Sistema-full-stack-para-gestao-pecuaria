require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const dominio = require("../database/pool");
const { obterPoolAutenticacao } = require("../database/poolAutenticacao");

const tabelas = [
  "usuarios", "sessoes_refresh", "sessoes_refresh_usados", "limites_requisicao", "verificacoes_email",
  "propriedades", "animais", "lotes", "animais_lotes", "vacinas", "vacinacoes", "despesas",
  "receitas", "producoes_leiteiras", "pesagens", "desmamas",
];

async function verificarLogin(banco, grupo, outroGrupo) {
  const { rows: [login] } = await banco.query(
    `SELECT current_user AS papel, pg_has_role(current_user,$1,'USAGE') AS grupo,
      EXISTS (SELECT FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'MEMBER')
        AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)) AS privilegiado,
      pg_has_role(current_user,'bovitrack_rls_interno','MEMBER')
        OR pg_has_role(current_user,'bovitrack_rls_identidade','MEMBER') AS interno,
      pg_has_role(current_user,$3,'MEMBER') AS outro_grupo,
      EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=ANY($2) AND pg_has_role(current_user,c.relowner,'MEMBER')) AS dono`,
    [grupo, tabelas, outroGrupo],
  );
  assert.ok(login.grupo && !login.privilegiado && !login.interno && !login.dono && !login.outro_grupo,
    "login ou membership incompatível");
  return login.papel;
}

async function verificar() {
  const auth = obterPoolAutenticacao();
  const [loginDominio, loginAuth] = await Promise.all([
    verificarLogin(dominio, "bovitrack_runtime", "bovitrack_auth_runtime"),
    verificarLogin(auth, "bovitrack_auth_runtime", "bovitrack_runtime"),
  ]);
  assert.notEqual(loginDominio, loginAuth);
  const { rows } = await dominio.query(
    `SELECT c.relname, c.relrowsecurity,
      EXISTS (SELECT FROM pg_policy p WHERE p.polrelid=c.oid) AS tem_policy,
      EXISTS (SELECT FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE'))) AS exposta
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY($1)`,
    [tabelas],
  );
  assert.equal(rows.length, tabelas.length);
  assert.ok(rows.every((t) => t.relrowsecurity && t.tem_policy && !t.exposta), "flag, policy ou ACL de API incompatível");
  assert.equal((await dominio.query("SELECT id FROM public.propriedades LIMIT 1")).rowCount, 0);
  assert.equal((await dominio.query("SELECT id FROM public.usuarios LIMIT 1")).rowCount, 0);
  for (const sql of [
    "SELECT senha FROM public.usuarios LIMIT 0",
    "SELECT token_hash FROM public.sessoes_refresh LIMIT 0",
    "SELECT codigo_hash FROM public.verificacoes_email LIMIT 0",
    "SELECT chave FROM bovitrack_seg.chaves_contexto LIMIT 0",
  ]) await assert.rejects(dominio.query(sql), { code: "42501" });
  await assert.rejects(auth.query("SELECT id FROM public.propriedades LIMIT 0"), { code: "42501" });
  await assert.rejects(auth.query("SELECT senha FROM public.usuarios LIMIT 0"), { code: "42501" });
  console.log("OK: dois logins distintos, 16 tabelas com RLS, grants sensíveis negados e zero linhas sem contexto");
}

verificar().catch((erro) => {
  console.error("Falha na verificação de segurança:", erro.code || erro.name);
  process.exitCode = 1;
}).finally(async () => {
  await dominio.end();
  if (process.env.DATABASE_AUTH_URL) await obterPoolAutenticacao().end().catch(() => {});
});
