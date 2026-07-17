-- Módulo de RH — Prazo interno por etapa (não é campo de formulário)
--
-- data_inicio/data_fim da mensagem anterior eram sobre isso: todo candidato
-- tem uma "entrada na etapa atual" (stage_started_at) e um prazo derivado
-- dela + a config de dias daquela etapa (stage_sla_days) — usado só pra
-- indicar atraso no Kanban, nunca perguntado no formulário público. Remove
-- os 2 campos indevidos que entraram em form_fields na migration anterior.

DELETE FROM form_fields WHERE field_key IN ('data_inicio', 'data_fim');

-- ============================================================
-- Config: prazo (em dias) por etapa, editável pelo admin/gestor de RH
-- ============================================================

CREATE TABLE stage_sla_days (
  stage text PRIMARY KEY CHECK (stage IN (
    'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
    'decisao_necessaria', 'selecionado', 'em_formacao', 'em_contratacao',
    'contratado', 'concluido_arquivado',
    'descartado', 'banco_de_talentos', 'sem_contratacao'
  )),
  days int NOT NULL DEFAULT 3 CHECK (days > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO stage_sla_days (stage, days) VALUES
  ('pendente', 2),
  ('conversa_iniciada', 2),
  ('entrevista_marcada', 3),
  ('no_show', 1),
  ('decisao_necessaria', 2),
  ('selecionado', 3),
  ('em_formacao', 5),
  ('em_contratacao', 5),
  ('contratado', 7),
  ('concluido_arquivado', 30),
  ('descartado', 30),
  ('banco_de_talentos', 30),
  ('sem_contratacao', 30);

CREATE OR REPLACE FUNCTION trg_stage_sla_days_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER stage_sla_days_set_updated_at
  BEFORE UPDATE ON stage_sla_days
  FOR EACH ROW
  EXECUTE FUNCTION trg_stage_sla_days_set_updated_at();

ALTER TABLE stage_sla_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY stage_sla_days_rh_all ON stage_sla_days
  FOR ALL
  TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

GRANT SELECT, UPDATE ON stage_sla_days TO authenticated;

-- ============================================================
-- candidates.stage_started_at — quando o candidato entrou na etapa ATUAL.
-- O prazo ("data fim") não é uma coluna própria — é sempre calculado
-- (stage_started_at + stage_sla_days.days), pra nunca ficar defasado se o
-- admin mudar a config de dias de uma etapa depois.
-- ============================================================

ALTER TABLE candidates ADD COLUMN stage_started_at timestamptz NOT NULL DEFAULT now();

-- Backfill: candidatos já existentes recebem a data da própria mudança mais
-- recente pra etapa atual (candidate_stage_history já tinha isso desde a
-- Fase 1); fallback pra created_at se por algum motivo não houver histórico.
UPDATE candidates c
SET stage_started_at = COALESCE(
  (SELECT MAX(csh.changed_at) FROM candidate_stage_history csh WHERE csh.candidate_id = c.id AND csh.new_stage = c.stage),
  c.created_at
);

-- Reaproveita o trigger BEFORE UPDATE já existente (Fase 1) que mantém
-- updated_at — soma a atualização de stage_started_at toda vez que a etapa
-- muda de fato (CREATE OR REPLACE sobre a migration anterior, sem editá-la).
CREATE OR REPLACE FUNCTION trg_candidates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;
