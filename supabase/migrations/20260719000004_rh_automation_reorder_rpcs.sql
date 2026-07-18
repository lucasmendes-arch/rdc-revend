-- Módulo de RH — Motor de Automações (Fase 3): RPCs de reordenação em lote,
-- mesmo formato de admin_update_form_field_sort_orders (Fase 2).

CREATE OR REPLACE FUNCTION admin_reorder_automations(updates jsonb)
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
    UPDATE automations SET sort_order = (item->>'sort_order')::int WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reorder_automations(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION admin_reorder_automation_actions(updates jsonb)
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
    UPDATE automation_actions SET sort_order = (item->>'sort_order')::int WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reorder_automation_actions(jsonb) TO authenticated;
