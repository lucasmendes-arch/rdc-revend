-- ============================================================================
-- Migration: 20260323000003_orders_seller_id.sql
-- BLOCO 2 — Fase 1: vincular pedidos a vendedores
--
-- Implementa:
--   1. ADD COLUMN seller_id em orders (nullable FK → sellers, ON DELETE SET NULL)
--   2. Índice em orders.seller_id para queries de filtro/agrupamento
--   3. Atualização de create_manual_order:
--        + p_seller_id uuid DEFAULT NULL (novo parâmetro opcional ao final)
--        + resolução server-side do vendedor padrão quando seller_id não informado
--        + seller_id incluído no INSERT de orders
--        + seller_id incluído nos metadados do evento CRM
--
-- Retrocompatibilidade:
--   - seller_id é nullable → pedidos existentes ficam com seller_id = NULL
--   - p_seller_id DEFAULT NULL → chamadas existentes sem o parâmetro continuam
--     funcionando exatamente como antes
--   - A RPC resolve o vendedor padrão internamente; se não houver padrão ativo,
--     o pedido é criado com seller_id = NULL (sem erro)
-- ============================================================================


-- ============================================================================
-- 1. COLUNA seller_id em orders
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN seller_id uuid
  REFERENCES public.sellers(id)
  ON DELETE SET NULL;   -- se o vendedor for deletado, o pedido não é deletado;
                        -- seller_id volta a NULL

COMMENT ON COLUMN public.orders.seller_id IS
  'Vendedor responsável pelo pedido. NULL = sem vendedor atribuído.';

CREATE INDEX orders_seller_id_idx ON public.orders (seller_id);


-- ============================================================================
-- 2. RPC create_manual_order — adicionar p_seller_id
--
-- Estratégia de DROP + CREATE:
--   Necessário pois o PostgreSQL não permite ALTER FUNCTION para adicionar
--   parâmetros. O DROP usa a assinatura exata da versão vigente (_020).
--   A nova assinatura adiciona p_seller_id uuid DEFAULT NULL ao final,
--   mantendo compatibilidade com todas as chamadas existentes.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_manual_order(
  uuid, jsonb, numeric, text, text, text, text, numeric, uuid, timestamptz
);

CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_user_id        uuid,
  p_items          jsonb,
  p_total          numeric,
  p_status         text        DEFAULT 'recebido',
  p_origin         text        DEFAULT 'whatsapp',
  p_payment_method text        DEFAULT NULL,
  p_notes          text        DEFAULT NULL,
  p_discount       numeric     DEFAULT 0,
  p_coupon_id      uuid        DEFAULT NULL,
  p_created_at     timestamptz DEFAULT NULL,
  p_seller_id      uuid        DEFAULT NULL   -- NOVO: opcional, retrocompatível
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id           uuid;
  v_order_id           uuid;
  v_item               jsonb;
  v_customer_name      text;
  v_customer_phone     text;
  v_customer_email     text;
  v_product_id         uuid;
  v_product_name       text;
  v_qty                int;
  v_price              numeric(10,2);
  v_line_total         numeric(10,2);
  v_subtotal           numeric(10,2) := 0;
  v_total              numeric(10,2);
  v_order_date         timestamptz;
  v_resolved_seller_id uuid;           -- NOVO: seller resolvido (explicit ou padrão)
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

  IF p_status NOT IN ('recebido','aguardando_pagamento','pago','separacao',
                       'enviado','entregue','concluido','cancelado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  IF p_origin NOT IN ('site','whatsapp','loja_fisica','outro') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origin;
  END IF;

  -- ── Data do pedido (retroativa ou agora) ──────────────────────────────────
  v_order_date := COALESCE(p_created_at, now());

  -- ── Resolver seller_id: explícito > padrão ativo > NULL ──────────────────
  -- Se p_seller_id for informado, usa diretamente (sem validar existência —
  -- a FK em orders.seller_id rejeitará um uuid inválido com erro de integridade).
  -- Se não informado, busca o vendedor marcado como padrão e ativo.
  -- Se não houver padrão, v_resolved_seller_id permanece NULL → pedido sem seller.
  IF p_seller_id IS NOT NULL THEN
    v_resolved_seller_id := p_seller_id;
  ELSE
    SELECT id
      INTO v_resolved_seller_id
      FROM public.sellers
     WHERE is_default = true
       AND active     = true
     LIMIT 1;
    -- FOUND ou NOT FOUND: ambos são válidos; NULL é aceitável
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
    v_qty      := (v_item->>'quantity')::int;
    v_price    := (v_item->>'price')::numeric(10,2);
    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  -- total = subtotal - desconto (nunca negativo)
  v_total := GREATEST(v_subtotal - COALESCE(p_discount, 0), 0);

  -- ── Criar o Pedido ────────────────────────────────────────────────────────
  INSERT INTO orders (
    user_id, status, subtotal, shipping, total,
    customer_name, customer_whatsapp, customer_email,
    notes, origin, payment_method, coupon_id, created_at,
    seller_id                          -- NOVO
  ) VALUES (
    p_user_id, p_status, v_subtotal, 0, v_total,
    v_customer_name, v_customer_phone, v_customer_email,
    p_notes, p_origin, p_payment_method, p_coupon_id, v_order_date,
    v_resolved_seller_id               -- NOVO
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

  -- ── Incrementar uso do cupom (se aplicável) ───────────────────────────────
  IF p_coupon_id IS NOT NULL THEN
    UPDATE coupons
    SET used_count = used_count + 1
    WHERE id = p_coupon_id;
  END IF;

  -- ── Atualizar sessão do cliente ───────────────────────────────────────────
  -- ON CONFLICT (user_id): cobre a UNIQUE constraint adicionada em _014.
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (user_id) DO UPDATE
    SET status     = 'comprou',
        session_id = 'user_' || EXCLUDED.user_id::text,
        updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ────────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_user_id,
      'user_' || p_user_id::text,
      'purchase_completed',
      jsonb_build_object(
        'order_id',       v_order_id,
        'amount',         v_total,
        'subtotal',       v_subtotal,
        'discount',       COALESCE(p_discount, 0),
        'coupon_id',      p_coupon_id,
        'origin',         p_origin,
        'payment_method', p_payment_method,
        'order_date',     v_order_date,
        'seller_id',      v_resolved_seller_id,  -- NOVO
        'manual',         true
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_order(
  uuid, jsonb, numeric, text, text, text, text, numeric, uuid, timestamptz, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_manual_order(
  uuid, jsonb, numeric, text, text, text, text, numeric, uuid, timestamptz, uuid
) TO authenticated;
