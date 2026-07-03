-- ============================================================================
-- Migration: 20260702000004_catalog_products_stock_module_columns.sql
-- Módulo de Estoque — Etapa 3: colunas de suporte em catalog_products
--
-- Estende catalog_products (não cria tabela paralela) com os campos
-- necessários para a conciliação de contagem física por caixas/unidades.
--
-- Retrocompatibilidade:
--   - Todas as colunas são nullable, sem DEFAULT — nenhum produto existente
--     é classificado automaticamente (ver nota abaixo).
-- ============================================================================

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS units_per_box int
    CHECK (units_per_box IS NULL OR units_per_box > 0);

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS package_type text
    CHECK (package_type IS NULL OR package_type IN ('CX', 'UND'));

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS stock_category text;

CREATE INDEX IF NOT EXISTS idx_catalog_products_stock_category
  ON public.catalog_products (stock_category)
  WHERE stock_category IS NOT NULL;

COMMENT ON COLUMN public.catalog_products.units_per_box IS
  'Unidades por caixa fechada, usado na conciliação de contagem física '
  '(stock_count_items). NULL = produto ainda não classificado — não é '
  'seguro assumir 1 (por isso não há DEFAULT). Quando package_type = UND, '
  'deve ser cadastrado como 1 explicitamente.';
COMMENT ON COLUMN public.catalog_products.package_type IS
  'CX (vendido/embalado em caixa) ou UND (unidade solta). NULL = não classificado.';
COMMENT ON COLUMN public.catalog_products.stock_category IS
  'Agrupamento de estoque físico para a tela de contagem (ex: Ativador, '
  'Shampoo, Máscara, Coloração, Material de Limpeza). Texto livre gerenciado '
  'pelo admin, sem CHECK constraint — é lista de negócio, não valor de '
  'código. Independente de categories/category_id, que serve à navegação '
  'do catálogo B2B.';
