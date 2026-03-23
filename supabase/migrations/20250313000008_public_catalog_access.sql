-- ============================================================================
-- Migration: 20250313000008_public_catalog_access.sql
-- ID do Prompt: RDC_BACK_E5_P1_CLD_V1
-- Objetivo:
--   1. Garantir acesso anônimo a catalog_products (RLS já permite, GRANT explícito)
--   2. Abrir categories para anon (estava restrito a authenticated)
--   3. Criar VIEW pública catalog_products_public (proteção para colunas futuras sensíveis)
--   4. Adicionar price_category em profiles para tabela de preços por categoria
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. GRANT explícito de SELECT ao papel anon em catalog_products
-- A policy "anyone_read_active" já usa USING (is_active = true) sem checar role,
-- mas o GRANT garante que o Supabase PostgREST não rejeite antes mesmo da RLS.
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.catalog_products TO anon;

-- ----------------------------------------------------------------------------
-- 2. Abrir categories para leitura anônima
-- O frontend público precisará exibir os nomes das categorias junto aos produtos.
-- Mantemos a policy de escrita restrita a authenticated.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_read_categories" ON public.categories;

CREATE POLICY "anyone_read_categories" ON public.categories
  FOR SELECT USING (true);

GRANT SELECT ON public.categories TO anon;

-- ----------------------------------------------------------------------------
-- 3. VIEW pública do catálogo
-- Expõe somente colunas seguras. Colunas internas futuras (cost_price, margin,
-- supplier_code etc.) adicionadas à tabela NÃO aparecerão aqui automaticamente.
-- security_invoker = true: a view respeita o contexto RLS do chamador.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.catalog_products_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  description_html,
  price,
  compare_at_price,
  images,
  main_image,
  is_highlight,
  category_id,
  category_type,
  created_at,
  updated_at
FROM public.catalog_products
WHERE is_active = true;

COMMENT ON VIEW public.catalog_products_public IS
  'Projeção segura de catalog_products para uso público/anon. '
  'Omite colunas internas (nuvemshop_product_id, source, updated_from_source_at). '
  'Adicionar novas colunas sensíveis à tabela base NÃO as expõe automaticamente aqui.';

GRANT SELECT ON public.catalog_products_public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. price_category em profiles
-- Permite calcular preço dinâmico: product.price * multiplier no checkout.
-- Valores definidos agora; novos tiers exigem ALTER CHECK constraint.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS price_category TEXT NOT NULL DEFAULT 'retail'
  CONSTRAINT profiles_price_category_check
    CHECK (price_category IN ('retail', 'wholesale', 'vip'));

COMMENT ON COLUMN public.profiles.price_category IS
  'Categoria de preço do cliente B2B: '
  'retail = padrão (sem desconto adicional), '
  'wholesale = atacado (desconto moderado), '
  'vip = cliente estratégico (melhor preço). '
  'Multiplicador de preço aplicado no checkout via edge function create-order.';
