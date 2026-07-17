-- Módulo de RH — Catálogo de Cargos (templates de vaga)
-- job_roles: cadastro reutilizável de cargos (contrato, remuneração, descrição, horário...)
-- Ao criar uma vaga em job_openings, o cargo selecionado copia seus dados como snapshot
-- editável (job_role_id fica só como rastro de origem; editar o cargo depois NÃO altera
-- vagas já criadas).

-- ============================================================
-- Tabela job_roles
-- ============================================================

CREATE TABLE job_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  description text,
  contract_type text NOT NULL CHECK (contract_type IN ('clt', 'mei', 'pj', 'estagio')),
  compensation_type text NOT NULL CHECK (compensation_type IN ('fixa', 'variavel', 'mista')),
  fixed_amount numeric(10,2),
  variable_percentage numeric(5,2),
  variable_basis text,
  work_schedule text,
  workload_hours numeric(4,1),
  requirements text,
  benefits text,
  seniority_level text CHECK (seniority_level IN ('junior', 'pleno', 'senior')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_roles_compensation_consistency CHECK (
    (compensation_type = 'fixa' AND fixed_amount IS NOT NULL AND variable_percentage IS NULL) OR
    (compensation_type = 'variavel' AND variable_percentage IS NOT NULL AND fixed_amount IS NULL) OR
    (compensation_type = 'mista' AND fixed_amount IS NOT NULL AND variable_percentage IS NOT NULL)
  )
);

CREATE INDEX idx_job_roles_is_active ON job_roles(is_active);

CREATE OR REPLACE FUNCTION trg_job_roles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_roles_set_updated_at
  BEFORE UPDATE ON job_roles
  FOR EACH ROW
  EXECUTE FUNCTION trg_job_roles_set_updated_at();

-- ============================================================
-- job_openings: colunas de snapshot preenchidas a partir do cargo selecionado
-- ============================================================

ALTER TABLE job_openings
  ADD COLUMN job_role_id uuid REFERENCES job_roles(id) ON DELETE RESTRICT,
  ADD COLUMN description text,
  ADD COLUMN contract_type text CHECK (contract_type IN ('clt', 'mei', 'pj', 'estagio')),
  ADD COLUMN compensation_type text CHECK (compensation_type IN ('fixa', 'variavel', 'mista')),
  ADD COLUMN fixed_amount numeric(10,2),
  ADD COLUMN variable_percentage numeric(5,2),
  ADD COLUMN variable_basis text,
  ADD COLUMN work_schedule text,
  ADD COLUMN workload_hours numeric(4,1),
  ADD COLUMN requirements text,
  ADD COLUMN benefits text,
  ADD CONSTRAINT job_openings_compensation_consistency CHECK (
    compensation_type IS NULL OR (
      (compensation_type = 'fixa' AND fixed_amount IS NOT NULL AND variable_percentage IS NULL) OR
      (compensation_type = 'variavel' AND variable_percentage IS NOT NULL AND fixed_amount IS NULL) OR
      (compensation_type = 'mista' AND fixed_amount IS NOT NULL AND variable_percentage IS NOT NULL)
    )
  );

CREATE INDEX idx_job_openings_job_role_id ON job_openings(job_role_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE job_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_roles_rh_access ON job_roles
  FOR ALL
  TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON job_roles TO authenticated;
