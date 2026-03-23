-- ============================================================================
-- Migration: 20250317000002_coupon_increment_and_timeline.sql
-- Prioridades: checkout coupon handling + customer timeline CRM
-- Objetivo:
--   1. RPC increment_coupon_usage (atomic counter for edge function)
--   2. RPC get_customer_timeline (clean timeline for admin/CRM)
--   3. Add discount_amount column to orders (persists coupon discount value)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna discount_amount em orders
--    Persiste o valor do desconto aplicado (cupom ou manual).
--    Pedidos antigos: 0 (sem desconto).
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.discount_amount IS
  'Valor do desconto aplicado (cupom percent/fixed). 0 se sem desconto.';

-- ----------------------------------------------------------------------------
-- 2. RPC increment_coupon_usage
--    Incremento atômico de used_count. Usada pela edge function create-order.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE coupons
  SET used_count = used_count + 1,
      updated_at = now()
  WHERE id = p_coupon_id;
$$;

-- Acessível por service_role (edge functions) e authenticated (admin RPCs)
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO authenticated;

COMMENT ON FUNCTION public.increment_coupon_usage IS
  'Incrementa atomicamente o used_count de um cupom. Usada por create-order edge function.';

-- ----------------------------------------------------------------------------
-- 3. RPC get_customer_timeline
--    Retorna timeline consolidada do cliente para exibição no admin/CRM.
--    Combina: crm_events + orders (como eventos de compra) + client_sessions.
--    Ordenado cronologicamente (mais recente primeiro).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_timeline(
  p_user_id uuid,
  p_limit   int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_result   jsonb;
BEGIN
  -- Verificação de admin
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: requer role admin';
  END IF;

  SELECT jsonb_build_object(
    -- Perfil básico do cliente
    'profile', (
      SELECT jsonb_build_object(
        'id',            p.id,
        'full_name',     p.full_name,
        'phone',         p.phone,
        'email',         u.email,
        'document_type', p.document_type,
        'document',      p.document,
        'business_type', p.business_type,
        'created_at',    u.created_at
      )
      FROM auth.users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = p_user_id
    ),

    -- Status atual no funil
    'session', (
      SELECT jsonb_build_object(
        'status',           cs.status,
        'cart_items_count',  cs.cart_items_count,
        'last_page',        cs.last_page,
        'updated_at',       cs.updated_at
      )
      FROM client_sessions cs
      WHERE cs.user_id = p_user_id
      LIMIT 1
    ),

    -- Tags ativas
    'tags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'slug',  t.slug,
        'name',  t.name,
        'color', t.color,
        'type',  t.type
      ) ORDER BY t.name)
      FROM crm_customer_tags ct
      JOIN crm_tags t ON t.id = ct.tag_id
      WHERE ct.user_id = p_user_id
    ), '[]'::jsonb),

    -- Timeline de eventos (crm_events)
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',         e.id,
        'type',       e.event_type,
        'metadata',   e.metadata,
        'created_at', e.created_at
      ) ORDER BY e.created_at DESC)
      FROM (
        SELECT id, event_type, metadata, created_at
        FROM crm_events
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT p_limit
      ) e
    ), '[]'::jsonb),

    -- Resumo de pedidos (mais leve que trazer tudo)
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',                 o.id,
        'status',             o.status,
        'subtotal',           o.subtotal,
        'shipping',           o.shipping,
        'discount_amount',    o.discount_amount,
        'total',              o.total,
        'delivery_method',    o.delivery_method,
        'pickup_unit_slug',   o.pickup_unit_slug,
        'pickup_unit_address',o.pickup_unit_address,
        'origin',             o.origin,
        'payment_method',     o.payment_method,
        'notes',              o.notes,
        'created_at',         o.created_at,
        'items_count',        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id),
        'items_summary',      (
          SELECT jsonb_agg(jsonb_build_object(
            'name', oi.product_name_snapshot,
            'qty',  oi.qty,
            'total', oi.line_total
          ))
          FROM order_items oi WHERE oi.order_id = o.id
        )
      ) ORDER BY o.created_at DESC)
      FROM orders o
      WHERE o.user_id = p_user_id
    ), '[]'::jsonb),

    -- Estatísticas calculadas
    'stats', jsonb_build_object(
      'total_orders',   (SELECT COUNT(*) FROM orders WHERE user_id = p_user_id),
      'total_spent',    COALESCE((SELECT SUM(total) FROM orders WHERE user_id = p_user_id AND status NOT IN ('cancelado', 'expirado')), 0),
      'first_order_at', (SELECT MIN(created_at) FROM orders WHERE user_id = p_user_id),
      'last_order_at',  (SELECT MAX(created_at) FROM orders WHERE user_id = p_user_id),
      'total_events',   (SELECT COUNT(*) FROM crm_events WHERE user_id = p_user_id)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_timeline(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_customer_timeline(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_customer_timeline IS
  'Retorna timeline consolidada do cliente para o admin/CRM. '
  'Inclui: perfil, sessão, tags, eventos cronológicos, pedidos com itens e estatísticas.';
