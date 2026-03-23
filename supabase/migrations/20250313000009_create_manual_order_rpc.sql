-- ============================================================================
-- Migration: 20250313000009_create_manual_order_rpc.sql
-- ID do Prompt: RDC_ADMIN_E5_P4_CLD_V1
-- Objetivo:
--   1. Converter orders.status de enum para text (o enum original só tinha 5 valores;
--      o sistema usa 9 na prática — aguardando_pagamento, pago, entregue, expirado, etc.)
--   2. Adicionar coluna orders.origin para rastrear a origem do pedido
--   3. Criar RPC create_manual_order() — SECURITY DEFINER, admin-only
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Converter orders.status: enum → text + CHECK constraint completa
-- Usa bloco seguro: só faz a conversão se a coluna ainda for USER-DEFINED (enum).
-- Se já for text (aplicação futura ou mudança manual no dashboard), é no-op.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'orders'
      AND column_name  = 'status'
      AND data_type    = 'USER-DEFINED'
  ) THEN
    -- Remover default para permitir a conversão
    ALTER TABLE public.orders ALTER COLUMN status DROP DEFAULT;

    -- Converter para text
    ALTER TABLE public.orders
      ALTER COLUMN status TYPE text USING status::text;

    -- Restaurar default
    ALTER TABLE public.orders
      ALTER COLUMN status SET DEFAULT 'recebido';

    -- Descartar o tipo enum (pode falhar se outros objetos o usam; ignoramos)
    DROP TYPE IF EXISTS public.order_status;
  END IF;
END $$;

-- Garantir o CHECK constraint com todos os status válidos (idempotente)
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'recebido',
    'aguardando_pagamento',
    'pago',
    'separacao',
    'enviado',
    'entregue',
    'concluido',
    'cancelado',
    'expirado'
  ));

-- ----------------------------------------------------------------------------
-- 2. Coluna origin em orders
-- Rastreia como o pedido chegou: site (checkout normal), whatsapp, loja_fisica, etc.
-- NULL = pedidos legados (origem desconhecida).
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IN ('site', 'whatsapp', 'loja_fisica', 'outro'));

COMMENT ON COLUMN public.orders.origin IS
  'Origem do pedido: site (checkout B2B), whatsapp, loja_fisica, outro. '
  'NULL em pedidos criados antes desta migration.';

-- ----------------------------------------------------------------------------
-- 3. RPC create_manual_order
-- Parâmetros:
--   p_customer_id  uuid    — id do cliente em profiles/auth.users
--   p_items        jsonb   — array de {product_id, product_name, quantity, price}
--   p_total        numeric — total calculado pelo frontend (usado como fallback)
--   p_status       text    — status inicial do pedido (ex: 'pago', 'recebido')
--   p_origin       text    — origem (ex: 'whatsapp', 'loja_fisica')
--   p_notes        text    — observação livre (opcional)
--
-- Retorno: uuid — id do pedido criado
--
-- Segurança:
--   SECURITY DEFINER: contorna RLS para inserir como admin
--   Checagem manual: só executa se auth.uid() for admin em profiles
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_customer_id  uuid,
  p_items        jsonb,
  p_total        numeric,
  p_status       text    DEFAULT 'recebido',
  p_origin       text    DEFAULT 'whatsapp',
  p_notes        text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id      uuid;
  v_order_id      uuid;
  v_item          jsonb;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_subtotal      numeric(10,2);
  v_product_name  text;
  v_product_id    uuid;
  v_qty           int;
  v_price         numeric(10,2);
  v_line_total    numeric(10,2);
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

  -- ── Calcular total a partir dos itens (override do total do frontend) ─────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty   := (v_item->>'quantity')::int;
    v_price := (v_item->>'price')::numeric(10,2);
    v_computed_total := v_computed_total + (v_qty * v_price);
  END LOOP;

  v_subtotal := v_computed_total;

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
    origin
  ) VALUES (
    p_customer_id,
    p_status,
    v_subtotal,
    0,
    v_subtotal,   -- sem frete em pedidos manuais
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    p_notes,
    p_origin
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
  -- Upsert: avança sessão para 'comprou' se ainda não estava lá.
  INSERT INTO client_sessions (user_id, session_id, status)
  VALUES (p_customer_id, 'user_' || p_customer_id::text, 'comprou')
  ON CONFLICT (session_id) DO UPDATE
    SET status     = 'comprou',
        updated_at = now()
  WHERE client_sessions.status <> 'comprou';

  -- ── Evento CRM ───────────────────────────────────────────────────────────
  -- Inserir 'purchase_completed' em crm_events (ignora erro silenciosamente
  -- para não bloquear a criação do pedido caso CRM tenha inconsistência).
  BEGIN
    INSERT INTO crm_events (user_id, session_id, event_type, metadata)
    VALUES (
      p_customer_id,
      'user_' || p_customer_id::text,
      'purchase_completed',
      jsonb_build_object(
        'order_id', v_order_id,
        'amount',   v_subtotal,
        'origin',   p_origin,
        'manual',   true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- CRM não bloqueia criação do pedido
    NULL;
  END;

  RETURN v_order_id;
END;
$$;

-- Apenas admins autenticados podem chamar
REVOKE EXECUTE ON FUNCTION public.create_manual_order FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_manual_order TO authenticated;

COMMENT ON FUNCTION public.create_manual_order IS
  'Cria um pedido manual no painel admin. '
  'Exclusivo para role=admin. Bypassa mínimo de R$500 e verificação de estoque. '
  'Registra evento purchase_completed no CRM e avança client_sessions para comprou.';
