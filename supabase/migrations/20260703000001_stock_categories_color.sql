-- ============================================================================
-- Migration: 20260703000001_stock_categories_color.sql
-- Módulo de Estoque — cor pastel por categoria
--
-- Cada categoria ganha uma cor (índice numa paleta pastel fixa, definida no
-- frontend — ver src/lib/stockCategoryColors.ts) pra facilitar identificação
-- visual rápida na tela de contagem. Atribuída automaticamente na criação
-- (cicla pela paleta), editável depois via swatches em /estoque/config.
-- ============================================================================

ALTER TABLE public.stock_categories
  ADD COLUMN IF NOT EXISTS color_index int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.stock_categories.color_index IS
  'Índice na paleta pastel fixa (src/lib/stockCategoryColors.ts) usada para '
  'colorir a categoria na tela de contagem e classificação. Atribuído '
  'automaticamente (cíclico) na criação, editável via swatches na UI.';
