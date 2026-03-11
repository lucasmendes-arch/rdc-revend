-- ============================================================================
-- Migration: 20250313000011_fix_manual_order_signature.sql
-- ID do Prompt: RDC_BACK_E5_P8_CLD_V1
-- Problema: PostgREST retorna 404 porque o frontend envia p_user_id mas a
--   função registrada no banco usa p_customer_id. PostgREST resolve parâmetros
--   por NOME — qualquer divergência resulta em "function not found" (404).
-- Solução: Remover todas as overloads existentes e recriar com a assinatura
--   exata que o frontend envia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remover TODAS as overloads existentes de create_manual_order
--    (assinaturas acumuladas pelas migrations 000009 e 000010)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_manual_order(uuid, jsonb, numeric, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_manual_order(uuid, jsonb, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.create_manual_order(uuid, jsonb, numeric, text, text);
DROP FUNCTION IF EXISTS public.create_manual_order(uuid, jsonb, numeric, text);

-- ----------------------------------------------------------------------------
-- 2. Recriar com assinatura exata do frontend (NewOrder.tsx)
--
-- Payload enviado pelo frontend:
--   { p_user_id, p_items, p_total, p_status, p_origin, p_payment_method, p_notes }
--
-- Todos os parâmetros opcionais têm DEFAULT para que chamadas parciais não
-- quebrem caso o frontend omita p_notes ou p_payment_method.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_user_id        uuid,
  p_items          jsonb,
  p_total          numeric,
  p_status         text    DEFAULT 'recebido',
  p_origin         text    DEFAULT 'whatsapp',
  p_payment_method text    DEFAULT NULL,
  p_notes          text    DEFAULT NULL
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
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_user_id;
  END IF;

  -- ── Calcular total real a partir dos itens ────────────────────────────────
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
    p_user_id,
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
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (session_id) DO UPDATE
    SET status     = 'comprou',
        updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ───────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_user_id,
      'user_' || p_user_id::text,
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

REVOKE EXECUTE ON FUNCTION public.create_manual_order(uuid, jsonb, numeric, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_manual_order(uuid, jsonb, numeric, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_manual_order IS
  'Cria pedido manual (admin-only). Parâmetros alinhados com NewOrder.tsx. '
  'Assinatura: (p_user_id, p_items, p_total, p_status, p_origin, p_payment_method, p_notes).';
