-- ============================================================================
-- Migration: 20250317000001_pickup_support.sql
-- Feature: Retirada na loja (store pickup)
-- Objetivo:
--   1. Criar tabela pickup_units (unidades disponíveis para retirada)
--   2. Adicionar colunas de delivery em orders
--   3. Atualizar create_manual_order com suporte a retirada
--   4. Seed das 3 unidades iniciais
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela pickup_units — unidades físicas disponíveis para retirada
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickup_units (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  address    text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: leitura pública (qualquer um pode ver as unidades), escrita admin
ALTER TABLE public.pickup_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pickup_units_read" ON public.pickup_units
  FOR SELECT USING (true);

CREATE POLICY "pickup_units_admin_write" ON public.pickup_units
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.pickup_units IS
  'Unidades físicas disponíveis para retirada de pedidos.';

-- ----------------------------------------------------------------------------
-- 2. Seed das 3 unidades iniciais
-- ----------------------------------------------------------------------------
INSERT INTO public.pickup_units (slug, name, address, sort_order) VALUES
  ('linhares',  'Linhares',  'Av. Gov. Carlos Lindemberg, 835 - Centro, Linhares - ES, 29900-203', 1),
  ('serra',     'Serra',     'Av. Central, 1197 - Parque Res. Laranjeiras, Serra - ES, 29165-130', 2),
  ('teixeira',  'Teixeira de Freitas', 'Av. São Paulo, 151 - Bela Vista, Teixeira de Freitas - BA, 45997-006', 3)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Novas colunas em orders para suportar retirada
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'shipping'
    CHECK (delivery_method IN ('shipping', 'pickup'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_unit_slug text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_unit_address text;

-- Constraint: se pickup, deve ter slug e endereço; se shipping, não deve ter
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_pickup_consistency;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_consistency CHECK (
    (delivery_method = 'shipping' AND pickup_unit_slug IS NULL AND pickup_unit_address IS NULL)
    OR
    (delivery_method = 'pickup' AND pickup_unit_slug IS NOT NULL AND pickup_unit_address IS NOT NULL)
  );

-- Constraint: se pickup, shipping deve ser 0
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_pickup_no_shipping;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_no_shipping CHECK (
    delivery_method = 'shipping' OR shipping = 0
  );

COMMENT ON COLUMN public.orders.delivery_method IS
  'Método de entrega: shipping (envio normal) ou pickup (retirada na loja).';
COMMENT ON COLUMN public.orders.pickup_unit_slug IS
  'Slug da unidade de retirada (FK lógica para pickup_units.slug). NULL se shipping.';
COMMENT ON COLUMN public.orders.pickup_unit_address IS
  'Endereço snapshot da unidade no momento da compra. NULL se shipping.';

-- ----------------------------------------------------------------------------
-- 4. Recriar create_manual_order com suporte a delivery/pickup
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_manual_order(uuid,jsonb,numeric,text,text,text,text,numeric,uuid,timestamptz);

CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_user_id          uuid,
  p_items            jsonb,
  p_total            numeric,
  p_status           text        DEFAULT 'recebido',
  p_origin           text        DEFAULT 'whatsapp',
  p_payment_method   text        DEFAULT NULL,
  p_notes            text        DEFAULT NULL,
  p_discount         numeric     DEFAULT 0,
  p_coupon_id        uuid        DEFAULT NULL,
  p_created_at       timestamptz DEFAULT NULL,
  p_delivery_method  text        DEFAULT 'shipping',
  p_pickup_unit_slug text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id            uuid;
  v_order_id            uuid;
  v_item                jsonb;
  v_customer_name       text;
  v_customer_phone      text;
  v_customer_email      text;
  v_product_id          uuid;
  v_product_name        text;
  v_qty                 int;
  v_price               numeric(10,2);
  v_line_total          numeric(10,2);
  v_subtotal            numeric(10,2) := 0;
  v_total               numeric(10,2);
  v_order_date          timestamptz;
  v_pickup_unit_address text;
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

  IF p_delivery_method NOT IN ('shipping', 'pickup') THEN
    RAISE EXCEPTION 'Método de entrega inválido: %', p_delivery_method;
  END IF;

  -- ── Validar unidade de retirada ─────────────────────────────────────────
  IF p_delivery_method = 'pickup' THEN
    IF p_pickup_unit_slug IS NULL THEN
      RAISE EXCEPTION 'Retirada requer uma unidade (pickup_unit_slug)';
    END IF;

    SELECT address INTO v_pickup_unit_address
    FROM pickup_units
    WHERE slug = p_pickup_unit_slug AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unidade de retirada não encontrada ou inativa: %', p_pickup_unit_slug;
    END IF;
  END IF;

  -- ── Data do pedido (retroativa ou agora) ──────────────────────────────────
  v_order_date := COALESCE(p_created_at, now());

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
    user_id, status, subtotal, shipping, total,
    customer_name, customer_whatsapp, customer_email,
    notes, origin, payment_method, coupon_id, created_at,
    delivery_method, pickup_unit_slug, pickup_unit_address
  ) VALUES (
    p_user_id, p_status, v_subtotal,
    0,  -- manual orders: shipping always 0 (pickup or admin decision)
    v_total,
    v_customer_name, v_customer_phone, v_customer_email,
    p_notes, p_origin, p_payment_method, p_coupon_id, v_order_date,
    p_delivery_method,
    CASE WHEN p_delivery_method = 'pickup' THEN p_pickup_unit_slug ELSE NULL END,
    CASE WHEN p_delivery_method = 'pickup' THEN v_pickup_unit_address ELSE NULL END
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
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (session_id) DO UPDATE
    SET status = 'comprou', updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ────────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_user_id,
      'user_' || p_user_id::text,
      'purchase_completed',
      jsonb_build_object(
        'order_id',        v_order_id,
        'amount',          v_total,
        'subtotal',        v_subtotal,
        'discount',        COALESCE(p_discount, 0),
        'coupon_id',       p_coupon_id,
        'origin',          p_origin,
        'payment_method',  p_payment_method,
        'delivery_method', p_delivery_method,
        'pickup_unit',     p_pickup_unit_slug,
        'order_date',      v_order_date,
        'manual',          true
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_order(uuid,jsonb,numeric,text,text,text,text,numeric,uuid,timestamptz,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_manual_order(uuid,jsonb,numeric,text,text,text,text,numeric,uuid,timestamptz,text,text) TO authenticated;

COMMENT ON FUNCTION public.create_manual_order IS
  'Cria pedido manual (admin). Suporta retirada na loja via p_delivery_method + p_pickup_unit_slug. '
  'Quando pickup, busca endereço da unidade automaticamente e força shipping=0.';
