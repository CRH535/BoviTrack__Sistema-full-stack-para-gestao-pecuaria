-- Compatibilidade com a DEV anterior, incluindo a migration 013 original.
-- Executar somente na janela de rollback junto com o binário correspondente.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.desmamas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesagens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.producoes_leiteiras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacinacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacinas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.animais_lotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.animais DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.propriedades DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.limites_requisicao DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_refresh_usados DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_refresh DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios, public.sessoes_refresh,
  public.sessoes_refresh_usados, public.limites_requisicao, public.verificacoes_email,
  public.propriedades, public.vacinas, public.animais_lotes, public.pesagens, public.desmamas
  TO bovitrack_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.usuarios_id_seq, public.sessoes_refresh_id_seq TO bovitrack_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bovitrack_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bovitrack_runtime;

DROP POLICY IF EXISTS verificacoes_runtime ON public.verificacoes_email;
CREATE POLICY verificacoes_runtime ON public.verificacoes_email TO bovitrack_runtime
  USING (true) WITH CHECK (true);
-- A trigger da 015 preserva a mesma invalidação e é compatível com o binário anterior.
-- A rotação da chave e a retirada dos logins novos são passos operacionais separados.
COMMIT;
