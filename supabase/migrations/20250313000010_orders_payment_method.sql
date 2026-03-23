-- ============================================================================
-- Migration: 20250313000010_orders_payment_method.sql
-- ID do Prompt: RDC_BACK_E5_P6_CLD_V1
-- Objetivo:
--   1. Adicionar coluna orders.payment_method (TEXT, nullable)
--   2. Atualizar RPC create_manual_order com p_payment_method
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna payment_method
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN public.orders.payment_method IS
  'Forma de pagamento registrada pelo admin: pix, cartao, boleto, dinheiro, outro. '
  'NULL em pedidos do checkout normal (MercadoPago gerencia o método).';

-- ----------------------------------------------------------------------------
-- 2. Atualizar RPC create_manual_order — adiciona p_payment_method
--    Preserva toda a lógica de segurança e CRM da versão anterior.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_customer_id    uuid,
  p_items          jsonb,
  p_total          numeric,
  p_status         text    DEFAULT 'recebido',
  p_origin         text    DEFAULT 'whatsapp',
  p_notes          text    DEFAULT NULL,
  p_payment_method text    DEFAULT NULL
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
  v_computed_total numeric(10,2) := 0;
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

  -- ── Validações básicas ────────────────────────────────────────────────────
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
  WHERE u.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_customer_id;
  END IF;

  -- ── Calcular total a partir dos itens ─────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty   := (v_item->>'quantity')::int;
    v_price := (v_item->>'price')::numeric(10,2);
    v_computed_total := v_computed_total + (v_qty * v_price);
  END LOOP;

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
    p_customer_id,
    p_status,
    v_computed_total,
    0,
    v_computed_total,
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
      order_id,
      product_id,
      product_name_snapshot,
      unit_price_snapshot,
      qty,
      line_total
    ) VALUES (
      v_order_id,
      v_product_id,
      v_product_name,
      v_price,
      v_qty,
      v_line_total
    );
  END LOOP;

  -- ── Atualizar sessão do cliente ───────────────────────────────────────────
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_customer_id, 'user_' || p_customer_id::text, 'comprou')
  ON CONFLICT (session_id) DO UPDATE
    SET status     = 'comprou',
        updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ───────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_customer_id,
      'user_' || p_customer_id::text,
      'purchase_completed',
      jsonb_build_object(
        'order_id',       v_order_id,
        'amount',         v_computed_total,
        'origin',         p_origin,
        'payment_method', p_payment_method,
        'manual',         true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_order_id;
END;
$$;

-- Remover versão anterior da função (assinatura sem p_payment_method)
DROP FUNCTION IF EXISTS public.create_manual_order(uuid, jsonb, numeric, text, text, text);

REVOKE EXECUTE ON FUNCTION public.create_manual_order(uuid, jsonb, numeric, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_manual_order(uuid, jsonb, numeric, text, text, text, text) TO authenticated;
