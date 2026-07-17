-- Módulo de RH — Recrutamento e Seleção (Fase 1)
-- job_openings (vagas), candidates (candidatos), candidate_stage_history (histórico de etapa)
-- unidade = stores.id (reaproveita tabela existente, sem tabela "unidades" nova)
-- Acesso restrito via has_rh_access() (admin OU profiles.permissions->>'can_manage_rh' = 'true')

-- ============================================================
-- Tabelas
-- ============================================================

CREATE TABLE job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  role_title text NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_openings_store_id ON job_openings(store_id);

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  name text NOT NULL,
  age int NOT NULL CHECK (age > 0),
  whatsapp text NOT NULL,
  stage text NOT NULL DEFAULT 'pendente' CHECK (stage IN (
    'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
    'decisao_necessaria', 'selecionado', 'em_formacao', 'em_contratacao',
    'contratado', 'concluido_arquivado',
    'descartado', 'banco_de_talentos', 'sem_contratacao'
  )),
  source text NOT NULL CHECK (source IN ('formulario', 'manual')),
  photo_url text,
  resume_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_job_opening_id ON candidates(job_opening_id);
CREATE INDEX idx_candidates_stage ON candidates(stage);

CREATE TABLE candidate_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  previous_stage text,
  new_stage text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_stage_history_candidate_id ON candidate_stage_history(candidate_id);

-- ============================================================
-- Triggers: updated_at + histórico automático de etapa
-- ============================================================

CREATE OR REPLACE FUNCTION trg_candidates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_set_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION trg_candidates_set_updated_at();

CREATE OR REPLACE FUNCTION log_candidate_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO candidate_stage_history (candidate_id, previous_stage, new_stage, changed_by)
    VALUES (NEW.id, NULL, NEW.stage, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO candidate_stage_history (candidate_id, previous_stage, new_stage, changed_by)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_log_stage_insert
  AFTER INSERT ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION log_candidate_stage_change();

CREATE TRIGGER candidates_log_stage_update
  AFTER UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION log_candidate_stage_change();

-- ============================================================
-- RLS
-- ============================================================

CREATE OR REPLACE FUNCTION has_rh_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR permissions->>'can_manage_rh' = 'true')
  );
$$;

ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_openings_rh_access ON job_openings
  FOR ALL
  TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

CREATE POLICY candidates_rh_access ON candidates
  FOR ALL
  TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

CREATE POLICY candidate_stage_history_rh_read ON candidate_stage_history
  FOR SELECT
  TO authenticated
  USING (has_rh_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON job_openings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON candidates TO authenticated;
GRANT SELECT ON candidate_stage_history TO authenticated;
GRANT EXECUTE ON FUNCTION has_rh_access() TO authenticated;
