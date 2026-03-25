-- ============================================================================
-- Migration: 20260324000001_salao_role_support.sql
-- BLOCO 3A — Etapa 1: suporte à role "salao"
--
-- Implementa:
--   1. Function is_salao() — helper de autorização (espelho de is_admin())
--   2. Function search_customers_for_salao() — busca enxuta de clientes
--   3. Expansão do CHECK de orders.origin para incluir 'salao'
--   4. RPC create_salao_order() — criação de pedido pelo operador do salão
--
-- Retrocompatibilidade:
--   - Nenhuma coluna existente alterada
--   - Nenhuma function existente alterada (create_manual_order intocada)
--   - CHECK de origin expandido (aditivo — valores antigos continuam válidos)
--   - crm_events usa event_type = 'order_created' (já existente no CHECK)
--     com metadata.origin = 'salao' para distinção
--   - Pedidos existentes permanecem inalterados
-- ============================================================================


-- ============================================================================
-- 1. FUNCTION is_salao()
--
-- Espelho de is_admin() para role = 'salao'.
-- SECURITY DEFINER para poder ler profiles sem RLS recursion.
-- Usada em RLS policies e dentro de RPCs do universo salão.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_salao()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'salao'
  );
$$;

COMMENT ON FUNCTION public.is_salao() IS
  'Retorna true se o usuário autenticado tem role = salao. '
  'SECURITY DEFINER para evitar recursão RLS em profiles.';


