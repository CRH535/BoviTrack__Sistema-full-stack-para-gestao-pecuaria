BEGIN;
SET LOCAL lock_timeout = '5s';

GRANT SELECT (id,nome,email,senha,perfil,ativo,created_at,email_verificado)
  ON public.usuarios TO bovitrack_rls_interno;
GRANT INSERT (nome,email,senha,perfil,ativo), UPDATE (ativo,email_verificado,email_verificado_em)
  ON public.usuarios TO bovitrack_rls_interno;
GRANT SELECT, INSERT, DELETE ON public.sessoes_refresh TO bovitrack_rls_interno;
GRANT UPDATE (token_hash,rotated_at,revoked_at,revoke_reason) ON public.sessoes_refresh TO bovitrack_rls_interno;
GRANT SELECT, INSERT ON public.sessoes_refresh_usados TO bovitrack_rls_interno;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.limites_requisicao TO bovitrack_rls_interno;
GRANT SELECT, INSERT, UPDATE ON public.verificacoes_email TO bovitrack_rls_interno;
GRANT USAGE ON SEQUENCE public.usuarios_id_seq, public.sessoes_refresh_id_seq TO bovitrack_rls_interno;

-- Papel NOLOGIN sem membership nos logins da aplicação. A superfície externa
-- consiste apenas nas funções específicas e os GRANTs de coluna acima.
CREATE POLICY rls_interno_select ON public.usuarios FOR SELECT TO bovitrack_rls_interno USING (id > 0);
CREATE POLICY rls_interno_insert ON public.usuarios FOR INSERT TO bovitrack_rls_interno
  WITH CHECK (perfil = 'usuario' AND ativo AND NOT email_verificado);
CREATE POLICY rls_interno_update ON public.usuarios FOR UPDATE TO bovitrack_rls_interno
  USING (id > 0) WITH CHECK (id > 0);
CREATE POLICY rls_interno ON public.sessoes_refresh TO bovitrack_rls_interno
  USING (usuario_id > 0) WITH CHECK (usuario_id > 0);
CREATE POLICY rls_interno_select ON public.sessoes_refresh_usados FOR SELECT TO bovitrack_rls_interno
  USING (sessao_id > 0);
CREATE POLICY rls_interno_insert ON public.sessoes_refresh_usados FOR INSERT TO bovitrack_rls_interno
  WITH CHECK (sessao_id > 0);
CREATE POLICY rls_interno ON public.limites_requisicao TO bovitrack_rls_interno
  USING (contador > 0) WITH CHECK (contador > 0);
CREATE POLICY rls_interno ON public.verificacoes_email TO bovitrack_rls_interno
  USING (usuario_id > 0) WITH CHECK (usuario_id > 0);

SET LOCAL ROLE bovitrack_rls_interno;

