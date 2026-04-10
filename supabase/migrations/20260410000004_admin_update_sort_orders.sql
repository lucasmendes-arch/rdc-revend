-- RPC para admin atualizar sort_order de múltiplos produtos de uma vez.
-- Recebe um array JSON [{id, sort_order}, ...] e aplica em lote.
CREATE OR REPLACE FUNCTION admin_update_product_sort_orders(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  -- Admin-only
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE catalog_products
    SET sort_order = (item->>'sort_order')::int
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_product_sort_orders(jsonb) TO authenticated;
