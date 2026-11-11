BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE POLICY rls_usuarios_select ON public.usuarios FOR SELECT TO bovitrack_runtime
  USING (id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin()));
CREATE POLICY rls_usuarios_update ON public.usuarios FOR UPDATE TO bovitrack_runtime
  USING (id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin()))
  WITH CHECK (id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin()));
CREATE POLICY rls_usuarios_delete ON public.usuarios FOR DELETE TO bovitrack_runtime
  USING (perfil = 'usuario' AND (SELECT bovitrack_seg.em_exclusao()) AND
    (id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.admin_recente())));

-- As tabelas-raiz filtram pelo dono. Os demais EXISTS usam a visibilidade
-- RLS do pai; a migration de ativação liga todo o grafo atomicamente.
DO $$
DECLARE
  item record;
  leitura text;
  escrita text;
  criacao text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('propriedades',
      'usuario_id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin())',
      'usuario_id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin())',
      'usuario_id = (SELECT bovitrack_seg.ator_id())', true),
    ('vacinas',
      'usuario_id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin())',
      'usuario_id = (SELECT bovitrack_seg.ator_id()) OR (SELECT bovitrack_seg.eh_admin())',
      'usuario_id = (SELECT bovitrack_seg.ator_id())', true),
    ('animais','EXISTS (SELECT FROM public.propriedades p WHERE p.id = animais.propriedade_id)',NULL,NULL,true),
    ('lotes','EXISTS (SELECT FROM public.propriedades p WHERE p.id = lotes.propriedade_id)',NULL,NULL,true),
    ('despesas','EXISTS (SELECT FROM public.propriedades p WHERE p.id = despesas.propriedade_id)',NULL,NULL,true),
    ('receitas','EXISTS (SELECT FROM public.propriedades p WHERE p.id = receitas.propriedade_id)',NULL,NULL,true),
    ('producoes_leiteiras','EXISTS (SELECT FROM public.animais a WHERE a.id = producoes_leiteiras.animal_id)',NULL,NULL,true),
    ('animais_lotes',
      'EXISTS (SELECT FROM public.animais a CROSS JOIN public.lotes l WHERE a.id = animais_lotes.animal_id AND l.id = animais_lotes.lote_id)',
      'EXISTS (SELECT FROM public.animais a JOIN public.lotes l USING (propriedade_id) WHERE a.id = animais_lotes.animal_id AND l.id = animais_lotes.lote_id)',
      NULL,false),
    ('vacinacoes',
      'EXISTS (SELECT FROM public.animais a CROSS JOIN public.vacinas v WHERE a.id = vacinacoes.animal_id AND v.id = vacinacoes.vacina_id)',
      'EXISTS (SELECT FROM public.animais a JOIN public.propriedades p ON p.id = a.propriedade_id JOIN public.vacinas v USING (usuario_id) WHERE a.id = vacinacoes.animal_id AND v.id = vacinacoes.vacina_id)',
      NULL,true),
    ('pesagens',
      'EXISTS (SELECT FROM public.animais a WHERE a.id = pesagens.animal_id)',
      'EXISTS (SELECT FROM public.animais a WHERE a.id = pesagens.animal_id AND (pesagens.lote_id IS NULL OR EXISTS (SELECT FROM public.lotes l WHERE l.id = pesagens.lote_id AND l.propriedade_id = a.propriedade_id)))',
      NULL,true),
    ('desmamas',
      'EXISTS (SELECT FROM public.animais a WHERE a.id = desmamas.animal_id)',
      'EXISTS (SELECT FROM public.animais a WHERE a.id = desmamas.animal_id
         AND (desmamas.mae_id IS NULL OR EXISTS (SELECT FROM public.animais m WHERE m.id = desmamas.mae_id AND m.id <> a.id AND m.sexo = ''F'' AND m.propriedade_id = a.propriedade_id))
         AND (desmamas.lote_destino_id IS NULL OR EXISTS (SELECT FROM public.lotes l WHERE l.id = desmamas.lote_destino_id AND l.propriedade_id = a.propriedade_id))
         AND (desmamas.peso_desmama_id IS NULL OR EXISTS (SELECT FROM public.pesagens s WHERE s.id = desmamas.peso_desmama_id AND s.animal_id = a.id)))',
      NULL,true)
  ) AS regras(tabela, ler, escrever, inserir, atualizar)
  LOOP
    leitura := item.ler;
    escrita := coalesce(item.escrever, leitura);
    criacao := coalesce(item.inserir, escrita);
    IF item.tabela IN ('pesagens','desmamas') THEN
      criacao := format('(%s) AND registrado_por = (SELECT bovitrack_seg.ator_id())', criacao);
    END IF;
    EXECUTE format('CREATE POLICY rls_select ON public.%I FOR SELECT TO bovitrack_runtime USING (%s)', item.tabela, leitura);
    EXECUTE format('CREATE POLICY rls_insert ON public.%I FOR INSERT TO bovitrack_runtime WITH CHECK (%s)', item.tabela, criacao);
    IF item.atualizar THEN
      EXECUTE format('CREATE POLICY rls_update ON public.%I FOR UPDATE TO bovitrack_runtime USING (%s) WITH CHECK (%s)', item.tabela, leitura, escrita);
    END IF;
    IF item.tabela IN ('desmamas','propriedades') THEN
      leitura := format('(%s) AND (SELECT bovitrack_seg.em_exclusao())', leitura);
    END IF;
    EXECUTE format('CREATE POLICY rls_delete ON public.%I FOR DELETE TO bovitrack_runtime USING (%s)', item.tabela, leitura);
  END LOOP;
END $$;
COMMIT;
