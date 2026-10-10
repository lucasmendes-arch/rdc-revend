-- ============================================================================
-- Produção por profissional: faturamento de serviços e de produtos separados
--
-- trinks_professional_sales.revenue soma tudo que o profissional vendeu. A
-- tela de Unidades passa a mostrar também quanto disso veio de serviços
-- (servico + pacote, mesma régua do "Top serviços") e quanto de produtos.
-- revenue continua = services_revenue + products_revenue.
-- ============================================================================

ALTER TABLE public.trinks_professional_sales
  ADD COLUMN IF NOT EXISTS services_revenue numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS products_revenue numeric(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.trinks_rebuild_sales(
  p_store_id uuid, p_from date, p_to date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_csv date := trinks_csv_covered_through(p_store_id, 'comissoes');
BEGIN
  DELETE FROM trinks_service_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;
  DELETE FROM trinks_product_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;
  DELETE FROM trinks_professional_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;

  CREATE TEMP TABLE IF NOT EXISTS _trinks_items ON COMMIT DROP AS
    SELECT * FROM trinks_sale_items WITH NO DATA;
  TRUNCATE _trinks_items;
  INSERT INTO _trinks_items
  SELECT * FROM trinks_sale_items
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to
     AND (source = 'csv' OR business_date > v_csv);

  INSERT INTO trinks_service_sales (store_id, business_date, item_key, name, qty, revenue, synced_at)
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(item_name)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(item_name)), count(*), sum(value - client_discount), now()
    FROM _trinks_items WHERE item_type IN ('servico', 'pacote')
   GROUP BY 1, 2, 3;

  INSERT INTO trinks_product_sales (store_id, business_date, item_key, name, qty, revenue, synced_at)
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(item_name)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(item_name)), count(*), sum(value - client_discount), now()
    FROM _trinks_items WHERE item_type = 'produto'
   GROUP BY 1, 2, 3;

  INSERT INTO trinks_professional_sales (
    store_id, business_date, professional_key, professional_name,
    services_count, visits_count, revenue, services_revenue, products_revenue,
    commission, synced_at
  )
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(professional)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(professional)),
         count(*) FILTER (WHERE item_type = 'servico'),
         count(DISTINCT (coalesce(client_name, ''), coalesce(service_date, business_date), paid_at)),
         sum(value - client_discount),
         coalesce(sum(value - client_discount) FILTER (WHERE item_type IN ('servico', 'pacote')), 0),
         coalesce(sum(value - client_discount) FILTER (WHERE item_type = 'produto'), 0),
         sum(commission_value), now()
    FROM _trinks_items
   WHERE coalesce(btrim(professional), '') <> ''
   GROUP BY 1, 2, 3;
END;
$$;

-- Backfill só das colunas novas, com a mesma régua do rebuild. Não reconstrói
-- (rebuild apaga o período inteiro e poderia levar linhas do sync antigo).
WITH agg AS (
  SELECT s.store_id, s.business_date,
         left(regexp_replace(lower(btrim(s.professional)), '[^a-z0-9]+', '-', 'g'), 120) AS professional_key,
         coalesce(sum(s.value - s.client_discount) FILTER (WHERE s.item_type IN ('servico', 'pacote')), 0) AS svc,
         coalesce(sum(s.value - s.client_discount) FILTER (WHERE s.item_type = 'produto'), 0) AS prd
    FROM trinks_sale_items s
   WHERE coalesce(btrim(s.professional), '') <> ''
     AND (s.source = 'csv' OR s.business_date > trinks_csv_covered_through(s.store_id, 'comissoes'))
   GROUP BY 1, 2, 3
)
UPDATE trinks_professional_sales p
   SET services_revenue = agg.svc,
       products_revenue = agg.prd
  FROM agg
 WHERE p.store_id = agg.store_id
   AND p.business_date = agg.business_date
   AND p.professional_key = agg.professional_key;
