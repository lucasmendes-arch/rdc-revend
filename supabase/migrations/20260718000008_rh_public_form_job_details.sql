-- Módulo de RH — expõe os campos descritivos da vaga (catálogo de cargos,
-- migration 20260718000003) no formulário público, pra dar um botão de
-- "ver descrição completa da vaga" durante a candidatura.

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
        'id', jo.id, 'role_title', jo.role_title, 'status', jo.status,
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
        'options', ff.options, 'is_system_field', ff.is_system_field
      ) ORDER BY ff.sort_order)
      FROM form_fields ff
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_application_form(text) TO anon, authenticated;
