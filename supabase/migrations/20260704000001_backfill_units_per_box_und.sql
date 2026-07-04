-- ============================================================================
-- Migration: 20260704000001_backfill_units_per_box_und.sql
-- Módulo de Estoque — backfill de units_per_box em itens UND
--
-- A UI de /estoque/config agora preenche units_per_box = 1 automaticamente
-- quando a embalagem selecionada é UND (item avulso — caixa de 1 é o único
-- valor coerente). Este backfill alinha os registros criados antes da regra.
-- ============================================================================

UPDATE public.catalog_products
SET units_per_box = 1
WHERE package_type = 'UND'
  AND (units_per_box IS DISTINCT FROM 1);
