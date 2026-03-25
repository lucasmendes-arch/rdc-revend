-- ============================================================================
-- Migration: 20260324000005_salao_order_custom_fields.sql
-- BLOCO 3A — Part B: Expansão de Persistência para Novo Pedido Salão
--
-- Objetivo:
-- 1. Inserir unidades "Colatina" e "São Gabriel da Palha" na pickup_units
-- 2. Expandir a RPC `create_salao_order` para aceitar e persistir dados
--    customizados de Data do Pedido, Vendedor e Unidade do Salão.
-- ============================================================================

-- ── 1. Seed de Unidades Faltantes ──────────────────────────────────────────
INSERT INTO public.pickup_units (slug, name, address, sort_order) VALUES
  ('colatina', 'Colatina', 'Colatina - ES', 4),
  ('sao-gabriel', 'São Gabriel da Palha', 'São Gabriel da Palha - ES', 5)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Nova Versão da RPC create_salao_order ───────────────────────────────
DROP FUNCTION IF EXISTS public.create_salao_order(uuid, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.create_salao_order(
  p_user_id          uuid,          -- cliente final
  p_items            jsonb,         -- array de itens
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
  v_salao_user_id      uuid;
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
  v_resolved_seller_id uuid;
  v_order_date         timestamptz;
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
    COALESCE(u.email, '')
  INTO v_customer_name, v_customer_phone, v_customer_email
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_user_id;
  END IF;

  -- ── Calcular subtotal server-side a partir dos itens ────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty   := (v_item->>'quantity')::int;
    v_price := (v_item->>'price')::numeric(10,2);
    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantidade inválida: %', v_qty; END IF;
    IF v_price <= 0 THEN RAISE EXCEPTION 'Preço inválido: %', v_price; END IF;
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
    0,                    -- sem frete (salão opera presencialmente)
    v_subtotal,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    p_notes,
    'salao',              -- origin fixo
    p_payment_method,
    v_resolved_seller_id,
    v_order_date,
    'pickup',             -- Salão sempre forca retirada na loja via pickup
    p_pickup_unit_slug,
    v_pickup_unit_address
  )
  RETURNING id INTO v_order_id;

  -- ── Criar os Itens ──────────────────────────────────────────────────────
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

  -- ── Atualizar sessão do cliente ──────────────────────────────────────────
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (session_id) DO UPDATE
    SET status = 'comprou', updated_at = now()
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
