-- ============================================================================
-- Migration: 20260707000001_wrap_rls_functions_initplan.sql
-- Checkup 2026-07 — Etapa 0, item 9: embrulhar chamadas de função em
-- policies RLS com (SELECT ...) para o Postgres avaliá-las uma vez por
-- query (InitPlan) em vez de potencialmente uma vez por linha.
--
-- Padrão recomendado pelo Supabase para funções STABLE em policies:
--   USING (public.is_admin())          → reavaliável por linha
--   USING ((SELECT public.is_admin())) → InitPlan, avaliada 1x por query
--
-- Escopo: todas as policies do módulo de estoque (tabelas de 2026-07),
-- onde ocorrem os scans com mais linhas (stock_count_items). Nenhuma
-- expressão muda de semântica — só a forma de avaliação. ALTER POLICY
-- preserva nome, comando e roles de cada policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. stores (20260702000003)
-- ----------------------------------------------------------------------------
ALTER POLICY "stores_admin_all" ON public.stores
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "stores_estoque_read" ON public.stores
  USING ((SELECT public.is_estoque()));

-- ----------------------------------------------------------------------------
-- 2. stock_counts (20260702000005)
-- ----------------------------------------------------------------------------
ALTER POLICY "stock_counts_admin_all" ON public.stock_counts
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "stock_counts_estoque_select" ON public.stock_counts
  USING ((SELECT public.is_estoque()) AND store_id = (SELECT public.my_store_id()));

ALTER POLICY "stock_counts_estoque_insert" ON public.stock_counts
  WITH CHECK (
    (SELECT public.is_estoque()) AND store_id = (SELECT public.my_store_id()) AND status = 'draft'
  );

ALTER POLICY "stock_counts_estoque_update" ON public.stock_counts
  USING ((SELECT public.is_estoque()) AND store_id = (SELECT public.my_store_id()) AND status = 'draft')
  WITH CHECK ((SELECT public.is_estoque()) AND store_id = (SELECT public.my_store_id()) AND status = 'draft');

-- ----------------------------------------------------------------------------
-- 3. stock_count_items (20260702000005)
-- ----------------------------------------------------------------------------
ALTER POLICY "stock_count_items_admin_all" ON public.stock_count_items
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "stock_count_items_estoque_select" ON public.stock_count_items
  USING (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = (SELECT public.my_store_id())
    )
  );

ALTER POLICY "stock_count_items_estoque_insert" ON public.stock_count_items
  WITH CHECK (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = (SELECT public.my_store_id())
        AND sc.status = 'draft'
    )
  );

ALTER POLICY "stock_count_items_estoque_update" ON public.stock_count_items
  USING (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = (SELECT public.my_store_id())
        AND sc.status = 'draft'
    )
  )
  WITH CHECK (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = (SELECT public.my_store_id())
        AND sc.status = 'draft'
    )
  );

ALTER POLICY "stock_count_items_estoque_delete" ON public.stock_count_items
  USING (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = (SELECT public.my_store_id())
        AND sc.status = 'draft'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. store_stock_targets (20260702000006)
-- ----------------------------------------------------------------------------
ALTER POLICY "store_stock_targets_admin_all" ON public.store_stock_targets
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "store_stock_targets_estoque_read_own_store" ON public.store_stock_targets
  USING ((SELECT public.is_estoque()) AND store_id = (SELECT public.my_store_id()));

-- ----------------------------------------------------------------------------
-- 5. stock_categories (20260702000011 + 20260703000003)
-- ----------------------------------------------------------------------------
ALTER POLICY "stock_categories_admin_all" ON public.stock_categories
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "stock_categories_estoque_select" ON public.stock_categories
  USING ((SELECT public.is_estoque()));

-- ----------------------------------------------------------------------------
-- 6. replenishment_orders (20260702000007 — legada, RLS ainda ativa)
-- ----------------------------------------------------------------------------
ALTER POLICY "replenishment_orders_admin_all" ON public.replenishment_orders
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "replenishment_orders_estoque_own_store" ON public.replenishment_orders
  USING ((SELECT public.is_estoque()) AND destination_store_id = (SELECT public.my_store_id()));

ALTER POLICY "replenishment_orders_estoque_central_read" ON public.replenishment_orders
  USING (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = (SELECT public.my_store_id()) AND type = 'central'
    )
  );

-- ----------------------------------------------------------------------------
-- 7. replenishment_requests + replenishment_request_items (20260704000003)
-- ----------------------------------------------------------------------------
ALTER POLICY "replenishment_requests_admin_all" ON public.replenishment_requests
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "replenishment_requests_estoque_own_store" ON public.replenishment_requests
  USING ((SELECT public.is_estoque()) AND destination_store_id = (SELECT public.my_store_id()));

ALTER POLICY "replenishment_requests_estoque_central_read" ON public.replenishment_requests
  USING (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = (SELECT public.my_store_id()) AND type = 'central'
    )
  );

ALTER POLICY "replenishment_request_items_admin_all" ON public.replenishment_request_items
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "replenishment_request_items_estoque_read" ON public.replenishment_request_items
  USING (
    (SELECT public.is_estoque()) AND EXISTS (
      SELECT 1 FROM public.replenishment_requests r
      WHERE r.id = request_id
        AND (
          r.destination_store_id = (SELECT public.my_store_id())
          OR EXISTS (
            SELECT 1 FROM public.stores
            WHERE id = (SELECT public.my_store_id()) AND type = 'central'
          )
        )
    )
  );
