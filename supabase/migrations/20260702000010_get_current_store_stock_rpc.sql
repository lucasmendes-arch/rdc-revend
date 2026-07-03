-- ============================================================================
-- Migration: 20260702000010_get_current_store_stock_rpc.sql
-- Módulo de Estoque — Etapa 9: RPC get_current_store_stock
--
-- Calcula o "estoque atual conhecido" de cada loja: os total_units da última
-- stock_count CONFIRMADA daquela loja, cruzados com a meta (store_stock_targets).
-- Usado pelas telas de relatório/consolidado e pelo relatório por loja.
--
-- Não lê nem escreve em `inventory` — é um cálculo derivado apenas das
-- tabelas do módulo de estoque (stock_counts/stock_count_items), a partir da
-- contagem física confirmada mais recente de cada loja.
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
  SELECT
    s.id,
    s.name,
    s.type,
    cp.id,
    cp.name,
    cp.stock_category,
    sci.total_units,
    sst.target_quantity,
    latest.confirmed_at
  FROM public.stores s
  JOIN LATERAL (
    SELECT sc.id, sc.confirmed_at
    FROM public.stock_counts sc
    WHERE sc.store_id = s.id AND sc.status = 'confirmed'
    ORDER BY sc.confirmed_at DESC
    LIMIT 1
  ) latest ON true
  JOIN public.stock_count_items sci ON sci.stock_count_id = latest.id
  JOIN public.catalog_products cp ON cp.id = sci.product_id
  LEFT JOIN public.store_stock_targets sst ON sst.product_id = cp.id AND sst.store_id = s.id
  WHERE (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.name, cp.name;
END;
$$;

COMMENT ON FUNCTION public.get_current_store_stock(uuid) IS
  'Retorna o estoque atual conhecido (última stock_count confirmada) por loja '
  'x produto, cruzado com a meta de store_stock_targets. p_store_id = NULL '
  'retorna todas as lojas (admin-only, visão consolidada); p_store_id '
  'específico é acessível por admin ou pelo colaborador daquela loja.';

REVOKE EXECUTE ON FUNCTION public.get_current_store_stock(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_current_store_stock(uuid) TO authenticated;
