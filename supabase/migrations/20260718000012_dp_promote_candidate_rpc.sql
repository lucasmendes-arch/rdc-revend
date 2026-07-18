-- RPC de transição RH → DP: quando um card do RH chega em "Contratado", o
-- operador escolhe o tipo_vinculo e essa função cria o processo em DP,
-- popula a checklist fixa de documentos, copia o histórico de recrutamento
-- pra timeline (origem='rh') e marca o candidato como contratado.
-- Checklist espelha src/lib/dpConstants.ts — não configurável nesta etapa.

CREATE OR REPLACE FUNCTION promote_candidate_to_dp(p_candidate_id uuid, p_tipo_vinculo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_role_title text;
  v_estagio_inicial text;
  v_processo_id uuid;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH/DP';
  END IF;

  IF p_tipo_vinculo NOT IN ('clt', 'mei_sem_experiencia', 'mei_com_experiencia') THEN
    RAISE EXCEPTION 'tipo_vinculo inválido: %', p_tipo_vinculo;
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
    SELECT 1 FROM colaboradores_processo
    WHERE candidato_id = p_candidate_id AND status IN ('em_andamento', 'ativo')
  ) THEN
    RAISE EXCEPTION 'Candidato já possui um processo de DP em andamento';
  END IF;

  -- Idempotente se o candidato já estava em 'contratado' (ex: candidato legado) —
  -- o trigger de histórico só grava uma nova linha se o stage realmente mudar.
  UPDATE candidates SET stage = 'contratado' WHERE id = p_candidate_id;

  v_estagio_inicial := CASE
    WHEN p_tipo_vinculo = 'mei_sem_experiencia' THEN 'contrato_formacao'
    ELSE 'documentos'
  END;

  INSERT INTO colaboradores_processo (candidato_id, tipo_vinculo, unidade_id, cargo, estagio_atual)
  VALUES (p_candidate_id, p_tipo_vinculo, v_store_id, v_role_title, v_estagio_inicial)
  RETURNING id INTO v_processo_id;

  IF p_tipo_vinculo = 'clt' THEN
    INSERT INTO colaboradores_documentos (processo_id, tipo_documento)
    SELECT v_processo_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'ctps', 'pis_pasep', 'titulo_eleitor',
      'comprovante_escolaridade', 'foto_3x4', 'aso_admissional', 'dados_bancarios'
    ]::text[]) AS doc;
  ELSE
    INSERT INTO colaboradores_documentos (processo_id, tipo_documento)
    SELECT v_processo_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'cnpj_ccmei', 'dados_bancarios', 'foto_3x4'
    ]::text[]) AS doc;
  END IF;

  -- Copia o histórico de etapas do RH (incluindo a transição pra 'contratado'
  -- feita acima) como timeline somente-leitura de origem 'rh'.
  INSERT INTO colaboradores_timeline (processo_id, autor_id, data, texto, origem)
  SELECT
    v_processo_id,
    h.changed_by,
    h.changed_at,
    'Etapa RH: ' || COALESCE(h.previous_stage, 'criação do candidato') || ' → ' || h.new_stage,
    'rh'
  FROM candidate_stage_history h
  WHERE h.candidate_id = p_candidate_id
  ORDER BY h.changed_at;

  RETURN v_processo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_candidate_to_dp(uuid, text) TO authenticated;
