-- Módulo de RH — visibilidade condicional de pergunta por cargo.
-- Uma pergunta pode ficar restrita a aparecer só quando a vaga escolhida
-- pelo candidato pertence a um dos cargos marcados (job_roles). NULL/vazio
-- = sempre visível (comportamento atual, retrocompatível com todo campo
-- existente). Vaga criada sem vínculo a um cargo do catálogo
-- (job_openings.job_role_id NULL) nunca satisfaz uma condição de cargo.

ALTER TABLE form_fields ADD COLUMN visible_for_job_role_ids uuid[];

-- ============================================================
-- get_public_application_form: expõe job_role_id de cada vaga e a condição
-- de visibilidade de cada campo, pro frontend filtrar em tempo real.
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_application_form(p_store_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_result jsonb;
BEGIN
  SELECT id, name INTO v_store FROM stores WHERE slug = p_store_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade não encontrada';
  END IF;

  SELECT jsonb_build_object(
    'store', jsonb_build_object('id', v_store.id, 'name', v_store.name),
    'job_openings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jo.id, 'role_title', jo.role_title, 'status', jo.status, 'job_role_id', jo.job_role_id,
        'description', jo.description, 'contract_type', jo.contract_type,
        'compensation_type', jo.compensation_type, 'fixed_amount', jo.fixed_amount,
        'variable_percentage', jo.variable_percentage, 'variable_basis', jo.variable_basis,
        'work_schedule', jo.work_schedule, 'workload_hours', jo.workload_hours,
        'requirements', jo.requirements, 'benefits', jo.benefits
      ) ORDER BY jo.role_title)
      FROM job_openings jo
      WHERE jo.store_id = v_store.id
    ), '[]'::jsonb),
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ff.id, 'field_key', ff.field_key, 'label', ff.label, 'question_text', ff.question_text,
        'help_text', ff.help_text, 'placeholder', ff.placeholder, 'step', ff.step,
        'field_type', ff.field_type, 'required', ff.required, 'sort_order', ff.sort_order,
        'options', ff.options, 'is_system_field', ff.is_system_field,
        'visible_for_job_role_ids', ff.visible_for_job_role_ids
      ) ORDER BY ff.sort_order)
      FROM form_fields ff
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- submit_candidate_application: obrigatoriedade e persistência de resposta
-- passam a respeitar a condição de cargo — campo escondido pra vaga
-- escolhida não bloqueia envio nem grava resposta órfã.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_candidate_application(p_store_slug text, p_answers jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_field record;
  v_value text;
  v_name text;
  v_whatsapp text;
  v_age int;
  v_job_opening_id uuid;
  v_job_role_id uuid;
  v_photo_url text;
  v_resume_url text;
  v_candidate_id uuid;
  v_answer jsonb;
  v_applicable boolean;
BEGIN
  SELECT id INTO v_store_id FROM stores WHERE slug = p_store_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade não encontrada';
  END IF;

  -- Descobre a vaga (e o cargo dela) antes de validar obrigatoriedade dos
  -- demais campos — sort_order pode colocar um campo condicional antes do
  -- campo "vaga" no formulário, então não dá pra confiar na ordem do loop.
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    IF v_answer->>'field_key' = 'vaga_id' THEN
      v_job_opening_id := NULLIF(TRIM(v_answer->>'value'), '')::uuid;
    END IF;
  END LOOP;

  IF v_job_opening_id IS NOT NULL THEN
    SELECT job_role_id INTO v_job_role_id FROM job_openings WHERE id = v_job_opening_id;
  END IF;

  -- Valida obrigatoriedade server-side (fonte de verdade, não confia no client)
  -- e extrai os valores especiais (sistema + foto/currículo) pelo field_key.
  FOR v_field IN SELECT * FROM form_fields ORDER BY sort_order LOOP
    v_value := NULL;
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
      IF v_answer->>'field_key' = v_field.field_key THEN
        v_value := NULLIF(TRIM(v_answer->>'value'), '');
      END IF;
    END LOOP;

    v_applicable := v_field.visible_for_job_role_ids IS NULL
      OR array_length(v_field.visible_for_job_role_ids, 1) IS NULL
      OR v_job_role_id = ANY(v_field.visible_for_job_role_ids);

    IF v_field.required AND v_applicable AND v_value IS NULL THEN
      RAISE EXCEPTION 'Campo obrigatório não preenchido: %', v_field.label;
    END IF;

    CASE v_field.field_key
      WHEN 'nome' THEN v_name := v_value;
      WHEN 'whatsapp' THEN v_whatsapp := regexp_replace(COALESCE(v_value, ''), '\D', '', 'g');
      WHEN 'vaga_id' THEN NULL; -- já resolvido acima
      WHEN 'idade' THEN
        IF v_value IS NOT NULL THEN
          IF v_value !~ '^\d+$' THEN
            RAISE EXCEPTION 'Idade inválida';
          END IF;
          v_age := v_value::int;
          IF v_age < 17 OR v_age > 99 THEN
            RAISE EXCEPTION 'Idade deve estar entre 17 e 99 anos';
          END IF;
        END IF;
      WHEN 'foto' THEN v_photo_url := v_value;
      WHEN 'curriculo' THEN v_resume_url := v_value;
      ELSE NULL;
    END CASE;
  END LOOP;

  IF v_job_opening_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM job_openings WHERE id = v_job_opening_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Vaga inválida para esta unidade';
  END IF;

  IF NOT check_rate_limit('candidate_application:' || v_whatsapp, 3, 600) THEN
    RAISE EXCEPTION 'Muitas tentativas — aguarde alguns minutos antes de tentar novamente';
  END IF;

  INSERT INTO candidates (job_opening_id, name, whatsapp, source, photo_url, resume_url)
  VALUES (v_job_opening_id, v_name, v_whatsapp, 'formulario', v_photo_url, v_resume_url)
  RETURNING id INTO v_candidate_id;

  -- Demais respostas (não sistema, não foto/currículo) viram candidate_answers
  -- — só se o campo for aplicável ao cargo da vaga escolhida.
  FOR v_field IN SELECT * FROM form_fields WHERE NOT is_system_field AND field_key NOT IN ('foto', 'curriculo') LOOP
    v_value := NULL;
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
      IF v_answer->>'field_key' = v_field.field_key THEN
        v_value := NULLIF(TRIM(v_answer->>'value'), '');
      END IF;
    END LOOP;

    v_applicable := v_field.visible_for_job_role_ids IS NULL
      OR array_length(v_field.visible_for_job_role_ids, 1) IS NULL
      OR v_job_role_id = ANY(v_field.visible_for_job_role_ids);

    IF v_value IS NOT NULL AND v_applicable THEN
      INSERT INTO candidate_answers (candidate_id, field_id, value) VALUES (v_candidate_id, v_field.id, v_value);
    END IF;
  END LOOP;

  RETURN v_candidate_id;
END;
$$;
