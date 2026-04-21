-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Adiciona coluna permissions (JSONB) na tabela profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed: lmendescapelini@gmail.com recebe can_edit_orders = true
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles
SET    permissions = permissions || '{"can_edit_orders": true}'::jsonb
WHERE  id = (
  SELECT id FROM auth.users WHERE email = 'lmendescapelini@gmail.com' LIMIT 1
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: admin_set_user_permission — toggle granular permission
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_set_user_permission(
  p_user_id   uuid,
  p_key       text,
  p_value     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE profiles
  SET    permissions = permissions || jsonb_build_object(p_key, p_value)
  WHERE  id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_user_permission(uuid, text, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Atualiza get_system_users para retornar permissions
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_system_users();
CREATE OR REPLACE FUNCTION get_system_users()
RETURNS TABLE (
  id              uuid,
  role            text,
  full_name       text,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  permissions     jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.role,
    p.full_name,
    u.email,
    p.created_at,
    u.last_sign_in_at,
    p.permissions
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role IN ('admin', 'salao')
  ORDER BY p.role ASC, p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_system_users() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: admin_update_order — edição completa de pedido (itens, seller, pgto)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_update_order(
  p_order_id       uuid,
  p_seller_id      uuid,           -- pode ser NULL para remover vendedor
  p_payment_method text,
  p_payment_splits jsonb,          -- NULL se não MISTO
  p_notes          text,
  p_status         text,
  p_discount       numeric(10,2),
  p_items          jsonb           -- [{product_id, product_name, qty, unit_price}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal  numeric(10,2);
  v_total     numeric(10,2);
  v_item      jsonb;
  v_qty       int;
  v_price     numeric(10,2);
  v_line      numeric(10,2);
BEGIN
  -- Verifica admin + permissão granular
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  IF NOT COALESCE(
    (SELECT (perms.permissions->>'can_edit_orders')::boolean
     FROM profiles perms WHERE perms.id = auth.uid()),
    false
  ) THEN
    RAISE EXCEPTION 'Acesso negado: permissão can_edit_orders não concedida';
  END IF;

  -- Remove itens atuais
  DELETE FROM order_items WHERE order_id = p_order_id;

  -- Insere novos itens e acumula subtotal
  v_subtotal := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty   := (v_item->>'qty')::int;
    v_price := (v_item->>'unit_price')::numeric(10,2);
    v_line  := v_qty * v_price;
    v_subtotal := v_subtotal + v_line;

    INSERT INTO order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_price_snapshot,
      qty,
      line_total
    ) VALUES (
      p_order_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      v_price,
      v_qty,
      v_line
    );
  END LOOP;

  v_total := v_subtotal - COALESCE(p_discount, 0);

  -- Atualiza campos do pedido
  UPDATE orders SET
    seller_id      = p_seller_id,
    payment_method = p_payment_method,
    payment_splits = p_payment_splits,
    notes          = p_notes,
    status         = p_status,
    discount_amount = COALESCE(p_discount, 0),
    subtotal       = v_subtotal,
    total          = GREATEST(v_total, 0),
    updated_at     = now()
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_order(uuid, uuid, text, jsonb, text, text, numeric, jsonb) TO authenticated;
