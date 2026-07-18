-- Duas mudanças nesta migration:
--
-- 1) Rename pra inglês: as tabelas/colunas do DP nasceram em português
--    (colaboradores_*), quebrando a convenção do projeto (tabelas/colunas
--    técnicas em inglês — ver candidates/job_openings). Não editamos as
--    migrations 20260718000011/12 (já aplicadas no remoto) — o rename vira
--    ALTER TABLE/COLUMN aqui. Valores de negócio (current_stage, employment_type,
--    document_type etc.) continuam em português, mesmo padrão de
--    candidates.stage — só identificadores técnicos mudam.
--
-- 2) "documentos", "exame_admissional", "contrato_assinado", "onboarding" e
--    "treinamento" não são etapas de kanban — são checklist de uma única
--    etapa "contratacao". O exame admissional já é um item da checklist de
--    documentos ('aso_admissional'); a assinatura de contrato já tem aba
--    própria (employee_contracts); onboarding/treinamento ganham 2 flags
--    booleanas simples no processo.

-- ============================================================
-- 1) Rename de tabelas
-- ============================================================

ALTER TABLE colaboradores_processo RENAME TO employee_processes;
ALTER TABLE colaboradores_documentos RENAME TO employee_documents;
ALTER TABLE colaboradores_contratos RENAME TO employee_contracts;
ALTER TABLE colaboradores_timeline RENAME TO employee_timeline;

-- ============================================================
-- 2) Rename de colunas
-- ============================================================

ALTER TABLE employee_processes RENAME COLUMN candidato_id TO candidate_id;
ALTER TABLE employee_processes RENAME COLUMN tipo_vinculo TO employment_type;
ALTER TABLE employee_processes RENAME COLUMN unidade_id TO store_id;
ALTER TABLE employee_processes RENAME COLUMN cargo TO role_title;
ALTER TABLE employee_processes RENAME COLUMN estagio_atual TO current_stage;
ALTER TABLE employee_processes RENAME COLUMN data_inicio_processo TO started_at;
ALTER TABLE employee_processes RENAME COLUMN data_efetivacao TO activated_at;

ALTER TABLE employee_documents RENAME COLUMN processo_id TO process_id;
ALTER TABLE employee_documents RENAME COLUMN tipo_documento TO document_type;
ALTER TABLE employee_documents RENAME COLUMN arquivo_url TO file_url;

ALTER TABLE employee_contracts RENAME COLUMN processo_id TO process_id;
ALTER TABLE employee_contracts RENAME COLUMN tipo_contrato TO contract_type;
ALTER TABLE employee_contracts RENAME COLUMN arquivo_url TO file_url;
ALTER TABLE employee_contracts RENAME COLUMN data_assinatura TO signature_date;
ALTER TABLE employee_contracts RENAME COLUMN vigencia_inicio TO term_start;
ALTER TABLE employee_contracts RENAME COLUMN vigencia_fim TO term_end;

ALTER TABLE employee_timeline RENAME COLUMN processo_id TO process_id;
ALTER TABLE employee_timeline RENAME COLUMN autor_id TO author_id;
ALTER TABLE employee_timeline RENAME COLUMN data TO occurred_at;
ALTER TABLE employee_timeline RENAME COLUMN texto TO note;
ALTER TABLE employee_timeline RENAME COLUMN origem TO source;

-- ============================================================
-- 3) Rename de índices, policies e triggers/funções
-- ============================================================

ALTER INDEX idx_colaboradores_processo_candidato_id RENAME TO idx_employee_processes_candidate_id;
ALTER INDEX idx_colaboradores_processo_unidade_id RENAME TO idx_employee_processes_store_id;
ALTER INDEX idx_colaboradores_processo_tipo_estagio RENAME TO idx_employee_processes_employment_type_stage;
ALTER INDEX idx_colaboradores_processo_candidato_ativo_unique RENAME TO idx_employee_processes_candidate_active_unique;
ALTER INDEX idx_colaboradores_documentos_processo_id RENAME TO idx_employee_documents_process_id;
ALTER INDEX idx_colaboradores_contratos_processo_id RENAME TO idx_employee_contracts_process_id;
ALTER INDEX idx_colaboradores_timeline_processo_id RENAME TO idx_employee_timeline_process_id;

ALTER POLICY colaboradores_processo_rh_access ON employee_processes RENAME TO employee_processes_rh_access;
ALTER POLICY colaboradores_documentos_rh_access ON employee_documents RENAME TO employee_documents_rh_access;
ALTER POLICY colaboradores_contratos_rh_access ON employee_contracts RENAME TO employee_contracts_rh_access;
ALTER POLICY colaboradores_timeline_rh_access ON employee_timeline RENAME TO employee_timeline_rh_access;

