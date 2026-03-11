-- ============================================================================
-- Migration: 20250313000013_delete_test_orders_and_discount.sql
-- 1. Remover pedidos de teste (order_items cascateia via FK)
-- 2. Adicionar suporte a desconto na RPC create_manual_order
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Deletar pedidos de teste pelo prefixo do UUID (8 primeiros chars)
-- ----------------------------------------------------------------------------
DELETE FROM public.orders
WHERE LEFT(id::text, 8) IN ('08fa14a8', '02c7b5c3', '2548756a');

-- ----------------------------------------------------------------------------
-- 2. Recriar create_manual_order com p_discount
--    subtotal = soma dos itens (antes do desconto)
--    total    = subtotal - desconto (mínimo 0)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_manual_order(uuid, jsonb, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_user_id        uuid,
  p_items          jsonb,
  p_total          numeric,
  p_status         text    DEFAULT 'recebido',
  p_origin         text    DEFAULT 'whatsapp',
  p_payment_method text    DEFAULT NULL,
  p_notes          text    DEFAULT NULL,
  p_discount       numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id       uuid;
  v_order_id       uuid;
  v_item           jsonb;
  v_customer_name  text;
  v_customer_phone text;
  v_customer_email text;
  v_product_id     uuid;
  v_product_name   text;
  v_qty            int;
  v_price          numeric(10,2);
  v_line_total     numeric(10,2);
  v_subtotal       numeric(10,2) := 0;
  v_total          numeric(10,2);
BEGIN
  -- ── Verificação de Admin ──────────────────────────────────────────────────
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer role admin';
  END IF;

  -- ── Validações ────────────────────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pedido deve ter ao menos 1 item';
  END IF;

  IF p_status NOT IN ('recebido','aguardando_pagamento','pago','separacao','enviado','entregue','concluido','cancelado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  IF p_origin NOT IN ('site','whatsapp','loja_fisica','outro') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origin;
  END IF;

  -- ── Dados do Cliente ──────────────────────────────────────────────────────
  SELECT
    COALESCE(p.full_name, u.email, 'Cliente'),
    COALESCE(p.phone, ''),
    COALESCE(u.email, '')
  INTO v_customer_name, v_customer_phone, v_customer_email
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_user_id;
  END IF;

  -- ── Calcular subtotal a partir dos itens ──────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty   := (v_item->>'quantity')::int;
    v_price := (v_item->>'price')::numeric(10,2);
    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  -- total = subtotal - desconto (nunca negativo)
  v_total := GREATEST(v_subtotal - COALESCE(p_discount, 0), 0);

  -- ── Criar o Pedido ────────────────────────────────────────────────────────
  INSERT INTO orders (
    user_id,
    status,
    subtotal,
    shipping,
    total,
    customer_name,
    customer_whatsapp,
    customer_email,
    notes,
    origin,
    payment_method
  ) VALUES (
    p_user_id,
    p_status,
    v_subtotal,
    0,
    v_total,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    p_notes,
    p_origin,
    p_payment_method
  )
  RETURNING id INTO v_order_id;

  -- ── Criar os Itens ────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id   := (v_item->>'product_id')::uuid;
    v_product_name := COALESCE(v_item->>'product_name', 'Produto');
    v_qty          := (v_item->>'quantity')::int;
    v_price        := (v_item->>'price')::numeric(10,2);
    v_line_total   := v_qty * v_price;

    INSERT INTO order_items (
      order_id, product_id, product_name_snapshot,
      unit_price_snapshot, qty, line_total
    ) VALUES (
      v_order_id, v_product_id, v_product_name,
      v_price, v_qty, v_line_total
    );
  END LOOP;

  -- ── Atualizar sessão do cliente ───────────────────────────────────────────
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (session_id) DO UPDATE
    SET status = 'comprou', updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ───────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_user_id,
      'user_' || p_user_id::text,
      'purchase_completed',
      jsonb_build_object(
        'order_id', v_order_id, 'amount', v_total,
        'subtotal', v_subtotal, 'discount', COALESCE(p_discount, 0),
        'origin', p_origin, 'payment_method', p_payment_method, 'manual', true
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_order(uuid,jsonb,numeric,text,text,text,text,numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_manual_order(uuid,jsonb,numeric,text,text,text,text,numeric) TO authenticated;
