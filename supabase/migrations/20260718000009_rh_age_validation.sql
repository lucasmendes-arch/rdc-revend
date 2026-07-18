-- Módulo de RH — valida idade (17 a 99) no submit_candidate_application.
-- RPC é SECURITY DEFINER chamável por anon: validar só no frontend não basta,
-- alguém pode chamar a RPC direto e mandar qualquer valor no campo "idade".

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
  v_photo_url text;
  v_resume_url text;
  v_candidate_id uuid;
  v_answer jsonb;
BEGIN
  SELECT id INTO v_store_id FROM stores WHERE slug = p_store_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade não encontrada';
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

    IF v_field.required AND v_value IS NULL THEN
      RAISE EXCEPTION 'Campo obrigatório não preenchido: %', v_field.label;
    END IF;

    CASE v_field.field_key
      WHEN 'nome' THEN v_name := v_value;
      WHEN 'whatsapp' THEN v_whatsapp := regexp_replace(COALESCE(v_value, ''), '\D', '', 'g');
      WHEN 'vaga_id' THEN v_job_opening_id := v_value::uuid;
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

  -- Demais respostas (não sistema, não foto/currículo) viram candidate_answers.
  FOR v_field IN SELECT * FROM form_fields WHERE NOT is_system_field AND field_key NOT IN ('foto', 'curriculo') LOOP
    v_value := NULL;
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
      IF v_answer->>'field_key' = v_field.field_key THEN
        v_value := NULLIF(TRIM(v_answer->>'value'), '');
      END IF;
    END LOOP;

    IF v_value IS NOT NULL THEN
      INSERT INTO candidate_answers (candidate_id, field_id, value) VALUES (v_candidate_id, v_field.id, v_value);
    END IF;
  END LOOP;

  RETURN v_candidate_id;
END;
$$;
