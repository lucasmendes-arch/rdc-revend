-- ============================================================================
-- Migration: 20260703000002_backfill_stock_categories_color.sql
-- Módulo de Estoque — distribui cores entre categorias já existentes
--
-- Categorias criadas antes de 20260703000001 ficaram todas com
-- color_index=0 (default da coluna nova) — a atribuição cíclica só passou
-- a valer para categorias criadas DEPOIS da migration. Esta migration
-- distribui a paleta (10 cores) entre as categorias já existentes, na
-- ordem atual (sort_order, name).
-- ============================================================================

WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY sort_order, name) - 1) % 10 AS new_color_index
  FROM public.stock_categories
)
UPDATE public.stock_categories sc
SET color_index = ranked.new_color_index
FROM ranked
WHERE sc.id = ranked.id;
