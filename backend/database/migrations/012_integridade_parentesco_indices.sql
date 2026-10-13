-- Incremental: protege novas escritas sem reescrever historicos existentes.
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_parentesco_animais()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE mae_propriedade INTEGER; mae_sexo CHAR(1);
BEGIN
  IF NEW.mae_id IS NOT NULL THEN
    IF NEW.mae_id = NEW.id THEN
      RAISE EXCEPTION 'Um animal nao pode ser sua propria mae'
        USING ERRCODE = '23514', CONSTRAINT = 'animais_parentesco_consistente';
    END IF;
    -- O bloqueio impede que outra transacao altere o sexo/propriedade da mae
    -- enquanto esta referencia e criada ou alterada.
    SELECT propriedade_id, sexo INTO mae_propriedade, mae_sexo
      FROM public.animais WHERE id = NEW.mae_id FOR SHARE;
    IF mae_propriedade IS DISTINCT FROM NEW.propriedade_id
       OR mae_sexo IS DISTINCT FROM 'F' THEN
      RAISE EXCEPTION 'A mae deve ser uma femea da mesma propriedade'
        USING ERRCODE = '23514', CONSTRAINT = 'animais_parentesco_consistente';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.animais filho
     WHERE filho.mae_id = NEW.id
       AND (NEW.sexo IS DISTINCT FROM 'F'
            OR filho.propriedade_id IS DISTINCT FROM NEW.propriedade_id)
  ) OR EXISTS (
    SELECT 1 FROM public.desmamas de
      JOIN public.animais filho ON filho.id = de.animal_id
     WHERE de.mae_id = NEW.id
       AND (NEW.sexo IS DISTINCT FROM 'F'
            OR filho.propriedade_id IS DISTINCT FROM NEW.propriedade_id)
  ) THEN
    RAISE EXCEPTION 'A mae vinculada deve permanecer femea na propriedade dos filhos'
      USING ERRCODE = '23514', CONSTRAINT = 'animais_parentesco_consistente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pesagens pe JOIN public.lotes l ON l.id = pe.lote_id
     WHERE pe.animal_id = NEW.id AND l.propriedade_id <> NEW.propriedade_id
  ) OR EXISTS (
    SELECT 1 FROM public.desmamas de
      LEFT JOIN public.animais m ON m.id = de.mae_id
      LEFT JOIN public.lotes l ON l.id = de.lote_destino_id
     WHERE de.animal_id = NEW.id
       AND (m.propriedade_id <> NEW.propriedade_id
            OR l.propriedade_id <> NEW.propriedade_id)
  ) THEN
    RAISE EXCEPTION 'O animal possui historico de manejo incompativel com a nova propriedade'
      USING ERRCODE = '23514', CONSTRAINT = 'animais_parentesco_consistente';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS animais_parentesco_consistente_trg ON public.animais;
CREATE TRIGGER animais_parentesco_consistente_trg
BEFORE INSERT OR UPDATE OF mae_id, propriedade_id, sexo ON public.animais
FOR EACH ROW EXECUTE FUNCTION public.validar_parentesco_animais();

-- A criacao/edicao da desmama deve bloquear a mae pelo mesmo motivo.
CREATE OR REPLACE FUNCTION public.validar_referencias_desmama()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE propriedade_animal INTEGER; propriedade_lote INTEGER;
        animal_pesagem INTEGER; mae_propriedade INTEGER; mae_sexo CHAR(1);
BEGIN
  SELECT propriedade_id INTO propriedade_animal
    FROM public.animais WHERE id = NEW.animal_id;
  -- Durante DELETE de mae e filho no mesmo comando, ON DELETE SET NULL pode
  -- atualizar esta desmama antes de ON DELETE CASCADE remove-la. O animal ja
  -- nao existe nesse instante. A FK animal_id continua rejeitando INSERT ou
  -- UPDATE normais que apontem para um animal inexistente.
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.mae_id IS NOT NULL THEN
    SELECT propriedade_id, sexo INTO mae_propriedade, mae_sexo
      FROM public.animais WHERE id = NEW.mae_id FOR SHARE;
    IF NEW.mae_id = NEW.animal_id
       OR mae_propriedade IS DISTINCT FROM propriedade_animal
       OR mae_sexo IS DISTINCT FROM 'F' THEN
      RAISE EXCEPTION 'A mae da desmama deve ser uma femea da mesma propriedade'
        USING ERRCODE = '23514', CONSTRAINT = 'desmamas_referencias_consistentes';
    END IF;
  END IF;
  IF NEW.lote_destino_id IS NOT NULL THEN
    SELECT propriedade_id INTO propriedade_lote
      FROM public.lotes WHERE id = NEW.lote_destino_id;
    IF propriedade_lote IS DISTINCT FROM propriedade_animal THEN
      RAISE EXCEPTION 'O lote de destino deve pertencer a propriedade do animal'
        USING ERRCODE = '23514', CONSTRAINT = 'desmamas_referencias_consistentes';
    END IF;
  END IF;
  IF NEW.peso_desmama_id IS NOT NULL THEN
    SELECT animal_id INTO animal_pesagem
      FROM public.pesagens WHERE id = NEW.peso_desmama_id;
    IF animal_pesagem IS DISTINCT FROM NEW.animal_id THEN
      RAISE EXCEPTION 'A pesagem de desmama deve pertencer ao mesmo animal'
        USING ERRCODE = '23514', CONSTRAINT = 'desmamas_referencias_consistentes';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Indices para filtros por dono/propriedade, historicos e exclusao de FKs.
CREATE INDEX IF NOT EXISTS animais_propriedade_id_idx ON public.animais (propriedade_id);
CREATE INDEX IF NOT EXISTS lotes_propriedade_id_idx ON public.lotes (propriedade_id);
CREATE INDEX IF NOT EXISTS despesas_propriedade_data_idx ON public.despesas (propriedade_id, data DESC, id DESC);
CREATE INDEX IF NOT EXISTS vacinacoes_animal_data_idx ON public.vacinacoes (animal_id, data_aplicacao DESC, id DESC);
CREATE INDEX IF NOT EXISTS vacinacoes_vacina_id_idx ON public.vacinacoes (vacina_id);
CREATE INDEX IF NOT EXISTS animais_lotes_lote_id_idx ON public.animais_lotes (lote_id);
CREATE INDEX IF NOT EXISTS desmamas_mae_id_idx ON public.desmamas (mae_id);

COMMIT;
