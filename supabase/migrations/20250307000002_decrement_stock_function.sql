-- Function to atomically decrement stock for a product
-- Uses UPDATE with quantity check to prevent negative stock
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_qty int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE inventory
  SET quantity = quantity - p_qty,
      updated_at = now()
  WHERE product_id = p_product_id
    AND quantity >= p_qty;

  -- If no rows updated, stock was insufficient (race condition guard)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque insuficiente para produto %', p_product_id;
  END IF;
END;
$$;
