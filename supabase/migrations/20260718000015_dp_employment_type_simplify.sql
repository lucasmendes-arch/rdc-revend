-- Simplifica employment_type pra só 'clt' ou 'mei' — não existe diferença de
-- tipo de contratação entre "MEI com experiência" e "MEI sem experiência".
-- Experiência é uma característica do CARGO (job_roles.requires_experience),
-- não uma escolha manual no momento da promoção. Quando o cargo não exige
-- experiência prévia, o processo MEI nasce em 'contrato_formacao' (trilha de
-- formação); quando exige, nasce direto em 'contratacao' — a mesma
-- diferenciação de fluxo de antes, só que decidida automaticamente pelo cargo
-- em vez de escolhida à mão.

ALTER TABLE job_roles ADD COLUMN requires_experience boolean NOT NULL DEFAULT true;

ALTER TABLE employee_processes DROP CONSTRAINT colaboradores_processo_tipo_vinculo_check;
ALTER TABLE employee_processes DROP CONSTRAINT employee_processes_current_stage_valid;

UPDATE employee_processes
SET employment_type = 'mei'
WHERE employment_type IN ('mei_sem_experiencia', 'mei_com_experiencia');

ALTER TABLE employee_processes
  ADD CONSTRAINT employee_processes_employment_type_valid CHECK (employment_type IN ('clt', 'mei'));

ALTER TABLE employee_processes
  ADD CONSTRAINT employee_processes_current_stage_valid CHECK (
    (employment_type = 'clt' AND current_stage IN (
      'contratacao', 'experiencia', 'decisao', 'efetivado', 'encerrado'
    ))
    OR (employment_type = 'mei' AND current_stage IN (
      'contrato_formacao', 'formacao', 'decisao_formacao', 'contratacao',
      'acompanhamento_90d', 'efetivado', 'encerrado'
    ))
  );

-- NOTA: essa função também foi tocada por 20260719000001 (motor de
-- automações do RH), que generalizou candidate_stage_history num log de
-- atividade genérico (event_type/automation_id/metadata) e filtrou a cópia
-- pra timeline só em event_type='stage_change'. Mantido aqui — não reverter.
CREATE OR REPLACE FUNCTION promote_candidate_to_dp(p_candidate_id uuid, p_employment_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_role_title text;
  v_job_role_id uuid;
  v_requires_experience boolean;
  v_initial_stage text;
  v_process_id uuid;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH/DP';
  END IF;

  IF p_employment_type NOT IN ('clt', 'mei') THEN
    RAISE EXCEPTION 'employment_type inválido: %', p_employment_type;
  END IF;

  SELECT jo.store_id, jo.role_title, jo.job_role_id
  INTO v_store_id, v_role_title, v_job_role_id
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

  -- Experiência é característica do cargo (job_roles), não do candidato.
  -- Vaga manual sem cargo vinculado (job_role_id NULL) assume requer
  -- experiência (caminho padrão, sem trilha de formação).
  v_requires_experience := true;
  IF v_job_role_id IS NOT NULL THEN
    SELECT requires_experience INTO v_requires_experience FROM job_roles WHERE id = v_job_role_id;
    v_requires_experience := COALESCE(v_requires_experience, true);
  END IF;

  v_initial_stage := CASE
    WHEN p_employment_type = 'mei' AND NOT v_requires_experience THEN 'contrato_formacao'
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
  WHERE h.candidate_id = p_candidate_id AND h.event_type = 'stage_change'
  ORDER BY h.changed_at;

  RETURN v_process_id;
END;
$$;