DROP TRIGGER colaboradores_processo_sync_status ON employee_processes;
DROP FUNCTION trg_colaboradores_processo_sync_status();
DROP TRIGGER colaboradores_documentos_set_updated_at ON employee_documents;
DROP FUNCTION trg_colaboradores_documentos_set_updated_at();

ALTER TABLE employee_processes RENAME CONSTRAINT colaboradores_processo_estagio_valido TO employee_processes_current_stage_valid_old;

-- ============================================================
-- 4) Checklist de contratação: 2 flags booleanas + etapas simplificadas
-- ============================================================

ALTER TABLE employee_processes
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN training_applicable boolean NOT NULL DEFAULT true,
  ADD COLUMN training_completed boolean NOT NULL DEFAULT false;

UPDATE employee_processes
SET current_stage = 'contratacao'
WHERE current_stage IN ('documentos', 'exame_admissional', 'contrato_assinado', 'onboarding', 'treinamento');

ALTER TABLE employee_processes DROP CONSTRAINT employee_processes_current_stage_valid_old;

ALTER TABLE employee_processes
  ADD CONSTRAINT employee_processes_current_stage_valid CHECK (
    (employment_type = 'clt' AND current_stage IN (
      'contratacao', 'experiencia', 'decisao', 'efetivado', 'encerrado'
    ))
    OR (employment_type = 'mei_sem_experiencia' AND current_stage IN (
      'contrato_formacao', 'formacao', 'decisao_formacao', 'contratacao',
      'acompanhamento_90d', 'efetivado', 'encerrado'
    ))
    OR (employment_type = 'mei_com_experiencia' AND current_stage IN (
      'contratacao', 'efetivado', 'encerrado'
    ))
  );

-- ============================================================
-- 5) Recria trigger de sincronização de status (nomes em inglês)
-- ============================================================

CREATE OR REPLACE FUNCTION trg_employee_processes_sync_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_stage = 'efetivado' THEN
    NEW.status := 'ativo';
    NEW.activated_at := COALESCE(NEW.activated_at, now());
  ELSIF NEW.current_stage = 'encerrado' THEN
    NEW.status := 'encerrado';
  ELSE
    NEW.status := 'em_andamento';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_processes_sync_status
  BEFORE INSERT OR UPDATE ON employee_processes
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_processes_sync_status();

CREATE OR REPLACE FUNCTION trg_employee_documents_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_documents_set_updated_at
  BEFORE UPDATE ON employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_documents_set_updated_at();

-- ============================================================
-- 6) RPC de promoção — nomes em inglês, estágio inicial 'contratacao'
-- ============================================================

DROP FUNCTION promote_candidate_to_dp(uuid, text);

CREATE OR REPLACE FUNCTION promote_candidate_to_dp(p_candidate_id uuid, p_employment_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_role_title text;
  v_initial_stage text;
  v_process_id uuid;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH/DP';
  END IF;

  IF p_employment_type NOT IN ('clt', 'mei_sem_experiencia', 'mei_com_experiencia') THEN
    RAISE EXCEPTION 'employment_type inválido: %', p_employment_type;
  END IF;

  SELECT jo.store_id, jo.role_title
  INTO v_store_id, v_role_title
  FROM candidates c
  JOIN job_openings jo ON jo.id = c.job_opening_id
  WHERE c.id = p_candidate_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Candidato não encontrado ou sem vaga associada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM employee_processes
    WHERE candidate_id = p_candidate_id AND status IN ('em_andamento', 'ativo')
  ) THEN
    RAISE EXCEPTION 'Candidato já possui um processo de DP em andamento';
  END IF;

  UPDATE candidates SET stage = 'contratado' WHERE id = p_candidate_id;

  v_initial_stage := CASE
    WHEN p_employment_type = 'mei_sem_experiencia' THEN 'contrato_formacao'
    ELSE 'contratacao'
  END;

  INSERT INTO employee_processes (candidate_id, employment_type, store_id, role_title, current_stage)
  VALUES (p_candidate_id, p_employment_type, v_store_id, v_role_title, v_initial_stage)
  RETURNING id INTO v_process_id;

  IF p_employment_type = 'clt' THEN
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'ctps', 'pis_pasep', 'titulo_eleitor',
      'comprovante_escolaridade', 'foto_3x4', 'aso_admissional', 'dados_bancarios'
    ]::text[]) AS doc;
  ELSE
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'cnpj_ccmei', 'dados_bancarios', 'foto_3x4'
    ]::text[]) AS doc;
  END IF;

  INSERT INTO employee_timeline (process_id, author_id, occurred_at, note, source)
  SELECT
    v_process_id,
    h.changed_by,
    h.changed_at,
    'Etapa RH: ' || COALESCE(h.previous_stage, 'criação do candidato') || ' → ' || h.new_stage,
    'rh'
  FROM candidate_stage_history h
  WHERE h.candidate_id = p_candidate_id
  ORDER BY h.changed_at;

  RETURN v_process_id;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_candidate_to_dp(uuid, text) TO authenticated;
