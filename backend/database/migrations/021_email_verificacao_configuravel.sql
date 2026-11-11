-- Correcao aditiva para bancos com 014-018, com ou sem 019 ativa.
-- O padrao TRUE preserva o comportamento dos bancos que ja aplicaram 013.
-- O corte planejado grava FALSE administrativamente antes de abrir o trafego.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- A 016 remove CREATE dos donos NOLOGIN; conceder apenas dentro desta transacao.
GRANT CREATE ON SCHEMA bovitrack_seg TO bovitrack_rls_identidade,bovitrack_rls_interno;
CREATE TABLE IF NOT EXISTS bovitrack_seg.configuracao_email (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  obrigatoria boolean NOT NULL
);
INSERT INTO bovitrack_seg.configuracao_email VALUES(true,true) ON CONFLICT(singleton) DO NOTHING;
REVOKE ALL ON bovitrack_seg.configuracao_email FROM PUBLIC,bovitrack_runtime,bovitrack_auth_runtime,bovitrack_rls_interno;
GRANT SELECT ON bovitrack_seg.configuracao_email TO bovitrack_rls_identidade;
SET LOCAL ROLE bovitrack_rls_identidade;
CREATE OR REPLACE FUNCTION bovitrack_seg.email_verificacao_obrigatoria() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT coalesce((SELECT obrigatoria FROM bovitrack_seg.configuracao_email WHERE singleton),true) $$;
REVOKE ALL ON FUNCTION bovitrack_seg.email_verificacao_obrigatoria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bovitrack_seg.email_verificacao_obrigatoria() TO bovitrack_runtime,bovitrack_auth_runtime,bovitrack_rls_interno;
CREATE OR REPLACE FUNCTION bovitrack_seg.admin_recente() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT FROM bovitrack_seg.sessao_atual() a
    JOIN bovitrack_seg.identidade_assinada() ctx ON ctx.uid = a.id
    JOIN public.sessoes_refresh s ON s.usuario_id = ctx.uid AND s.session_id = ctx.sid
    WHERE (a.email_verificado OR NOT bovitrack_seg.email_verificacao_obrigatoria()) AND a.perfil = 'admin'
      AND s.last_authenticated_at BETWEEN statement_timestamp() - interval '15 minutes' AND statement_timestamp()
  )
$$;
RESET ROLE;
CREATE OR REPLACE FUNCTION bovitrack_seg.ator_id() RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT id FROM bovitrack_seg.sessao_atual() WHERE email_verificado OR NOT bovitrack_seg.email_verificacao_obrigatoria() $$;
CREATE OR REPLACE FUNCTION bovitrack_seg.eh_admin() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM bovitrack_seg.sessao_atual() WHERE (email_verificado OR NOT bovitrack_seg.email_verificacao_obrigatoria()) AND perfil = 'admin') $$;
SET LOCAL ROLE bovitrack_rls_interno;
CREATE OR REPLACE FUNCTION bovitrack_seg.abrir_sessao(integer,text,text,text,text,timestamptz,timestamptz,text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF bovitrack_seg.prova_operacao('login',$1 || ':' || $3 || ':' || $4 || ':' || $5,$8)
     IS DISTINCT FROM true THEN
    RAISE insufficient_privilege;
  END IF;
  PERFORM 1 FROM public.usuarios u
   WHERE u.id = $1 AND u.senha = $2 AND u.ativo AND (u.email_verificado OR NOT bovitrack_seg.email_verificacao_obrigatoria()) FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.sessoes_refresh WHERE expires_at <= now();
  INSERT INTO public.sessoes_refresh
    (usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at)
    VALUES ($1,$3,$4,$5,$6,$7);
  DELETE FROM public.sessoes_refresh s WHERE s.usuario_id = $1 AND s.id IN (
    SELECT antiga.id FROM public.sessoes_refresh antiga WHERE antiga.usuario_id = $1
     ORDER BY antiga.created_at DESC, antiga.id DESC OFFSET 10
  );
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION bovitrack_seg.rodar_refresh(text,text)
RETURNS TABLE (estado text, session_id varchar, family_id varchar, expires_at timestamptz,
  last_authenticated_at timestamptz, usuario_id integer, nome varchar, email varchar, perfil varchar, ativo boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE atual record; usado record;
BEGIN
  -- Conta antes da sessão, assim como alteração de e-mail e desativação.
  PERFORM u.id FROM public.usuarios u JOIN public.sessoes_refresh s ON s.usuario_id = u.id
    WHERE s.token_hash = $1 FOR SHARE OF u;
  SELECT s.id,s.session_id,s.family_id,s.expires_at,s.last_authenticated_at,s.revoked_at,
         u.id AS usuario_id,u.nome,u.email,u.perfil,u.ativo,u.email_verificado INTO atual
    FROM public.sessoes_refresh s JOIN public.usuarios u ON u.id = s.usuario_id
   WHERE s.token_hash = $1 FOR UPDATE OF s;
  IF NOT FOUND THEN
    SELECT h.family_id,h.used_at,s.revoked_at INTO usado
      FROM public.sessoes_refresh_usados h JOIN public.sessoes_refresh s ON s.id = h.sessao_id
     WHERE h.token_hash = $1;
    IF NOT FOUND OR usado.revoked_at IS NOT NULL THEN RETURN; END IF;
    IF clock_timestamp() - usado.used_at > interval '5 seconds' THEN
      UPDATE public.sessoes_refresh s SET revoked_at = now(), revoke_reason = 'REPLAY'
        WHERE s.family_id = usado.family_id AND s.revoked_at IS NULL;
      estado := 'replay';
    ELSE
      estado := 'concorrente';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;
  IF atual.revoked_at IS NOT NULL OR NOT atual.ativo OR atual.expires_at <= clock_timestamp() THEN RETURN; END IF;
  IF bovitrack_seg.email_verificacao_obrigatoria() AND NOT atual.email_verificado THEN
    UPDATE public.sessoes_refresh s SET revoked_at = now(), revoke_reason = 'EMAIL_NOT_VERIFIED'
      WHERE s.usuario_id = atual.usuario_id AND s.revoked_at IS NULL;
    estado := 'emailNaoVerificado';
    RETURN NEXT;
    RETURN;
  END IF;
  INSERT INTO public.sessoes_refresh_usados(token_hash,sessao_id,family_id,expires_at)
    VALUES ($1,atual.id,atual.family_id,atual.expires_at) ON CONFLICT (token_hash) DO NOTHING;
  UPDATE public.sessoes_refresh s SET token_hash = $2, rotated_at = now() WHERE s.id = atual.id;
  RETURN QUERY SELECT 'ok'::text,atual.session_id,atual.family_id,atual.expires_at,
    atual.last_authenticated_at,atual.usuario_id,atual.nome,atual.email,atual.perfil,atual.ativo;
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA bovitrack_seg FROM bovitrack_rls_identidade,bovitrack_rls_interno;
COMMIT;
