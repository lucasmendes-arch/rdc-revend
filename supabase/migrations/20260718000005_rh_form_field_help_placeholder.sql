-- Módulo de RH — tela "Build" do formulário (nos moldes do ClickUp Forms)
-- Cada campo agora tem 3 textos editáveis, exibidos em camadas diferentes:
--   label          = nome curto interno (construtor/card do kanban/respostas) — já existia
--   question_text  = a pergunta em si, como o candidato lê (já existia)
--   help_text      = texto de apoio abaixo da pergunta (ex: "Escreva aqui o seu nome completo")
--   placeholder    = texto fantasma dentro do próprio campo de resposta

ALTER TABLE form_fields ADD COLUMN help_text text;
ALTER TABLE form_fields ADD COLUMN placeholder text;

-- CREATE OR REPLACE sobre a função das migrations anteriores — soma os 2 campos novos no retorno.
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
        'help_text', ff.help_text, 'placeholder', ff.placeholder,
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
