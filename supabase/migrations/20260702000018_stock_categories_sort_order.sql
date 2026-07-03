-- ============================================================================
-- Migration: 20260702000018_stock_categories_sort_order.sql
-- Módulo de Estoque — ordem manual das categorias de estoque
--
-- Admin quer controlar em que ordem as categorias aparecem na tela de
-- contagem e na de classificação (ex: seguir a ordem física dos corredores
-- da loja) em vez de ordem alfabética.
-- ============================================================================

ALTER TABLE public.stock_categories
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.stock_categories.sort_order IS
  'Ordem manual de exibição das categorias em /estoque/contagem e '
  '/estoque/config. Reordenável pelo admin (setas cima/baixo). Categorias '
  'novas entram com 0 (aparecem primeiro até serem reordenadas).';
