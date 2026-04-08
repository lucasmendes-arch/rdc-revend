-- ============================================================================
-- Migration: 20260408000001_customer_segment.sql
-- Segmentação comercial de clientes e pedidos
--
-- Implementa:
--   1. ADD COLUMN customer_segment em profiles (source of truth)
--   2. ADD COLUMN customer_segment_snapshot em orders (histórico)
--   3. Backfill de profiles com base em is_partner
--   4. Backfill de orders com base no profile do user_id
--   5. Atualização de RPCs para herdar segment no pedido
--   6. Atualização de get_all_profiles para retornar segment
--
-- Valores válidos: 'network_partner', 'wholesale_buyer'
-- NULL temporário permitido para legado ambíguo
--
-- Retrocompatibilidade:
--   - Ambas as colunas são nullable → sem quebra
--   - RPCs mantêm mesma assinatura → chamadas existentes continuam
--   - Backfill usa is_partner como critério seguro
-- ============================================================================


-- ============================================================================
-- 1. COLUNA customer_segment em profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_segment text;

-- CHECK constraint com valores controlados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_customer_segment_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_customer_segment_check
      CHECK (customer_segment IN ('network_partner', 'wholesale_buyer'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_customer_segment
  ON public.profiles (customer_segment)
  WHERE customer_segment IS NOT NULL;


-- ============================================================================
-- 2. COLUNA customer_segment_snapshot em orders
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_segment_snapshot text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_segment_snapshot_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_segment_snapshot_check
      CHECK (customer_segment_snapshot IN ('network_partner', 'wholesale_buyer'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_customer_segment_snapshot
  ON public.orders (customer_segment_snapshot)
  WHERE customer_segment_snapshot IS NOT NULL;


-- ============================================================================
-- 3. BACKFILL profiles
--
-- Critério:
--   is_partner = true  → 'network_partner'
--   is_partner = false → 'wholesale_buyer'
--   role != 'user'     → não classificar (admin, salao)
--
-- Idempotente: só atualiza onde customer_segment IS NULL
-- ============================================================================

UPDATE public.profiles
SET customer_segment = CASE
  WHEN is_partner = true THEN 'network_partner'
  ELSE 'wholesale_buyer'
END
WHERE role = 'user'
  AND customer_segment IS NULL;


-- ============================================================================
-- 4. BACKFILL orders (herda do profile)
--
-- Critério: copia customer_segment do profiles.id = orders.user_id
-- Se o profile não tem segment (admin/salao criando pedido), fica NULL
-- Idempotente: só atualiza onde customer_segment_snapshot IS NULL
-- ============================================================================

UPDATE public.orders o
SET customer_segment_snapshot = p.customer_segment
FROM public.profiles p
WHERE p.id = o.user_id
  AND o.customer_segment_snapshot IS NULL
  AND p.customer_segment IS NOT NULL;


-- ============================================================================
-- 5. ATUALIZAÇÃO DE RPCs
-- ============================================================================

-- 5a. create_manual_order — adiciona snapshot automático
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
  p_seller_id      uuid        DEFAULT NULL
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
  v_customer_segment   text;
  v_product_id         uuid;
  v_product_name       text;
  v_qty                int;
  v_price              numeric(10,2);
  v_line_total         numeric(10,2);
  v_subtotal           numeric(10,2) := 0;
  v_total              numeric(10,2);
  v_order_date         timestamptz;
  v_resolved_seller_id uuid;
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
  IF p_seller_id IS NOT NULL THEN
    v_resolved_seller_id := p_seller_id;
  ELSE
    SELECT id
      INTO v_resolved_seller_id
      FROM public.sellers
     WHERE is_default = true
       AND active     = true
     LIMIT 1;
  END IF;

  -- ── Dados do Cliente + segment snapshot ───────────────────────────────────
  SELECT
    COALESCE(p.full_name, u.email, 'Cliente'),
    COALESCE(p.phone, ''),
    COALESCE(u.email, ''),
    p.customer_segment
  INTO v_customer_name, v_customer_phone, v_customer_email, v_customer_segment
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
    seller_id, customer_segment_snapshot
  ) VALUES (
    p_user_id, p_status, v_subtotal, 0, v_total,
    v_customer_name, v_customer_phone, v_customer_email,
    p_notes, p_origin, p_payment_method, p_coupon_id, v_order_date,
    v_resolved_seller_id, v_customer_segment
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
        'seller_id',      v_resolved_seller_id,
        'customer_segment', v_customer_segment,
        'manual',         true
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;


-- 5b. create_salao_order — adiciona snapshot automático
CREATE OR REPLACE FUNCTION public.create_salao_order(
  p_user_id          uuid,
  p_items            jsonb,
  p_notes            text        DEFAULT NULL,
  p_payment_method   text        DEFAULT NULL,
  p_order_date       timestamptz DEFAULT NULL,
  p_seller_id        uuid        DEFAULT NULL,
  p_pickup_unit_slug text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salao_user_id       uuid;
  v_order_id            uuid;
  v_item                jsonb;
  v_customer_name       text;
  v_customer_phone      text;
  v_customer_email      text;
  v_is_partner          boolean;
  v_customer_segment    text;
  v_product_id          uuid;
  v_product_name        text;
  v_qty                 int;
  v_price               numeric(10,2);
  v_catalog_price       numeric(10,2);
  v_catalog_partner     numeric(10,2);
  v_line_total          numeric(10,2);
  v_subtotal            numeric(10,2) := 0;
  v_resolved_seller_id  uuid;
  v_order_date          timestamptz;
  v_pickup_unit_address text;
BEGIN
  -- ── Verificação de autorização ──────────────────────────────────────────
  v_salao_user_id := auth.uid();
  IF v_salao_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_salao_user_id AND role = 'salao'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer role salao';
  END IF;

  -- ── Validações de entrada ───────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pedido deve ter ao menos 1 item';
  END IF;

  -- ── Resolver seller ─────────────────────────────────────────────────────
  IF p_seller_id IS NOT NULL THEN
    v_resolved_seller_id := p_seller_id;
  ELSE
    SELECT id INTO v_resolved_seller_id
      FROM public.sellers
     WHERE is_default = true AND active = true
     LIMIT 1;
  END IF;

  -- ── Resolver order_date ─────────────────────────────────────────────────
  v_order_date := COALESCE(p_order_date, now());

  -- ── Validar unidade de retirada (pickup) ────────────────────────────────
  IF p_pickup_unit_slug IS NULL THEN
    RAISE EXCEPTION 'Unidade de Salão é obrigatória para o pedido';
  END IF;

  SELECT address INTO v_pickup_unit_address
    FROM pickup_units
   WHERE slug = p_pickup_unit_slug AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade de salão não encontrada ou inativa: %', p_pickup_unit_slug;
  END IF;

  -- ── Dados do Cliente + segment snapshot ─────────────────────────────────
  SELECT
    COALESCE(p.full_name, u.email, 'Cliente'),
    COALESCE(p.phone, ''),
    COALESCE(u.email, ''),
    COALESCE(p.is_partner, false),
    p.customer_segment
  INTO v_customer_name, v_customer_phone, v_customer_email, v_is_partner, v_customer_segment
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_user_id;
  END IF;

  -- ── Calcular subtotal server-side com preço validado do catálogo ────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::int;

    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Quantidade inválida: %', v_qty;
    END IF;

    SELECT cp.price, cp.partner_price
      INTO v_catalog_price, v_catalog_partner
      FROM catalog_products cp
     WHERE cp.id = v_product_id AND cp.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou inativo: %', v_product_id;
    END IF;

    v_price := CASE
      WHEN v_is_partner AND v_catalog_partner IS NOT NULL THEN v_catalog_partner
      ELSE v_catalog_price
    END;

    IF v_price <= 0 THEN
      RAISE EXCEPTION 'Preço inválido para produto %: %', v_product_id, v_price;
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  -- ── Criar o Pedido ──────────────────────────────────────────────────────
  INSERT INTO orders (
    user_id, status, subtotal, shipping, total,
    customer_name, customer_whatsapp, customer_email,
    notes, origin, payment_method, seller_id, created_at,
    delivery_method, pickup_unit_slug, pickup_unit_address,
    customer_segment_snapshot
  ) VALUES (
    p_user_id,
    'recebido',
    v_subtotal,
    0,
    v_subtotal,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    p_notes,
    'salao',
    p_payment_method,
    v_resolved_seller_id,
    v_order_date,
    'pickup',
    p_pickup_unit_slug,
    v_pickup_unit_address,
    v_customer_segment
  )
  RETURNING id INTO v_order_id;

  -- ── Criar os Itens (com preço validado do catálogo) ─────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id   := (v_item->>'product_id')::uuid;
    v_product_name := COALESCE(v_item->>'product_name', 'Produto');
    v_qty          := (v_item->>'quantity')::int;

    SELECT cp.price, cp.partner_price
      INTO v_catalog_price, v_catalog_partner
      FROM catalog_products cp
     WHERE cp.id = v_product_id;

    v_price := CASE
      WHEN v_is_partner AND v_catalog_partner IS NOT NULL THEN v_catalog_partner
      ELSE v_catalog_price
    END;

    v_line_total := v_qty * v_price;

    INSERT INTO order_items (
      order_id, product_id, product_name_snapshot,
      unit_price_snapshot, qty, line_total
    ) VALUES (
      v_order_id, v_product_id, v_product_name,
      v_price, v_qty, v_line_total
    );
  END LOOP;

  -- ── Atualizar sessão do cliente ─────────────────────────────────────────
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (user_id) DO UPDATE
    SET status     = 'comprou',
        session_id = 'user_' || EXCLUDED.user_id::text,
        updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ──────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_user_id,
      'user_' || p_user_id::text,
      'purchase_completed',
      jsonb_build_object(
        'order_id',         v_order_id,
        'amount',           v_subtotal,
        'origin',           'salao',
        'seller_id',        v_resolved_seller_id,
        'pickup_unit_slug', p_pickup_unit_slug,
        'customer_segment', v_customer_segment,
        'manual',           false
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;


-- 5c. get_all_profiles — retorna customer_segment
DROP FUNCTION IF EXISTS public.get_all_profiles();

CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  business_type text,
  email text,
  is_partner boolean,
  customer_segment text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT
      p.id, p.full_name, p.phone, p.business_type, u.email::text,
      p.is_partner, p.customer_segment
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
    ORDER BY p.full_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;


-- ============================================================================
-- 6. RPC para admin editar customer_segment de um profile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_customer_segment(
  p_user_id uuid,
  p_segment text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_segment IS NOT NULL AND p_segment NOT IN ('network_partner', 'wholesale_buyer') THEN
    RAISE EXCEPTION 'Segmento inválido: %. Valores válidos: network_partner, wholesale_buyer', p_segment;
  END IF;

  UPDATE public.profiles
  SET customer_segment = p_segment
  WHERE id = p_user_id AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_customer_segment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_segment(uuid, text) TO authenticated;
