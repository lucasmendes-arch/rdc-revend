-- ============================================================================
-- Migration: 20260704000006_clear_test_counts_and_orders.sql
-- Módulo de Estoque — limpeza dos dados de teste (2026-07-04)
--
-- Contagens e pedidos de reposição criados durante o desenvolvimento/teste
-- do módulo. Solicitado pelo humano antes de começar o uso real.
--   - replenishment_requests: itens caem em cascata
--   - replenishment_orders (legada): histórico de teste, some junto
--   - stock_counts: stock_count_items caem em cascata
-- Nada aqui toca em catalog_products, metas (store_stock_targets),
-- categorias ou inventory.
-- ============================================================================

DELETE FROM public.replenishment_requests;
DELETE FROM public.replenishment_orders;
DELETE FROM public.stock_counts;
