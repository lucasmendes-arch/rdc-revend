-- ============================================================================
-- Migration: 20260702000011_stock_categories_table.sql
-- Módulo de Estoque — Etapa 10: tabela stock_categories (lookup)
--
-- catalog_products.stock_category continua sendo texto livre, sem FK (ver
-- 20260702000004 — é lista de negócio, não valor de código). Esta tabela
-- serve só para alimentar o dropdown da tela /estoque/config, permitindo ao
-- admin cadastrar novas categorias pela UI sem depender de migration.
-- Não há FK entre catalog_products.stock_category e stock_categories.name —
-- mesmo padrão de "lista de opções desacoplada" já usado no projeto.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_categories IS
  'Lista de categorias de estoque físico disponíveis (Ativador, Shampoo, ...), '
  'gerenciada pelo admin em /estoque/config. Alimenta o dropdown de '
  'catalog_products.stock_category (texto livre, sem FK).';

ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_categories_admin_all" ON public.stock_categories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed com as categorias já citadas no briefing original do módulo.
INSERT INTO public.stock_categories (name) VALUES
  ('Ativador'), ('Shampoo'), ('Máscara'), ('Coloração'), ('Material de Limpeza')
ON CONFLICT (name) DO NOTHING;
