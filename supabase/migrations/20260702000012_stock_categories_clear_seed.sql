-- ============================================================================
-- Migration: 20260702000012_stock_categories_clear_seed.sql
-- Módulo de Estoque — remove o seed inicial de stock_categories
--
-- O admin prefere cadastrar as categorias do zero pela UI (/estoque/config)
-- em vez de usar a lista sugerida em 20260702000011. Sem FK apontando para
-- stock_categories (catalog_products.stock_category é texto livre), então
-- limpar esta tabela não afeta produtos já classificados.
-- ============================================================================

DELETE FROM public.stock_categories;
