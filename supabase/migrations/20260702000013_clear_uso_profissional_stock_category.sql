-- ============================================================================
-- Migration: 20260702000013_clear_uso_profissional_stock_category.sql
-- Módulo de Estoque — limpa valor órfão de stock_category
--
-- Alguns produtos tinham catalog_products.stock_category = 'Uso Profissional'
-- (herdado de quando o campo era texto livre, antes do dropdown de
-- stock_categories). Como essa categoria não existe na lista atual
-- (esvaziada em 20260702000012), o admin pediu para limpar especificamente
-- esse valor — deixando os produtos como "não classificados" até serem
-- reclassificados manualmente com uma categoria real.
-- ============================================================================

UPDATE public.catalog_products
SET stock_category = NULL
WHERE stock_category = 'Uso Profissional';
