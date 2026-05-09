-- =====================================================================
-- Migration: RPC get_seller_commission_summary
-- Data: 2026-05-08
-- =====================================================================
-- Retorna pedidos finalizados (pago + concluido) de um vendedor
-- num período, com totais e valor de comissão calculado.
-- Restrita a admins via is_admin().
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_seller_commission_summary(
  p_seller_id  uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller     record;
  v_orders     jsonb;
  v_count      bigint;
  v_total      numeric;
  v_commission numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id, name, code, commission_pct
    INTO v_seller
    FROM public.sellers
   WHERE id = p_seller_id
     AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendedor não encontrado ou inativo';
  END IF;

  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id',             o.id,
        'order_number',   upper(left(o.id::text, 8)),
        'created_at',     o.created_at,
        'customer_name',  o.customer_name,
        'total',          o.total,
        'status',         o.status,
        'payment_method', o.payment_method
      )
      ORDER BY o.created_at
    ),
    count(*),
    coalesce(sum(o.total), 0)
  INTO v_orders, v_count, v_total
  FROM public.orders o
  WHERE o.seller_id  = p_seller_id
    AND o.status     IN ('pago', 'concluido')
    AND o.created_at::date BETWEEN p_start_date AND p_end_date;

  v_commission := round(v_total * v_seller.commission_pct / 100.0, 2);

  RETURN jsonb_build_object(
    'seller', jsonb_build_object(
      'id',             v_seller.id,
      'name',           v_seller.name,
      'code',           v_seller.code,
      'commission_pct', v_seller.commission_pct
    ),
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date',   p_end_date
    ),
    'orders',  coalesce(v_orders, '[]'::jsonb),
    'summary', jsonb_build_object(
      'total_orders',      coalesce(v_count, 0),
      'total_value',       v_total,
      'commission_pct',    v_seller.commission_pct,
      'commission_amount', v_commission
    )
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.get_seller_commission_summary(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_commission_summary(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_seller_commission_summary(uuid, date, date) IS
  'Admin: retorna pedidos finalizados (pago + concluido) de um vendedor num período, com totais e comissão calculada.';
