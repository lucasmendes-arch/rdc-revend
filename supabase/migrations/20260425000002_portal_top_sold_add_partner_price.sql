-- Adiciona partner_price ao retorno de get_top_sold_products
-- para exibição no portal do parceiro (custo vs. preço de revenda)

CREATE OR REPLACE FUNCTION public.get_top_sold_products(limit_n integer DEFAULT 6)
RETURNS TABLE (
  product_name  text,
  total_qty     bigint,
  total_revenue numeric,
  product_id    uuid,
  main_image    text,
  price         numeric,
  partner_price numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    oi.product_name_snapshot                      AS product_name,
    SUM(oi.qty)::bigint                           AS total_qty,
    SUM(oi.line_total)::numeric                   AS total_revenue,
    cp.id                                         AS product_id,
    cp.main_image                                 AS main_image,
    cp.price                                      AS price,
    cp.partner_price                              AS partner_price
  FROM order_items oi
  JOIN orders o
    ON o.id = oi.order_id
   AND o.status IN ('pago', 'separacao', 'enviado', 'entregue', 'concluido')
  LEFT JOIN catalog_products cp
    ON cp.name = oi.product_name_snapshot
   AND cp.is_active = true
  GROUP BY oi.product_name_snapshot, cp.id, cp.main_image, cp.price, cp.partner_price
  ORDER BY SUM(oi.line_total) DESC
  LIMIT limit_n;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_sold_products(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_top_sold_products(integer) TO authenticated;