CREATE FUNCTION bovitrack_seg.credencial_login(text)
RETURNS TABLE (id integer, nome varchar, email varchar, senha varchar, perfil varchar, ativo boolean, email_verificado boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id,u.nome,u.email,u.senha,u.perfil,u.ativo,u.email_verificado
  FROM public.usuarios u WHERE lower(btrim(u.email)) = $1
$$;

CREATE FUNCTION bovitrack_seg.cadastrar(text,text,text)
RETURNS TABLE (id integer, nome varchar, email varchar, perfil varchar, ativo boolean, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.usuarios AS u (nome,email,senha,perfil,ativo)
  VALUES ($1,lower(btrim($2)),$3,'usuario',true)
  RETURNING u.id,u.nome,u.email,u.perfil,u.ativo,u.created_at
$$;

CREATE FUNCTION bovitrack_seg.consumir_limite(text,text,timestamptz,timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE total integer;
BEGIN
  IF $1 IS NULL OR $1 NOT IN ('LOGIN_CONTA','LOGIN_IP','LOGIN_ADMIN','CADASTRO_IP','CADASTRO_EMAIL',
      'REFRESH_SESSAO_IP','EMAIL_ENVIO_IP','EMAIL_ENVIO_HORA','EMAIL_ENVIO_DIA',
      'EMAIL_VALIDACAO_IP','EMAIL_VALIDACAO_CONTA')
     OR $2 IS NULL OR $2 !~ '^[0-9a-f]{64}$' OR $4 <= $3 THEN
    RAISE EXCEPTION 'Janela de rate limit invalida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.limites_requisicao AS l(escopo,chave_hash,janela_inicio,janela_fim,contador)
    VALUES ($1,$2,$3,$4,1)
    ON CONFLICT (escopo,chave_hash,janela_inicio)
    DO UPDATE SET contador = l.contador + 1 RETURNING contador INTO total;
  RETURN total;
END $$;

CREATE FUNCTION bovitrack_seg.limpar_limites() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ DELETE FROM public.limites_requisicao WHERE janela_fim < now() - interval '1 day' $$;

CREATE FUNCTION bovitrack_seg.abrir_sessao(integer,text,text,text,text,timestamptz,timestamptz,text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF bovitrack_seg.prova_operacao('login',$1 || ':' || $3 || ':' || $4 || ':' || $5,$8)
     IS DISTINCT FROM true THEN
    RAISE insufficient_privilege;
  END IF;
  PERFORM 1 FROM public.usuarios u
   WHERE u.id = $1 AND u.senha = $2 AND u.ativo AND u.email_verificado FOR UPDATE;
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

CREATE FUNCTION bovitrack_seg.rodar_refresh(text,text)
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
  IF NOT atual.email_verificado THEN
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

CREATE FUNCTION bovitrack_seg.encerrar_refresh(text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE alvo bigint;
BEGIN
  SELECT s.id INTO alvo FROM public.sessoes_refresh s WHERE s.token_hash = $1 FOR UPDATE;
  IF NOT FOUND THEN
    SELECT s.id INTO alvo FROM public.sessoes_refresh s
      JOIN public.sessoes_refresh_usados h ON h.sessao_id = s.id
      WHERE h.token_hash = $1 FOR UPDATE OF s;
  END IF;
  UPDATE public.sessoes_refresh SET revoked_at = now(), revoke_reason = 'LOGOUT'
    WHERE id = alvo AND revoked_at IS NULL;
END $$;

CREATE FUNCTION bovitrack_seg.encerrar_minhas_sessoes() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.sessoes_refresh SET revoked_at = now(), revoke_reason = 'LOGOUT_ALL'
  WHERE usuario_id = (SELECT bovitrack_seg.ator_id()) AND revoked_at IS NULL
$$;

CREATE FUNCTION bovitrack_seg.contar_sessoes(integer)
RETURNS TABLE (sessoes integer, usados integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT (SELECT count(*)::integer FROM public.sessoes_refresh s WHERE s.usuario_id = $1),
         (SELECT count(*)::integer FROM public.sessoes_refresh_usados h
            JOIN public.sessoes_refresh s ON s.id = h.sessao_id WHERE s.usuario_id = $1)
  WHERE $1 = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin())
$$;

CREATE FUNCTION bovitrack_seg.alterar_ativo(integer,boolean)
RETURNS TABLE (id integer, nome varchar, email varchar, perfil varchar, ativo boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT bovitrack_seg.admin_recente() THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY UPDATE public.usuarios u SET ativo = $2
    WHERE u.id = $1 AND u.perfil = 'usuario'
    RETURNING u.id,u.nome,u.email,u.perfil,u.ativo,u.created_at;
  IF FOUND AND NOT $2 THEN
    UPDATE public.sessoes_refresh SET revoked_at = now(), revoke_reason = 'USUARIO_DESATIVADO'
      WHERE usuario_id = $1 AND revoked_at IS NULL;
  END IF;
END $$;

CREATE FUNCTION bovitrack_seg.invalidar_ao_alterar_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_verificado := false;
    NEW.email_verificado_em := NULL;
    UPDATE public.verificacoes_email SET invalidado_em = now(), motivo = 'EMAIL_ALTERADO'
      WHERE usuario_id = OLD.id AND invalidado_em IS NULL;
    UPDATE public.sessoes_refresh SET revoked_at = now(), revoke_reason = 'EMAIL_ALTERADO'
      WHERE usuario_id = OLD.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
RESET ROLE;

DROP TRIGGER IF EXISTS usuarios_email_alterado ON public.usuarios;
CREATE TRIGGER usuarios_email_alterado BEFORE UPDATE OF email ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION bovitrack_seg.invalidar_ao_alterar_email();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bovitrack_seg FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bovitrack_seg.credencial_login(text), bovitrack_seg.cadastrar(text,text,text),
  bovitrack_seg.consumir_limite(text,text,timestamptz,timestamptz), bovitrack_seg.limpar_limites(),
  bovitrack_seg.abrir_sessao(integer,text,text,text,text,timestamptz,timestamptz,text),
  bovitrack_seg.rodar_refresh(text,text), bovitrack_seg.encerrar_refresh(text)
  TO bovitrack_auth_runtime;
GRANT EXECUTE ON FUNCTION bovitrack_seg.encerrar_minhas_sessoes(),
  bovitrack_seg.contar_sessoes(integer), bovitrack_seg.alterar_ativo(integer,boolean)
  TO bovitrack_runtime;
COMMIT;
