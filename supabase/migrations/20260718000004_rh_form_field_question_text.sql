-- Módulo de RH — texto da pergunta separado da label interna
-- label = nome curto usado no construtor, no card do kanban e nas respostas
-- (ex: "Foto"). question_text = frase que o candidato lê no formulário
-- público (ex: "Anexe, por favor, uma foto sua com qualidade e boa
-- visibilidade") — opcional; quando vazio, o formulário público cai de volta
-- pra usar a label como pergunta.

ALTER TABLE form_fields ADD COLUMN question_text text;

-- CREATE OR REPLACE sobre a função da migration anterior (não editá-la) —
-- só soma question_text no retorno.
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
        'id', ff.id, 'field_key', ff.field_key, 'label', ff.label, 'question_text', ff.question_text,
        'field_type', ff.field_type, 'required', ff.required, 'sort_order', ff.sort_order,
        'options', ff.options, 'is_system_field', ff.is_system_field
      ) ORDER BY ff.sort_order)
      FROM form_fields ff
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_application_form(text) TO anon, authenticated;
