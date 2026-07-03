-- ============================================================================
-- Migration: 20260702000017_stock_only_products_and_view.sql
-- Módulo de Estoque — separa a lista de contagem física do catálogo B2B
--
-- Contexto: a lista de produtos contados fisicamente nas lojas NÃO é a
-- mesma lista de produtos vendidos no atacado:
--   1. Produtos "kit" (registrados em kit_components) não devem ser
--      contados como item único — fisicamente não existe "o kit" na
--      prateleira, existem os componentes que o compõem, contados
--      separadamente.
--   2. Existem itens que só interessam à contagem física da loja (ex:
--      material de limpeza) e nunca devem aparecer no catálogo de venda
--      do atacado.
--
-- Implementa:
--   1. catalog_products.stock_only — marca um produto como existente só
--      para contagem, nunca à venda. CHECK garante que nunca é
--      simultaneamente is_active=true (nunca aparece na loja/catálogo).
--   2. View stock_countable_products — produtos elegíveis para a tela de
--      contagem e para a tela de classificação (/estoque/config): ativos
--      no catálogo OU stock_only, excluindo qualquer produto que seja um
--      kit (aparece como kit_product_id em kit_components).
-- ============================================================================

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS stock_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_stock_only_not_active;

ALTER TABLE public.catalog_products
  ADD CONSTRAINT catalog_products_stock_only_not_active
  CHECK (NOT (stock_only AND is_active));

COMMENT ON COLUMN public.catalog_products.stock_only IS
  'true = produto existe só para contagem física de estoque (ex: material '
  'de limpeza), nunca à venda no atacado. CHECK garante is_active=false '
  'sempre que stock_only=true. Distinto de kit (kit_components) — kit '
  'também não entra na contagem, mas por não ser um item físico próprio '
  '(é composto por outros produtos, contados separadamente).';

CREATE INDEX IF NOT EXISTS idx_catalog_products_stock_only
  ON public.catalog_products (stock_only) WHERE stock_only = true;

CREATE OR REPLACE VIEW public.stock_countable_products AS
SELECT cp.*
FROM public.catalog_products cp
WHERE (cp.is_active = true OR cp.stock_only = true)
  AND NOT EXISTS (
    SELECT 1 FROM public.kit_components kc WHERE kc.kit_product_id = cp.id
  );

COMMENT ON VIEW public.stock_countable_products IS
  'Produtos elegíveis para o módulo de estoque (contagem física e '
  'classificação em /estoque/config): ativos no catálogo B2B OU '
  'stock_only, SEMPRE excluindo kits (kit_components.kit_product_id). '
  'Usar esta view em vez de catalog_products diretamente nas telas de '
  'contagem/classificação.';
