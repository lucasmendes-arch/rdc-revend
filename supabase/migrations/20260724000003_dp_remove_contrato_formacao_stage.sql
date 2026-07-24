-- Remove a etapa 'contrato_formacao' do kanban de Contratação (DP) — pedido
-- do usuário. 'formacao' (rótulo "Curso de Formação" no frontend) passa a
-- ser a etapa inicial da trilha MEI sem experiência exigida.
--
-- Também remove 'foto_3x4' da checklist fixa de documentos — o candidato já
-- tem foto de perfil (candidates.photo_url) trazida do funil de RH,
-- redundante pedir de novo em Documentos.
--
-- Ao mexer em promote_candidate_to_dp achei uma regressão: a migration
-- 20260719000001 (motor de automações do RH, sessão paralela) recriou essa
-- função com CREATE OR REPLACE a partir de uma cópia desatualizada — anterior
-- à simplificação de employment_type feita em 20260718000015 (que passou a
-- validar só 'clt'/'mei' e decidir a trilha via job_roles.requires_experience).
-- A versão que ficou LIVE valida contra o esquema antigo, granular
-- ('clt'/'mei_sem_experiencia'/'mei_com_experiencia'), que o frontend nunca
-- envia (EmploymentType do frontend é só 'clt'|'mei' desde 20260718000015) —
-- toda promoção de candidato MEI seria rejeitada com "employment_type
-- inválido: mei". Corrigido aqui de passagem, já que esta migration precisa
-- reescrever a mesma função de qualquer forma. Ver project_concurrent_sessions
-- na memória operacional — mesmo padrão de risco já documentado.

-- ============================================================
-- 1. Documentos existentes: remove linhas de foto_3x4 (sem file_url —
--    ninguém tinha subido arquivo ainda, feature de anexo é desta sessão).
-- ============================================================

DELETE FROM employee_documents WHERE document_type = 'foto_3x4' AND file_url IS NULL;

-- ============================================================
-- 2. Processos existentes parados em 'contrato_formacao' migram pra
--    'formacao' — não há mais essa etapa no kanban.
-- ============================================================

UPDATE employee_processes
SET current_stage = 'formacao'
WHERE current_stage = 'contrato_formacao';

-- ============================================================
-- 3. CHECK constraint de current_stage — remove 'contrato_formacao' do
--    conjunto válido pra MEI (mesma constraint de 20260718000015).
-- ============================================================

ALTER TABLE employee_processes DROP CONSTRAINT employee_processes_current_stage_valid;
ALTER TABLE employee_processes
  ADD CONSTRAINT employee_processes_current_stage_valid CHECK (
    (employment_type = 'clt' AND current_stage IN (
      'contratacao', 'experiencia', 'decisao', 'efetivado', 'encerrado'
    ))
    OR (employment_type = 'mei' AND current_stage IN (
      'formacao', 'decisao_formacao', 'contratacao',
      'acompanhamento_90d', 'efetivado', 'encerrado'
    ))
  );

-- ============================================================
-- 4. promote_candidate_to_dp — CREATE OR REPLACE preserva GRANTs (ver
--    project_drop_function_grants_pitfall na memória, nunca DROP+CREATE).
--    Corpo = 20260718000015 (validação clt/mei + job_roles.requires_experience,
--    a versão correta) + filtro event_type='stage_change' de 20260719000001
--    (esse pedaço era legítimo) + 'formacao' no lugar de 'contrato_formacao'
--    + sem 'foto_3x4' nos dois arrays de documento.
-- ============================================================

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
    WHEN p_employment_type = 'mei' AND NOT v_requires_experience THEN 'formacao'
    ELSE 'contratacao'
  END;

  INSERT INTO employee_processes (candidate_id, employment_type, store_id, role_title, current_stage)
  VALUES (p_candidate_id, p_employment_type, v_store_id, v_role_title, v_initial_stage)
  RETURNING id INTO v_process_id;

  IF p_employment_type = 'clt' THEN
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'ctps', 'pis_pasep', 'titulo_eleitor',
      'comprovante_escolaridade', 'aso_admissional', 'dados_bancarios'
    ]::text[]) AS doc;
  ELSE
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'cnpj_ccmei', 'dados_bancarios'
    ]::text[]) AS doc;
  END IF;

  -- Só copia mudanças de etapa — event_type novo (tag/comentário/whatsapp)
  -- não faz sentido virar linha de timeline "Etapa RH: X → Y".
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

-- ============================================================
-- 5. Triggers de automação de contrato — disparavam na entrada em
--    'contrato_formacao', agora disparam na entrada em 'formacao' (nova
--    etapa inicial da trilha). CREATE OR REPLACE, mesma assinatura.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_employee_processes_contract_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_intent text;
BEGIN
  IF NEW.employment_type <> 'mei' THEN
    RETURN NEW;
  END IF;

  IF NEW.current_stage = 'formacao'
     AND (TG_OP = 'INSERT' OR OLD.current_stage IS DISTINCT FROM NEW.current_stage) THEN
    v_intent := 'formacao';
  ELSIF TG_OP = 'UPDATE' AND NEW.current_stage = 'encerrado'
        AND OLD.current_stage IN ('formacao', 'decisao_formacao') THEN
    v_intent := 'desligamento_formacao';
  ELSE
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM internal_config WHERE key = 'contract_automation_secret';

  PERFORM net.http_post(
    url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', v_secret),
    body    := jsonb_build_object('process_id', NEW.id, 'intent', v_intent)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_employee_contract_data_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_process record;
  v_secret text;
BEGIN
  SELECT employment_type, current_stage INTO v_process
  FROM employee_processes
  WHERE id = NEW.process_id;

  IF v_process.employment_type = 'mei' AND v_process.current_stage = 'formacao' THEN
    SELECT value INTO v_secret FROM internal_config WHERE key = 'contract_automation_secret';

    PERFORM net.http_post(
      url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', v_secret),
      body    := jsonb_build_object('process_id', NEW.process_id, 'intent', 'formacao')
    );
  END IF;

  RETURN NEW;
END;
$$;
