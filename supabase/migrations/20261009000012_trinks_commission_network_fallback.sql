-- ============================================================================
-- Comissão estimada: fallback da REDE antes do zero
--
-- Só Linhares tem CSV de Comissões importado. Nas outras unidades a regra de
-- 20261009000010 não achava histórico nenhum (nem do profissional, nem da
-- unidade) e caía em 0% — toda comissão estimada sairia zerada quando elas
-- começassem a mandar webhook.
--
-- Passos novos, só usados quando a unidade não tem histórico próprio:
--   4. mesmo item na rede (qualquer unidade), mais recente;
--   5. mais frequente da rede para o tipo nos últimos 180 dias
--      (hoje: serviço 25%, produto 5%);
--   6. 0.
-- Os passos 1–3 não mudam: com histórico próprio, ele continua mandando.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trinks_commission_pct_guess(
  p_store_id uuid, p_professional text, p_item_name text, p_item_type text
) RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    -- 1. mesmo profissional, mesmo item, mais recente
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv' AND store_id = p_store_id
        AND professional = p_professional
        AND lower(btrim(item_name)) = lower(btrim(p_item_name))
        AND commission_pct IS NOT NULL
      ORDER BY business_date DESC LIMIT 1),
    -- 2. mesmo profissional, mesmo tipo, mais frequente nos últimos 180 dias
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv' AND store_id = p_store_id
        AND professional = p_professional AND item_type = p_item_type
        AND commission_pct IS NOT NULL
        AND business_date >= current_date - 180
      GROUP BY commission_pct ORDER BY count(*) DESC, commission_pct DESC LIMIT 1),
    -- 3. unidade, mesmo tipo, mais frequente nos últimos 180 dias
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv' AND store_id = p_store_id
        AND item_type = p_item_type
        AND commission_pct IS NOT NULL
        AND business_date >= current_date - 180
      GROUP BY commission_pct ORDER BY count(*) DESC, commission_pct DESC LIMIT 1),
    -- 4. rede, mesmo item, mais recente
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv'
        AND lower(btrim(item_name)) = lower(btrim(p_item_name))
        AND commission_pct IS NOT NULL
      ORDER BY business_date DESC LIMIT 1),
    -- 5. rede, mesmo tipo, mais frequente nos últimos 180 dias
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv'
        AND item_type = p_item_type
        AND commission_pct IS NOT NULL
        AND business_date >= current_date - 180
      GROUP BY commission_pct ORDER BY count(*) DESC, commission_pct DESC LIMIT 1),
    0)
$$;
