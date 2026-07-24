-- register_existing_employee (cadastro retroativo de colaborador já ativo)
-- cria um candidates com stage='contratado' só de mentira, pra reaproveitar a
-- estrutura do DP. Esse INSERT dispara o trigger log_candidate_stage_change,
-- que roda dispatch_candidate_automations(..., 'candidate_created', ...) —
-- ou seja, qualquer automação configurada em /admin/rh/automacoes pro evento
-- "candidato criado" (ex.: due_date = created_at + 2 dias, pensada pro funil
-- real de recrutamento) roda aqui também, sem fazer sentido pra alguém que já
-- está ativo na empresa.
--
-- Fix: depois da promoção, sobrescreve start_date com a data de efetivação
-- informada e força due_date de volta pra NULL (em aberto) — desfaz qualquer
-- efeito colateral de automação de 'candidate_created' nesse candidato
-- sintético, sem alterar o motor de automações (que continua correto pro
-- kanban de Candidatos).

CREATE OR REPLACE FUNCTION register_existing_employee(
  p_name text,
  p_whatsapp text,
  p_role_title text,
  p_store_id uuid,
  p_employment_type text,
  p_activated_at date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_opening_id uuid;
  v_candidate_id uuid;
  v_process_id uuid;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH/DP';
  END IF;

  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  IF trim(p_whatsapp) = '' THEN
    RAISE EXCEPTION 'WhatsApp é obrigatório';
  END IF;

  INSERT INTO job_openings (store_id, role_title, status)
  VALUES (p_store_id, p_role_title, 'fechada')
  RETURNING id INTO v_job_opening_id;

  INSERT INTO candidates (job_opening_id, name, whatsapp, stage, source)
  VALUES (v_job_opening_id, trim(p_name), p_whatsapp, 'contratado', 'manual')
  RETURNING id INTO v_candidate_id;

  v_process_id := promote_candidate_to_dp(v_candidate_id, p_employment_type);

  UPDATE employee_processes
  SET current_stage = 'efetivado', activated_at = p_activated_at::timestamptz
  WHERE id = v_process_id;

  -- Sobrescreve o que a automação de 'candidate_created' possa ter setado:
  -- início = data de efetivação informada, prazo sempre em aberto aqui.
  UPDATE candidates
  SET start_date = p_activated_at, due_date = NULL
  WHERE id = v_candidate_id;

  RETURN v_process_id;
END;
$$;

GRANT EXECUTE ON FUNCTION register_existing_employee(text, text, text, uuid, text, date) TO authenticated;
