-- ============================================================================
-- Migration: 20260702000006_store_stock_targets.sql
-- Módulo de Estoque — Etapa 5: store_stock_targets
--
-- Estoque mínimo/ideal por produto x loja, usado pela conciliação
-- (confirm_stock_count) para decidir se deve gerar pedido de reposição.
--
-- Retrocompatibilidade: tabela nova, nenhum dado existente afetado.
-- Sem seed — cadastro de metas é responsabilidade do admin (dado de
-- negócio puro, fora do escopo desta migration).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_stock_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  target_quantity int NOT NULL DEFAULT 0 CHECK (target_quantity >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_stock_targets_store
  ON public.store_stock_targets (store_id);

COMMENT ON TABLE public.store_stock_targets IS
  'Quantidade ideal (em unidades) de um produto em uma loja. Usada por '
  'confirm_stock_count() para decidir se gera replenishment_orders.';

ALTER TABLE public.store_stock_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_stock_targets_admin_all" ON public.store_stock_targets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Colaborador só vê a meta da própria loja (não edita — cadastro é admin-only).
CREATE POLICY "store_stock_targets_estoque_read_own_store" ON public.store_stock_targets
  FOR SELECT TO authenticated
  USING (public.is_estoque() AND store_id = public.my_store_id());
