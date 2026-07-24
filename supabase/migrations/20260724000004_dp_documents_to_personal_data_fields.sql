-- Converte 4 itens do checklist de documentos (aba "Documentos" do card de
-- Contratação) de "anexar arquivo" pra "preencher campo de texto" — pedido
-- do usuário: RG e CPF viram 2 campos separados, Comprovante de residência
-- vira Endereço, Dados bancários vira Chave PIX, Cartão CNPJ (CCMEI) vira
-- CNPJ. Todos esses valores já tinham uma casa natural em
-- employee_contract_data (cpf/rg/address/pix_key já existiam — usados na
-- aba "Dados para contrato" de /admin/dp/contratos), então em vez de
-- inventar uma coluna de valor solta em employee_documents (duplicaria a
-- mesma informação em dois lugares), esses 4 itens saem do checklist de
-- arquivo e passam a ser editados direto contra employee_contract_data.
-- Só falta CNPJ nessa tabela — adicionado aqui.
--
-- Resultado: checklist de arquivo (employee_documents) fica só com o que é
-- de fato um documento escaneado — CLT: ctps/pis_pasep/titulo_eleitor/
-- comprovante_escolaridade/aso_admissional (5 itens). MEI fica sem nenhum
-- item de arquivo (os 4 que tinha eram exatamente os convertidos).

ALTER TABLE employee_contract_data ADD COLUMN cnpj text;

-- Linhas existentes desses 4 tipos (sem file_url, ninguém tinha anexado
-- ainda — feature de anexo é desta sessão) somem do checklist de arquivo.
DELETE FROM employee_documents
WHERE document_type IN ('rg_cpf', 'comprovante_residencia', 'dados_bancarios', 'cnpj_ccmei')
  AND file_url IS NULL;

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

  -- rg_cpf / comprovante_residencia / dados_bancarios / cnpj_ccmei saíram
  -- daqui — viraram campos de employee_contract_data (rg, cpf, address,
  -- pix_key, cnpj), preenchidos direto na aba Documentos do card.
  IF p_employment_type = 'clt' THEN
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'ctps', 'pis_pasep', 'titulo_eleitor', 'comprovante_escolaridade', 'aso_admissional'
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
