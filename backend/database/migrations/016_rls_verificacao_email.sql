BEGIN;
SET LOCAL ROLE bovitrack_rls_interno;

CREATE FUNCTION bovitrack_seg.email_usuario(text)
RETURNS TABLE(id integer, email varchar, ativo boolean, email_verificado boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id,u.email,u.ativo,u.email_verificado FROM public.usuarios u
  WHERE lower(btrim(u.email)) = $1 FOR UPDATE
$$;

CREATE FUNCTION bovitrack_seg.email_ultimo(integer)
RETURNS TABLE(id uuid,codigo_hash char(64),criado_em timestamptz,expira_em timestamptz,
  tentativas smallint,usado_em timestamptz,invalidado_em timestamptz,enviado_em timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.id,v.codigo_hash,v.criado_em,v.expira_em,v.tentativas,v.usado_em,v.invalidado_em,v.enviado_em
  FROM public.verificacoes_email v WHERE v.usuario_id = $1
  ORDER BY v.criado_em DESC LIMIT 1 FOR UPDATE
$$;

CREATE FUNCTION bovitrack_seg.email_reservar(uuid,integer,text,timestamptz,timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.usuarios u WHERE u.id = $2 AND u.ativo AND NOT u.email_verificado FOR UPDATE;
  IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
  UPDATE public.verificacoes_email SET invalidado_em = now(), motivo = 'REENVIO'
    WHERE usuario_id = $2 AND invalidado_em IS NULL;
  INSERT INTO public.verificacoes_email(id,usuario_id,codigo_hash,criado_em,expira_em)
    VALUES ($1,$2,$3,$4,$5);
END $$;

CREATE FUNCTION bovitrack_seg.email_entrega(uuid,boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.verificacoes_email
    SET enviado_em = CASE WHEN $2 THEN now() END,
        invalidado_em = CASE WHEN NOT $2 THEN now() END,
        motivo = CASE WHEN NOT $2 THEN 'FALHA_ENVIO' END
   WHERE id = $1 AND invalidado_em IS NULL AND enviado_em IS NULL
$$;

CREATE FUNCTION bovitrack_seg.email_resolver(integer,uuid,text,integer,text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE verificado boolean; desafio record; novas_tentativas integer;
BEGIN
  IF bovitrack_seg.prova_operacao('email',$1 || ':' || $2 || ':' || $3 || ':' || $4,$5)
     IS DISTINCT FROM true THEN
    RAISE insufficient_privilege;
  END IF;
  IF $4 IS NULL OR $4 NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Limite de tentativas invalido' USING ERRCODE = '22023';
  END IF;
  SELECT u.email_verificado INTO verificado FROM public.usuarios u WHERE u.id = $1 AND u.ativo FOR UPDATE;
  IF NOT FOUND THEN RETURN 'CODE_INVALID_OR_EXPIRED'; END IF;
  SELECT v.id,v.codigo_hash,v.expira_em,v.tentativas,v.usado_em,v.invalidado_em,v.enviado_em
    INTO desafio FROM public.verificacoes_email v WHERE v.usuario_id = $1
    ORDER BY v.criado_em DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR desafio.id IS DISTINCT FROM $2 THEN RETURN 'CODE_INVALID_OR_EXPIRED'; END IF;
  IF desafio.usado_em IS NOT NULL THEN RETURN 'CODE_USED'; END IF;
  IF verificado THEN RETURN 'EMAIL_ALREADY_VERIFIED'; END IF;
  IF desafio.tentativas >= $4 THEN RETURN 'CODE_ATTEMPTS_EXCEEDED'; END IF;
  IF desafio.expira_em <= clock_timestamp() THEN
    UPDATE public.verificacoes_email SET invalidado_em = coalesce(invalidado_em,now()), motivo = 'EXPIRADO'
      WHERE id = $2;
    RETURN 'CODE_EXPIRED';
  END IF;
  IF desafio.invalidado_em IS NOT NULL THEN RETURN 'CODE_INVALID_OR_EXPIRED'; END IF;
  IF desafio.enviado_em IS NULL THEN RETURN 'EMAIL_TEMPORARILY_UNAVAILABLE'; END IF;
  IF desafio.codigo_hash IS DISTINCT FROM $3 THEN
    novas_tentativas := desafio.tentativas + 1;
    UPDATE public.verificacoes_email SET tentativas = novas_tentativas,
      invalidado_em = CASE WHEN novas_tentativas >= $4 THEN now() END,
      motivo = CASE WHEN novas_tentativas >= $4 THEN 'TENTATIVAS' END WHERE id = $2;
    RETURN CASE WHEN novas_tentativas >= $4 THEN 'CODE_ATTEMPTS_EXCEEDED' ELSE 'CODE_INVALID' END;
  END IF;
  UPDATE public.verificacoes_email SET usado_em = now(), invalidado_em = now(), motivo = 'VERIFICADO' WHERE id = $2;
  UPDATE public.usuarios SET email_verificado = true, email_verificado_em = now() WHERE id = $1;
  UPDATE public.sessoes_refresh SET revoked_at = now(), revoke_reason = 'EMAIL_VERIFIED_RELOGIN'
    WHERE usuario_id = $1 AND revoked_at IS NULL;
  RETURN 'EMAIL_VERIFIED';
END $$;
RESET ROLE;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bovitrack_seg FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bovitrack_seg.email_usuario(text), bovitrack_seg.email_ultimo(integer),
  bovitrack_seg.email_reservar(uuid,integer,text,timestamptz,timestamptz),
  bovitrack_seg.email_entrega(uuid,boolean), bovitrack_seg.email_resolver(integer,uuid,text,integer,text)
  TO bovitrack_auth_runtime;
REVOKE CREATE ON SCHEMA bovitrack_seg FROM bovitrack_rls_identidade, bovitrack_rls_interno;
COMMIT;