-- ============================================================================
-- 2. FUNCTION search_customers_for_salao()
--
-- Busca clientes (role = 'user') por nome ou telefone.
-- Retorna apenas campos mínimos: id, full_name, phone, email.
-- Limite máximo de 20 resultados (hardcoded ceiling).
-- Acessível por role 'salao' e 'admin'.
--
-- Busca usa ILIKE com prefixo % para match parcial.
-- Não expõe: endereço, documento, business_type, campos de integração.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_customers_for_salao(
  p_search  text,
  p_limit   int DEFAULT 10
)
RETURNS TABLE (
  id        uuid,
  full_name text,
  phone     text,
  email     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_search   text;
  v_safe_limit int;
BEGIN
  -- Verificação de autorização: salao ou admin
  IF NOT (is_salao() OR is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado: requer role salao ou admin';
  END IF;

  -- Sanitizar entrada
  v_search := TRIM(COALESCE(p_search, ''));
  IF length(v_search) < 2 THEN
    RAISE EXCEPTION 'Busca deve ter ao menos 2 caracteres';
  END IF;

  -- Limitar resultados (ceiling de segurança)
  v_safe_limit := LEAST(GREATEST(p_limit, 1), 20);

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.phone,
      u.email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
      AND (
        p.full_name ILIKE '%' || v_search || '%'
        OR p.phone ILIKE '%' || v_search || '%'
      )
    ORDER BY p.full_name ASC
    LIMIT v_safe_limit;
END;
$$;

COMMENT ON FUNCTION public.search_customers_for_salao(text, int) IS
  'Busca clientes por nome/telefone para uso pelo operador do salão. '
  'Retorna apenas id, full_name, phone, email. Máximo 20 resultados.';

-- Revogar acesso público, conceder apenas a authenticated
REVOKE EXECUTE ON FUNCTION public.search_customers_for_salao(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_customers_for_salao(text, int) TO authenticated;


-- ============================================================================
-- 3. EXPANDIR CHECK de orders.origin para incluir 'salao'
--
-- O CHECK inline original foi criado em 20250313000009 com:
--   CHECK (origin IN ('site', 'whatsapp', 'loja_fisica', 'outro'))
--
-- PostgreSQL gera o nome do constraint automaticamente como
-- "orders_origin_check". Se por alguma razão o nome for diferente,
-- o DROP falhará silenciosamente (IF EXISTS) e o novo constraint
-- será adicionado.
-- ============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_origin_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_origin_check
  CHECK (origin IN ('site', 'whatsapp', 'loja_fisica', 'outro', 'salao'));


-- ============================================================================
-- 4. RPC create_salao_order()
--
-- Criação de pedido pelo operador do salão em nome de um cliente final.
--
-- Princípios:
--   - NÃO confia em total vindo do frontend
--   - Calcula subtotal a partir de p_items (price × quantity)
--   - total = subtotal (sem desconto nesta fase — descontos ficam para 3B)
--   - Status fixo: 'recebido' (operador não escolhe)
--   - Origin fixo: 'salao'
--   - Seller padrão resolvido server-side
--   - Data: always now() (sem retroatividade)
--
-- Parâmetros de p_items (jsonb array):
--   [{ "product_id": "uuid", "product_name": "text", "quantity": int, "price": numeric }]
--
-- Retorno: order_id (uuid)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_salao_order(
  p_user_id         uuid,          -- cliente final
  p_items           jsonb,         -- array de itens
  p_notes           text DEFAULT NULL,
  p_payment_method  text DEFAULT NULL
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

  -- ── Resolver seller padrão server-side ──────────────────────────────────
  SELECT id
    INTO v_resolved_seller_id
    FROM public.sellers
   WHERE is_default = true
     AND active     = true
   LIMIT 1;
  -- Se não houver vendedor padrão, v_resolved_seller_id = NULL (aceitável)

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
  -- NÃO confia em total vindo do frontend.
  -- Usa price do item (já validado pelo frontend contra catalog_products,
  -- mas o cálculo agregado é feito aqui).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty   := (v_item->>'quantity')::int;
    v_price := (v_item->>'price')::numeric(10,2);

    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Quantidade inválida: %', v_qty;
    END IF;
    IF v_price <= 0 THEN
      RAISE EXCEPTION 'Preço inválido: %', v_price;
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  -- total = subtotal (sem desconto nesta fase)
  -- Não há mínimo de pedido para o salão — decisão comercial diferente do site B2B

  -- ── Criar o Pedido ──────────────────────────────────────────────────────
  INSERT INTO orders (
    user_id, status, subtotal, shipping, total,
    customer_name, customer_whatsapp, customer_email,
    notes, origin, payment_method, seller_id,
    delivery_method
  ) VALUES (
    p_user_id,
    'recebido',           -- status fixo
    v_subtotal,
    0,                    -- sem frete (salão opera presencialmente)
    v_subtotal,           -- total = subtotal (sem desconto nesta fase)
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    p_notes,
    'salao',              -- origin fixo
    p_payment_method,
    v_resolved_seller_id,
    'pickup'              -- salão = retirada presencial por padrão
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

  -- ── Atualizar sessão do cliente ─────────────────────────────────────────
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_user_id, 'user_' || p_user_id::text, 'comprou')
  ON CONFLICT (user_id) DO UPDATE
    SET status     = 'comprou',
        session_id = 'user_' || EXCLUDED.user_id::text,
        updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ──────────────────────────────────────────────────────────
  -- Reutiliza 'order_created' (já no CHECK) com metadata.origin = 'salao'
  -- para manter retrocompatibilidade com automações e relatórios existentes.
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_user_id,
      'user_' || p_user_id::text,
      'order_created',
      jsonb_build_object(
        'order_id',       v_order_id,
        'amount',         v_subtotal,
        'origin',         'salao',
        'seller_id',      v_resolved_seller_id,
        'created_by',     v_salao_user_id,
        'manual',         false
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_salao_order(uuid, jsonb, text, text) IS
  'Cria pedido pelo operador do salão em nome de um cliente final. '
  'Calcula total server-side. Status fixo recebido, origin fixo salao. '
  'Resolve seller padrão automaticamente.';

-- Revogar acesso público, conceder apenas a authenticated
-- (a verificação de role = 'salao' é feita internamente)
REVOKE EXECUTE ON FUNCTION public.create_salao_order(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_salao_order(uuid, jsonb, text, text) TO authenticated;
