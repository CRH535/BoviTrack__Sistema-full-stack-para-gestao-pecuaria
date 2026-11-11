BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bovitrack_seg.chaves_contexto) THEN
    RAISE EXCEPTION 'Provisione a chave de contexto antes da ativacao';
  END IF;
  IF EXISTS (
    SELECT FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename IN
      ('usuarios','sessoes_refresh','sessoes_refresh_usados','limites_requisicao','verificacoes_email',
       'propriedades','animais','lotes','animais_lotes','vacinas','vacinacoes','despesas','receitas',
       'producoes_leiteiras','pesagens','desmamas')
      AND p.policyname NOT IN ('rls_identidade','rls_interno','rls_interno_select','rls_interno_insert',
        'rls_interno_update','rls_usuarios_select','rls_usuarios_update','rls_usuarios_delete',
        'rls_select','rls_insert','rls_update','rls_delete','verificacoes_runtime')
  ) THEN
    RAISE EXCEPTION 'Policy anterior fora da linha de base; revise antes do corte';
  END IF;
END $$;

DROP POLICY IF EXISTS verificacoes_runtime ON public.verificacoes_email;
REVOKE ALL ON public.usuarios, public.sessoes_refresh, public.sessoes_refresh_usados,
  public.limites_requisicao, public.verificacoes_email FROM bovitrack_runtime;
REVOKE ALL ON SEQUENCE public.usuarios_id_seq, public.sessoes_refresh_id_seq FROM bovitrack_runtime;
GRANT SELECT (id,nome,email,perfil,ativo,created_at,email_verificado),
  UPDATE (nome,email), DELETE ON public.usuarios TO bovitrack_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.propriedades, public.animais, public.lotes,
  public.animais_lotes, public.vacinas, public.vacinacoes, public.despesas, public.receitas,
  public.producoes_leiteiras, public.pesagens, public.desmamas TO bovitrack_runtime;
REVOKE UPDATE ON public.propriedades, public.vacinas, public.animais_lotes,
  public.pesagens, public.desmamas FROM bovitrack_runtime;
GRANT UPDATE (nome,cidade,estado,area) ON public.propriedades TO bovitrack_runtime;
GRANT UPDATE (nome,fabricante,descricao) ON public.vacinas TO bovitrack_runtime;
GRANT UPDATE (data_pesagem,peso_kg,tipo_pesagem,metodo,lote_id,observacao,updated_at)
  ON public.pesagens TO bovitrack_runtime;
GRANT UPDATE (mae_id,data_planejada,data_inicio,data_fim,data_desmama,tipo_desmama,peso_desmama_id,
  lote_destino_id,status,suplementacao,observacao,updated_at) ON public.desmamas TO bovitrack_runtime;

GRANT USAGE ON SEQUENCE public.propriedades_id_seq, public.animais_id_seq, public.lotes_id_seq,
  public.vacinas_id_seq, public.vacinacoes_id_seq, public.despesas_id_seq, public.receitas_id_seq,
  public.producoes_leiteiras_id_seq, public.pesagens_id_seq, public.desmamas_id_seq TO bovitrack_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM bovitrack_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM bovitrack_runtime;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_refresh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_refresh_usados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limites_requisicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verificacoes_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propriedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animais_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacinacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producoes_leiteiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desmamas ENABLE ROW LEVEL SECURITY;
COMMIT;
