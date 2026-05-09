-- =====================================================================
-- Migration: RPC interna + pg_cron para relatório mensal de comissão
-- Data: 2026-05-08
-- =====================================================================
-- get_seller_commission_summary_internal: mesma lógica da RPC pública,
-- sem verificação is_admin() — usada pelo cron (service role).
-- O cron dispara no dia 1 de cada mês às 11:00 UTC (08:00 BRT).
-- =====================================================================


-- ── RPC interna (sem verificação de admin) ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_seller_commission_summary_internal(
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

-- Restrita ao service_role — não exposta a usuários autenticados
REVOKE ALL    ON FUNCTION public.get_seller_commission_summary_internal(uuid, date, date) FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.get_seller_commission_summary_internal(uuid, date, date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_seller_commission_summary_internal(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.get_seller_commission_summary_internal(uuid, date, date) IS
  'Interno/cron: mesma lógica de get_seller_commission_summary sem verificação is_admin(). Acesso restrito ao service_role.';


-- ── pg_cron: dia 1 de cada mês às 11:00 UTC (08:00 BRT) ──────────────
SELECT cron.schedule(
  'monthly-commission-reports',
  '0 11 1 * *',
  $$
  SELECT net.http_post(
    url     := 'https://kjfsmwtwbreapipifjtu.supabase.co/functions/v1/cron-commission-reports',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
