-- Requer migrations 009/010 e credencial administrativa. Nenhum usuário é
-- automaticamente verificado. Planeje a ativação com os deploys de autenticação.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Não corrigir/remover dados silenciosamente: interromper se a auditoria falhar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE email IS NULL OR
      email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR email <> lower(btrim(email))) OR
     EXISTS (SELECT 1 FROM public.usuarios GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Auditoria de e-mails pendente: corrija inconsistências sem remover contas';
  END IF;
END $$;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verificado_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.usuarios'::regclass AND conname = 'usuarios_email_verificado_check') THEN
    ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_email_verificado_check
      CHECK (email_verificado = (email_verificado_em IS NOT NULL));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado_uidx
  ON public.usuarios (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS public.verificacoes_email (
  id UUID PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  codigo_hash CHAR(64) NOT NULL CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  expira_em TIMESTAMPTZ NOT NULL,
  tentativas SMALLINT NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
  usado_em TIMESTAMPTZ,
  invalidado_em TIMESTAMPTZ,
  motivo VARCHAR(30),
  enviado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT verificacoes_email_validade_check CHECK (expira_em > criado_em),
  CONSTRAINT verificacoes_email_consumo_check CHECK (usado_em IS NULL OR invalidado_em IS NOT NULL)
);
-- Expiração é testada em runtime; NOW() não é imutável em predicates de índices.
CREATE UNIQUE INDEX IF NOT EXISTS verificacoes_email_ativo_uidx
  ON public.verificacoes_email(usuario_id) WHERE invalidado_em IS NULL;
CREATE INDEX IF NOT EXISTS verificacoes_email_usuario_criado_idx
  ON public.verificacoes_email(usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS verificacoes_email_expira_idx ON public.verificacoes_email(expira_em);

CREATE OR REPLACE FUNCTION public.invalidar_verificacao_ao_alterar_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_verificado := FALSE;
    NEW.email_verificado_em := NULL;
    UPDATE public.verificacoes_email SET invalidado_em = CURRENT_TIMESTAMP, motivo = 'EMAIL_ALTERADO'
      WHERE usuario_id = OLD.id AND invalidado_em IS NULL;
    UPDATE public.sessoes_refresh SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'EMAIL_ALTERADO'
      WHERE usuario_id = OLD.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF to_regprocedure('bovitrack_seg.invalidar_ao_alterar_email()') IS NULL THEN
    DROP TRIGGER IF EXISTS usuarios_email_alterado ON public.usuarios;
    CREATE TRIGGER usuarios_email_alterado BEFORE UPDATE OF email ON public.usuarios
      FOR EACH ROW EXECUTE FUNCTION public.invalidar_verificacao_ao_alterar_email();
  END IF;
END $$;

UPDATE public.sessoes_refresh sr SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'EMAIL_NOT_VERIFIED'
  FROM public.usuarios u WHERE sr.usuario_id = u.id AND NOT u.email_verificado AND sr.revoked_at IS NULL;

-- Supabase Data API não participa da autenticação própria.
ALTER TABLE public.verificacoes_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verificacoes_email FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invalidar_verificacao_ao_alterar_email() FROM PUBLIC;
DO $$
DECLARE papel TEXT;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON public.verificacoes_email FROM %I', papel);
      EXECUTE format('REVOKE ALL ON FUNCTION public.invalidar_verificacao_ao_alterar_email() FROM %I', papel);
    END IF;
  END LOOP;
END $$;
COMMIT;
