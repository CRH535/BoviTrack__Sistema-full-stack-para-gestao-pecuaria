-- Reconcilia definicoes observadas em producao com a integridade da DEV.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.validar_parentesco_animais()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
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
    SELECT 1 FROM public.animais_lotes al JOIN public.lotes l ON l.id = al.lote_id
      WHERE al.animal_id = NEW.id AND l.propriedade_id <> NEW.propriedade_id
  ) OR EXISTS (
    SELECT 1 FROM public.vacinacoes vc JOIN public.vacinas v ON v.id = vc.vacina_id
      JOIN public.propriedades p ON p.id = NEW.propriedade_id
      WHERE vc.animal_id = NEW.id AND v.usuario_id <> p.usuario_id
  ) OR EXISTS (
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
    FROM public.animais WHERE id = NEW.animal_id FOR SHARE;
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
      FROM public.lotes WHERE id = NEW.lote_destino_id FOR SHARE;
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

CREATE OR REPLACE FUNCTION public.validar_referencias_pesagem()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE propriedade_animal integer; propriedade_lote integer;
BEGIN
  IF NEW.lote_id IS NULL THEN RETURN NEW; END IF;
  SELECT propriedade_id INTO propriedade_animal FROM public.animais WHERE id = NEW.animal_id FOR SHARE;
  SELECT propriedade_id INTO propriedade_lote FROM public.lotes WHERE id = NEW.lote_id FOR SHARE;
  IF propriedade_animal IS NULL OR propriedade_lote IS DISTINCT FROM propriedade_animal THEN
    RAISE EXCEPTION 'O lote da pesagem deve pertencer a propriedade do animal'
      USING ERRCODE = '23514', CONSTRAINT = 'pesagens_referencias_consistentes';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validar_movimentacao_lote()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT FROM public.animais_lotes al JOIN public.animais a ON a.id = al.animal_id
      WHERE al.lote_id = NEW.id AND a.propriedade_id <> NEW.propriedade_id
  ) OR EXISTS (
    SELECT FROM public.pesagens s JOIN public.animais a ON a.id = s.animal_id
      WHERE s.lote_id = NEW.id AND a.propriedade_id <> NEW.propriedade_id
  ) OR EXISTS (
    SELECT FROM public.desmamas d JOIN public.animais a ON a.id = d.animal_id
      WHERE d.lote_destino_id = NEW.id AND a.propriedade_id <> NEW.propriedade_id
  ) THEN
    RAISE EXCEPTION 'O lote possui historico incompativel com a nova propriedade'
      USING ERRCODE = '23514', CONSTRAINT = 'lotes_movimentacao_consistente';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.validar_vinculo_animal_lote() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE propriedade_animal integer; propriedade_lote integer;
BEGIN
  SELECT propriedade_id INTO propriedade_animal FROM public.animais WHERE id = NEW.animal_id FOR SHARE;
  SELECT propriedade_id INTO propriedade_lote FROM public.lotes WHERE id = NEW.lote_id FOR SHARE;
  IF propriedade_animal IS NULL OR propriedade_lote IS DISTINCT FROM propriedade_animal THEN
    RAISE EXCEPTION 'Vinculo animal e lote incompativel'
      USING ERRCODE = '23514', CONSTRAINT = 'animais_lotes_propriedade_consistente';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.validar_vinculo_vacinacao() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE dono_animal integer; dono_vacina integer;
BEGIN
  SELECT p.usuario_id INTO dono_animal FROM public.animais a
    JOIN public.propriedades p ON p.id = a.propriedade_id WHERE a.id = NEW.animal_id FOR SHARE OF a;
  SELECT usuario_id INTO dono_vacina FROM public.vacinas WHERE id = NEW.vacina_id;
  IF dono_animal IS NULL OR dono_vacina IS DISTINCT FROM dono_animal THEN
    RAISE EXCEPTION 'Vinculo animal e vacina incompativel'
      USING ERRCODE = '23514', CONSTRAINT = 'vacinacoes_proprietario_consistente';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.validar_vinculo_animal_lote(), public.validar_vinculo_vacinacao() FROM PUBLIC;
CREATE TRIGGER animais_lotes_propriedade_consistente_trg
  BEFORE INSERT OR UPDATE OF animal_id,lote_id ON public.animais_lotes
  FOR EACH ROW EXECUTE FUNCTION public.validar_vinculo_animal_lote();
CREATE TRIGGER vacinacoes_proprietario_consistente_trg
  BEFORE INSERT OR UPDATE OF animal_id,vacina_id ON public.vacinacoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_vinculo_vacinacao();

-- Trava a migração se a base contiver vínculos que as policies ocultariam.
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.animais a JOIN public.animais m ON m.id = a.mae_id
             WHERE a.id = m.id OR a.propriedade_id <> m.propriedade_id OR m.sexo IS DISTINCT FROM 'F')
  OR EXISTS (SELECT FROM public.animais_lotes al JOIN public.animais a ON a.id = al.animal_id
             JOIN public.lotes l ON l.id = al.lote_id WHERE a.propriedade_id <> l.propriedade_id)
  OR EXISTS (SELECT FROM public.pesagens s JOIN public.animais a ON a.id = s.animal_id
             JOIN public.lotes l ON l.id = s.lote_id WHERE a.propriedade_id <> l.propriedade_id)
  OR EXISTS (SELECT FROM public.desmamas d JOIN public.animais a ON a.id = d.animal_id
             LEFT JOIN public.animais m ON m.id = d.mae_id LEFT JOIN public.lotes l ON l.id = d.lote_destino_id
             LEFT JOIN public.pesagens s ON s.id = d.peso_desmama_id
             WHERE (m.id IS NOT NULL AND (m.id = a.id OR a.propriedade_id <> m.propriedade_id OR m.sexo IS DISTINCT FROM 'F'))
                OR a.propriedade_id <> l.propriedade_id OR a.id <> s.animal_id)
  OR EXISTS (SELECT FROM public.vacinacoes v JOIN public.vacinas c ON c.id = v.vacina_id
             JOIN public.animais a ON a.id = v.animal_id JOIN public.propriedades p ON p.id = a.propriedade_id
             WHERE p.usuario_id <> c.usuario_id) THEN
    RAISE EXCEPTION 'Vinculos incompativeis existentes: corrigir antes de prosseguir';
  END IF;
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
