BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['bovitrack_runtime', 'bovitrack_auth_runtime',
    'bovitrack_rls_identidade', 'bovitrack_rls_interno']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', papel);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel
               AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
      RAISE EXCEPTION 'Role insegura: %', papel;
    END IF;
  END LOOP;
  EXECUTE format('GRANT bovitrack_rls_identidade, bovitrack_rls_interno TO %I', current_user);
END $$;

CREATE SCHEMA bovitrack_seg;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$
BEGIN
  IF to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'pgcrypto.hmac deve estar no schema extensions';
  END IF;
END $$;

REVOKE ALL ON SCHEMA bovitrack_seg FROM PUBLIC;
GRANT USAGE ON SCHEMA bovitrack_seg TO bovitrack_runtime, bovitrack_auth_runtime;
GRANT USAGE, CREATE ON SCHEMA bovitrack_seg TO bovitrack_rls_identidade, bovitrack_rls_interno;
GRANT USAGE ON SCHEMA public TO bovitrack_rls_identidade, bovitrack_rls_interno;
GRANT USAGE ON SCHEMA extensions TO bovitrack_rls_identidade;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO bovitrack_rls_identidade;

CREATE TABLE bovitrack_seg.chaves_contexto (
  chave bytea PRIMARY KEY CHECK (octet_length(chave) = 32)
);
GRANT SELECT ON bovitrack_seg.chaves_contexto TO bovitrack_rls_identidade;
GRANT SELECT (id,nome,email,perfil,ativo,email_verificado) ON public.usuarios TO bovitrack_rls_identidade;
GRANT SELECT (usuario_id,session_id,expires_at,revoked_at,last_authenticated_at)
  ON public.sessoes_refresh TO bovitrack_rls_identidade;

-- xid8 vincula o atestado a uma única transação, inclusive após reuso pelo pooler.
CREATE FUNCTION bovitrack_seg.desafio() RETURNS text
LANGUAGE sql VOLATILE SET search_path = pg_catalog, pg_temp
AS $$ SELECT pg_current_xact_id()::text $$;

SET LOCAL ROLE bovitrack_rls_identidade;
CREATE FUNCTION bovitrack_seg.identidade_assinada()
RETURNS TABLE (uid integer, sid text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  WITH contexto AS (
    SELECT current_setting('bovitrack.usuario_id', true) AS id,
           current_setting('bovitrack.session_id', true) AS sessao,
           current_setting('bovitrack.assinatura', true) AS assinatura,
           current_setting('bovitrack.finalidade', true) AS finalidade
  )
  SELECT CASE WHEN id ~ '^[1-9][0-9]{0,9}$' THEN
           CASE WHEN id::bigint <= 2147483647 THEN id::integer END END, sessao
    FROM contexto
   WHERE sessao ~ '^[0-9a-f]{64}$'
     AND assinatura ~ '^[0-9a-f]{64}$'
     AND finalidade IN ('dominio','exclusao')
     AND pg_current_xact_id_if_assigned() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM bovitrack_seg.chaves_contexto c
        WHERE encode(extensions.hmac(
          convert_to('bovitrack-rls-v1:' || pg_current_xact_id_if_assigned()::text ||
                     ':' || id || ':' || sessao || ':' || finalidade, 'UTF8'), c.chave, 'sha256'), 'hex') = assinatura
     )
$$;

CREATE FUNCTION bovitrack_seg.sessao_atual()
RETURNS TABLE (id integer, nome varchar, email varchar, perfil varchar, ativo boolean, email_verificado boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.email_verificado
    FROM bovitrack_seg.identidade_assinada() ctx
    JOIN public.usuarios u ON u.id = ctx.uid
    JOIN public.sessoes_refresh s ON s.usuario_id = u.id AND s.session_id = ctx.sid
   WHERE u.ativo AND s.revoked_at IS NULL AND s.expires_at > statement_timestamp()
$$;

CREATE FUNCTION bovitrack_seg.admin_recente() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT FROM bovitrack_seg.sessao_atual() a
    JOIN bovitrack_seg.identidade_assinada() ctx ON ctx.uid = a.id
    JOIN public.sessoes_refresh s ON s.usuario_id = ctx.uid AND s.session_id = ctx.sid
    WHERE a.email_verificado AND a.perfil = 'admin'
      AND s.last_authenticated_at BETWEEN statement_timestamp() - interval '15 minutes' AND statement_timestamp()
  )
$$;

CREATE FUNCTION bovitrack_seg.prova_operacao(text,text,text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_current_xact_id_if_assigned() IS NOT NULL
    AND $1 IN ('login','email') AND $3 ~ '^[0-9a-f]{64}$' AND EXISTS (
      SELECT FROM bovitrack_seg.chaves_contexto c
      WHERE encode(extensions.hmac(convert_to(
        'bovitrack-' || $1 || '-v1:' || pg_current_xact_id_if_assigned()::text || ':' ||
        $2, 'UTF8'), c.chave, 'sha256'), 'hex') = $3
    )
$$;
RESET ROLE;

CREATE FUNCTION bovitrack_seg.ator_id() RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT id FROM bovitrack_seg.sessao_atual() WHERE email_verificado $$;
CREATE FUNCTION bovitrack_seg.eh_admin() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM bovitrack_seg.sessao_atual() WHERE email_verificado AND perfil = 'admin') $$;
CREATE FUNCTION bovitrack_seg.em_exclusao() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT (SELECT bovitrack_seg.ator_id()) IS NOT NULL AND
    current_setting('bovitrack.finalidade', true) = 'exclusao'
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bovitrack_seg FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bovitrack_seg.desafio(), bovitrack_seg.sessao_atual(),
  bovitrack_seg.ator_id(), bovitrack_seg.eh_admin(), bovitrack_seg.em_exclusao(),
  bovitrack_seg.admin_recente() TO bovitrack_runtime;
GRANT EXECUTE ON FUNCTION bovitrack_seg.sessao_atual(),
  bovitrack_seg.ator_id(), bovitrack_seg.eh_admin(), bovitrack_seg.admin_recente(),
  bovitrack_seg.prova_operacao(text,text,text)
  TO bovitrack_rls_interno;
GRANT EXECUTE ON FUNCTION bovitrack_seg.desafio() TO bovitrack_auth_runtime;

CREATE POLICY rls_identidade ON public.usuarios FOR SELECT TO bovitrack_rls_identidade
  USING (ativo AND id = (SELECT uid FROM bovitrack_seg.identidade_assinada()));
CREATE POLICY rls_identidade ON public.sessoes_refresh FOR SELECT TO bovitrack_rls_identidade
  USING (revoked_at IS NULL AND expires_at > statement_timestamp() AND EXISTS (
    SELECT 1 FROM bovitrack_seg.identidade_assinada() ctx
    WHERE ctx.uid = usuario_id AND ctx.sid = session_id
  ));
COMMIT;
