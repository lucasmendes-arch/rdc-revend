-- Módulo de RH — Formulário Público de Candidatura (Fase 2)
-- form_fields (config global do formulário, construtor no admin)
-- candidate_answers (respostas dinâmicas por candidato)
-- candidates.age vira nullable — idade agora é um campo dinâmico como outro
-- qualquer (cadastro manual do Kanban, Fase 1, continua preenchendo a coluna
-- normalmente; candidatos vindos do formulário público ficam com age=NULL,
-- valor real em candidate_answers).

-- ============================================================
-- Tabelas
-- ============================================================

CREATE TABLE form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('texto', 'numero', 'telefone', 'select', 'data', 'upload_imagem', 'upload_arquivo')),
  required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  options jsonb,
  is_system_field boolean NOT NULL DEFAULT false,
  show_on_card boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_fields_sort_order ON form_fields(sort_order);

CREATE TABLE candidate_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_answers_candidate_id ON candidate_answers(candidate_id);
CREATE INDEX idx_candidate_answers_field_id ON candidate_answers(field_id);

-- candidates.age deixa de ser obrigatória — ver nota no cabeçalho do arquivo.
ALTER TABLE candidates ALTER COLUMN age DROP NOT NULL;

-- ============================================================
-- Seed: 3 campos de sistema + convenientes pré-configurados
-- ============================================================

INSERT INTO form_fields (field_key, label, field_type, required, sort_order, is_system_field, show_on_card) VALUES
  ('nome', 'Nome', 'texto', true, 0, true, false),
  ('whatsapp', 'WhatsApp', 'telefone', true, 1, true, false),
  ('vaga_id', 'Vaga', 'select', true, 2, true, true),
  ('idade', 'Idade', 'numero', true, 3, false, true),
  ('data_inicio', 'Data Início', 'data', false, 4, false, true),
  ('data_fim', 'Data Fim', 'data', false, 5, false, true),
  ('foto', 'Foto', 'upload_imagem', false, 6, false, false),
  ('curriculo', 'Currículo', 'upload_arquivo', false, 7, false, false);

-- ============================================================
-- Trigger: campos de sistema não podem virar opcionais nem perder a flag
-- ============================================================

CREATE OR REPLACE FUNCTION trg_form_fields_protect_system()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system_field THEN
    NEW.required := true;
    NEW.is_system_field := true;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER form_fields_protect_system
  BEFORE UPDATE ON form_fields
  FOR EACH ROW
  EXECUTE FUNCTION trg_form_fields_protect_system();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_answers ENABLE ROW LEVEL SECURITY;

-- Config pública, sem PII — o formulário público precisa ler pra se renderizar.
CREATE POLICY form_fields_public_read ON form_fields
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY form_fields_rh_write ON form_fields
  FOR INSERT
  TO authenticated
  WITH CHECK (has_rh_access());

CREATE POLICY form_fields_rh_update ON form_fields
  FOR UPDATE
  TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

-- Campo de sistema não pode ser apagado — bloqueio também em RLS, não só na UI.
CREATE POLICY form_fields_rh_delete ON form_fields
  FOR DELETE
  TO authenticated
  USING (has_rh_access() AND NOT is_system_field);

-- Respostas contêm dado de candidato — só quem tem acesso ao módulo de RH lê.
-- Sem policy de INSERT pra ninguém: só a RPC SECURITY DEFINER escreve aqui,
-- pra garantir que uma resposta só é criada junto com o candidato dono dela.
CREATE POLICY candidate_answers_rh_read ON candidate_answers
  FOR SELECT
  TO authenticated
  USING (has_rh_access());

GRANT SELECT ON form_fields TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON form_fields TO authenticated;
GRANT SELECT ON candidate_answers TO authenticated;

-- ============================================================
-- RPCs
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
      SELECT jsonb_agg(jsonb_build_object('id', jo.id, 'role_title', jo.role_title, 'status', jo.status) ORDER BY jo.role_title)
      FROM job_openings jo
      WHERE jo.store_id = v_store.id
    ), '[]'::jsonb),
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ff.id, 'field_key', ff.field_key, 'label', ff.label, 'field_type', ff.field_type,
        'required', ff.required, 'sort_order', ff.sort_order, 'options', ff.options,
        'is_system_field', ff.is_system_field
      ) ORDER BY ff.sort_order)
      FROM form_fields ff
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_application_form(text) TO anon, authenticated;

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

GRANT EXECUTE ON FUNCTION submit_candidate_application(text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION admin_update_form_field_sort_orders(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(updates) LOOP
    UPDATE form_fields
    SET sort_order = (item->>'sort_order')::int
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_form_field_sort_orders(jsonb) TO authenticated;
