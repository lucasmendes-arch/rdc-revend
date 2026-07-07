-- ============================================================================
-- Migration: 20260707000003_fix_current_store_stock_last_declared.sql
-- Módulo de Estoque — corrige get_current_store_stock
--
-- Bug: a versão anterior buscava a ÚLTIMA stock_count CONFIRMADA da loja (uma
-- contagem inteira) e só olhava os itens dela. Como confirm_stock_count não
-- exige contar 100% do sortimento, uma contagem mais recente pode não tocar
-- em um produto que foi declarado (inclusive Zerado) numa contagem anterior
-- — o produto some da RPC e a tela mostra "—" (não contado), quando na
-- verdade ele TEM uma última declaração conhecida, só que em uma contagem
-- mais antiga.
--
-- Fix: em vez de fixar "a última contagem" e pegar os itens dela, busca a
-- última DECLARAÇÃO por produto (DISTINCT ON store+produto, ordenado por
-- confirmed_at da contagem em que ela apareceu) entre todas as contagens
-- confirmadas da loja. "—" passa a significar só "nunca foi declarado em
-- nenhuma contagem confirmada desta loja".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_store_stock(p_store_id uuid DEFAULT NULL)
RETURNS TABLE (
  store_id        uuid,
  store_name      text,
  store_type      text,
  product_id      uuid,
  product_name    text,
  stock_category  text,
  total_units     int,
  target_quantity int,
  confirmed_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_store_id IS NOT NULL THEN
    IF NOT (
      public.is_admin()
      OR (public.is_estoque() AND p_store_id = public.my_store_id())
    ) THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  ELSE
    -- Consolidado (todas as lojas) é admin-only.
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Acesso negado: visão consolidada de todas as lojas é admin-only';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (s.id, cp.id)
    s.id,
    s.name,
    s.type,
    cp.id,
    cp.name,
    cp.stock_category,
    sci.total_units,
    sst.target_quantity,
    sc.confirmed_at
  FROM public.stores s
  JOIN public.stock_counts sc ON sc.store_id = s.id AND sc.status = 'confirmed'
  JOIN public.stock_count_items sci ON sci.stock_count_id = sc.id
  JOIN public.catalog_products cp ON cp.id = sci.product_id
  LEFT JOIN public.store_stock_targets sst ON sst.product_id = cp.id AND sst.store_id = s.id
  WHERE (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.id, cp.id, sc.confirmed_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_current_store_stock(uuid) IS
  'Retorna o estoque atual conhecido por loja x produto: a última declaração '
  '(total_units) de cada produto entre TODAS as contagens confirmadas da '
  'loja, não só a última contagem inteira — evita que um item zerado numa '
  'contagem antiga suma por não ter sido retocado na contagem mais recente. '
  'Cruzado com a meta de store_stock_targets. p_store_id = NULL retorna '
  'todas as lojas (admin-only, visão consolidada); p_store_id específico é '
  'acessível por admin ou pelo colaborador daquela loja.';
