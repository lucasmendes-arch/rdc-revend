-- ============================================================================
-- Migration: 20260324000014_fix_audit_blockers.sql
-- Correções bloqueantes identificadas na auditoria técnica pré-merge
--
-- Fix 1: create_salao_order — ON CONFLICT (session_id) → (user_id)
--         Regressão introduzida na migration _005 que reverteu o fix da
--         migration 20250313000020. Causa erro 23505 para clientes recorrentes.
--
-- Fix 2: search_customers_for_salao — restaurar normalização de telefone
--         A migration _013 sobrescreveu a função sem o regexp_replace da _007.
--         Busca por dígitos não encontra telefones formatados.
--
-- Retrocompatibilidade: nenhuma quebra — ambos são bug fixes de regressão.
-- ============================================================================


-- ============================================================================
-- FIX 1: create_salao_order — corrigir ON CONFLICT em client_sessions
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
  -- FIX: ON CONFLICT (user_id) — corrige regressão da migration _005 que
  -- usava (session_id), violando a UNIQUE(user_id) adicionada em _014.
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

-- Garantir permissões (idempotente)
REVOKE EXECUTE ON FUNCTION public.create_salao_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_salao_order TO authenticated;


-- ============================================================================
-- FIX 2: search_customers_for_salao — restaurar normalização de telefone
--
-- Combina: is_partner da _013 + regexp_replace da _007 + email::text da _003
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_customers_for_salao(
  p_search  text,
  p_limit   int DEFAULT 10
)
RETURNS TABLE (
  id         uuid,
  full_name  text,
  phone      text,
  email      text,
  is_partner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_search     text;
  v_digits     text;
  v_safe_limit int;
BEGIN
  -- Verificação de autorização: salao ou admin
  IF NOT (public.is_salao() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado: requer role salao ou admin';
  END IF;

  -- Sanitizar entrada
  v_search := TRIM(COALESCE(p_search, ''));
  IF length(v_search) < 2 THEN
    RAISE EXCEPTION 'Busca deve ter ao menos 2 caracteres';
  END IF;

  -- Extrair apenas dígitos para busca de telefone (fix da _007)
  v_digits := regexp_replace(v_search, '\D', '', 'g');

  -- Limitar resultados (ceiling de segurança)
  v_safe_limit := LEAST(GREATEST(p_limit, 1), 20);

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.phone,
      u.email::text,
      p.is_partner
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
      AND (
        p.full_name ILIKE '%' || v_search || '%'
        OR (
          v_digits <> '' AND
          regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') ILIKE '%' || v_digits || '%'
        )
      )
    ORDER BY p.full_name ASC
    LIMIT v_safe_limit;
END;
$$;

-- Force schema reload
NOTIFY pgrst, 'reload schema';
