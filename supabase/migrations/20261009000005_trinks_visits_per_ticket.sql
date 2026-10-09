-- ============================================================================
-- Atendimentos por profissional = COMANDAS, como o Trinks conta
--
-- 20261009000004 contava cliente distinto por dia. Conferido contra o
-- "Ranking de Profissionais" exportado (Linhares, 01/10/2025–07/10/2026), o
-- Trinks conta um atendimento por comanda: cliente + dia do atendimento +
-- momento do pagamento. Com essa regra os números batem exatamente
-- (Rei dos Cachos 273, Ray 578, Willian 1.131, Yasmin 1.111) — e o ticket
-- médio da tela passa a ser o mesmo do ranking.
-- ============================================================================

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
    services_count, visits_count, revenue, commission, synced_at
  )
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(professional)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(professional)),
         count(*) FILTER (WHERE item_type = 'servico'),
         count(DISTINCT (coalesce(client_name, ''), coalesce(service_date, business_date), paid_at)),
         sum(value - client_discount), sum(commission_value), now()
    FROM _trinks_items
   WHERE coalesce(btrim(professional), '') <> ''
   GROUP BY 1, 2, 3;
END;
$$;

-- Recalcula os períodos de comissões já importados com a régua nova.
DO $$
DECLARE i record;
BEGIN
  FOR i IN SELECT store_id, period_start, period_end FROM trinks_imports WHERE report_type = 'comissoes' LOOP
    PERFORM trinks_rebuild_sales(i.store_id, i.period_start, i.period_end);
  END LOOP;
END $$;
