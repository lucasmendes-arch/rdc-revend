-- ============================================================================
-- Produção por profissional: mesma régua do "Ranking de Profissionais" do Trinks
--
-- Até aqui revenue = valor BRUTO dos itens (antes do desconto) e o "ticket
-- médio" da tela dividia esse total (serviços + produtos) só pelo nº de
-- SERVIÇOS — numerador e denominador de bases diferentes, ticket inflado
-- (Willian: R$ 262 na tela × R$ 198 no Trinks).
--
-- Conferido contra o ranking exportado (Linhares, 01/10/2025–07/10/2026): o
-- Trinks usa valor LÍQUIDO de desconto (Yasmin: produtos 87.300,49 e total
-- 182.604,99 — idênticos) e ticket = total ÷ atendimentos. Agora:
--   revenue      = Σ (valor − desconto do cliente)
--   visits_count = atendimentos (cliente distinto por dia de atendimento)
--   ticket       = revenue ÷ visits_count (calculado na tela)
-- Rankings de serviços e produtos passam também a valor líquido, coerente com
-- o faturamento da unidade (que já é líquido).
--
-- Diferença que permanece: o dashboard agrupa pela data de PAGAMENTO (regime
-- de caixa) e o ranking do Trinks pela data de ATENDIMENTO. Em período longo
-- a diferença é de centavos a poucas centenas de reais.
-- ============================================================================

ALTER TABLE public.trinks_professional_sales
  ADD COLUMN IF NOT EXISTS visits_count int NOT NULL DEFAULT 0;

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
         count(DISTINCT (coalesce(client_name, ''), coalesce(service_date, business_date))),
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
