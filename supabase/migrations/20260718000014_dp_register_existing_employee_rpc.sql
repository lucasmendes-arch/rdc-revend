-- Cadastro retroativo de colaborador que já está ativo na empresa e nunca
-- passou pelo funil de recrutamento do RH (funcionário legado). Em vez de
-- duplicar nome/whatsapp direto em employee_processes, reaproveita 100% da
-- estrutura existente por baixo dos panos:
--   1. cria uma job_opening já 'fechada' (o cargo nunca esteve realmente
--      em aberto pra recrutamento — só documenta a origem do cargo/unidade)
--   2. cria um candidate 'manual' com stage='contratado'
--   3. chama promote_candidate_to_dp normalmente (mesma checklist de
--      documentos, mesma cópia de timeline)
--   4. avança current_stage direto pra 'efetivado' (trigger já existente
--      sincroniza status='ativo' + activated_at)
-- Resultado: some do kanban de Contratação (não é 'em_andamento'), aparece
-- direto em /admin/dp/colaboradores.

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

  RETURN v_process_id;
END;
$$;

GRANT EXECUTE ON FUNCTION register_existing_employee(text, text, text, uuid, text, date) TO authenticated;
