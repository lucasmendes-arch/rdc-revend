-- ============================================================================
-- Migration: 20260324000015_audit_round2_fixes.sql
-- Correções da rodada 2 da auditoria técnica pré-merge
--
-- Fix 1: Blindar partner_price do acesso anônimo
--         Revoga SELECT total de anon em catalog_products e regranta apenas
--         as colunas seguras (tudo exceto partner_price). A view
--         catalog_products_public (security_invoker=true) continua funcionando
--         pois referencia apenas colunas permitidas.
--
-- Fix 2: Garantir is_partner NOT NULL em profiles
--         Migration _012 criou a coluna sem NOT NULL; _013 tentou com
--         IF NOT EXISTS mas não alterou a coluna existente.
--
-- Fix 3: Validar preço server-side em create_salao_order
--         Busca price/partner_price de catalog_products em vez de confiar
--         no preço enviado pelo frontend.
--
-- Retrocompatibilidade: sem quebra para fluxos existentes.
-- ============================================================================


-- ============================================================================
-- FIX 1: Blindar partner_price do acesso anônimo
--
-- Estratégia: column-level GRANT.
-- Revoga SELECT full → regranta colunas individualmente excluindo partner_price.
-- A view catalog_products_public referencia apenas colunas seguras e continua
-- funcionando com security_invoker=true.
-- ============================================================================

REVOKE SELECT ON public.catalog_products FROM anon;

GRANT SELECT (
  id, nuvemshop_product_id, name, description_html,
  price, compare_at_price,
  images, main_image, is_active, source, updated_from_source_at,
  created_at, updated_at,
  category_type, is_professional, is_highlight, category_id
) ON public.catalog_products TO anon;


-- ============================================================================
-- FIX 2: Garantir is_partner NOT NULL
-- ============================================================================

-- Primeiro garantir que não há NULLs residuais
UPDATE public.profiles SET is_partner = false WHERE is_partner IS NULL;

-- Agora forçar NOT NULL
ALTER TABLE public.profiles ALTER COLUMN is_partner SET NOT NULL;


-- ============================================================================
-- FIX 3: create_salao_order com validação de preço server-side
--
-- O preço enviado pelo frontend (p_items[].price) é IGNORADO.
-- A RPC busca price/partner_price de catalog_products e decide com base
-- no is_partner do cliente.
-- ============================================================================

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

  -- ── Dados do Cliente ────────────────────────────────────────────────────
  SELECT
    COALESCE(p.full_name, u.email, 'Cliente'),
    COALESCE(p.phone, ''),
    COALESCE(u.email, ''),
    COALESCE(p.is_partner, false)
  INTO v_customer_name, v_customer_phone, v_customer_email, v_is_partner
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_user_id;
  END IF;

  -- ── Calcular subtotal server-side com preço validado do catálogo ────────
  -- NÃO confia no preço enviado pelo frontend.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::int;

    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Quantidade inválida: %', v_qty;
    END IF;

    -- Buscar preço real do catálogo
    SELECT cp.price, cp.partner_price
      INTO v_catalog_price, v_catalog_partner
      FROM catalog_products cp
     WHERE cp.id = v_product_id AND cp.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou inativo: %', v_product_id;
    END IF;

    -- Resolver preço: partner_price se cliente é parceiro E produto tem preço parceiro
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
    delivery_method, pickup_unit_slug, pickup_unit_address
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
    v_pickup_unit_address
  )
  RETURNING id INTO v_order_id;

  -- ── Criar os Itens (com preço validado do catálogo) ─────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id   := (v_item->>'product_id')::uuid;
    v_product_name := COALESCE(v_item->>'product_name', 'Produto');
    v_qty          := (v_item->>'quantity')::int;

    -- Re-buscar preço do catálogo (consistência)
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

  -- ── Atualizar sessão do cliente ──────────────────────────────────────────
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
        'order_id',        v_order_id,
        'amount',          v_subtotal,
        'subtotal',        v_subtotal,
        'origin',          'salao',
        'payment_method',  p_payment_method,
        'seller_id',       v_resolved_seller_id,
        'delivery_method', 'pickup',
        'pickup_unit',     p_pickup_unit_slug
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;

-- Garantir permissões
REVOKE EXECUTE ON FUNCTION public.create_salao_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_salao_order TO authenticated;

-- Force schema reload
NOTIFY pgrst, 'reload schema';
