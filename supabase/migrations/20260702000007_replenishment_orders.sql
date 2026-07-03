-- ============================================================================
-- Migration: 20260702000007_replenishment_orders.sql
-- Módulo de Estoque — Etapa 6: replenishment_orders
--
-- Pedido de reposição gerado automaticamente pela conciliação de uma
-- contagem confirmada (confirm_stock_count), processado pela equipe de
-- separação da loja central (Linhares) até o envio.
--
-- Retrocompatibilidade: tabela nova, nenhum dado existente afetado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.replenishment_orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id             uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE RESTRICT,
  destination_store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  source_stock_count_id  uuid REFERENCES public.stock_counts(id) ON DELETE SET NULL,
  suggested_quantity     int NOT NULL CHECK (suggested_quantity > 0),
  shipped_quantity       int CHECK (shipped_quantity IS NULL OR shipped_quantity >= 0),
  status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picking', 'shipped')),
  generated_at           timestamptz NOT NULL DEFAULT now(),
  picked_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shipped_at             timestamptz
);

-- Só um pedido "open" por produto+loja de destino ao mesmo tempo. Uma nova
-- contagem confirmada faz UPSERT nesse pedido (substitui, não soma — a
-- contagem física mais recente é sempre a verdade). Pedidos já em
-- picking/shipped não são tocados por uma nova contagem — surge um novo
-- "open" ao lado. Ver D-20 em docs/decisions.md.
CREATE UNIQUE INDEX IF NOT EXISTS uq_replenishment_orders_open_product_store
  ON public.replenishment_orders (product_id, destination_store_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_replenishment_orders_status
  ON public.replenishment_orders (status);

CREATE INDEX IF NOT EXISTS idx_replenishment_orders_destination
  ON public.replenishment_orders (destination_store_id, status);

COMMENT ON COLUMN public.replenishment_orders.source_stock_count_id IS
  'Contagem que originou/atualizou este pedido (rastreabilidade/debug). '
  'NULL se o pedido foi ajustado manualmente fora do fluxo de conciliação.';

ALTER TABLE public.replenishment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replenishment_orders_admin_all" ON public.replenishment_orders
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Colaborador de loja satélite só vê pedidos com destino à própria loja.
CREATE POLICY "replenishment_orders_estoque_own_store" ON public.replenishment_orders
  FOR SELECT TO authenticated
  USING (public.is_estoque() AND destination_store_id = public.my_store_id());

-- Exceção: colaborador da loja central (Linhares) vê pedidos com destino a
-- QUALQUER loja — é quem separa e despacha para as satélites, e perde a
-- função se não enxergar os pedidos alheios. Ver D-20 em docs/decisions.md.
CREATE POLICY "replenishment_orders_estoque_central_read" ON public.replenishment_orders
  FOR SELECT TO authenticated
  USING (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = public.my_store_id() AND type = 'central'
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para is_estoque(): toda escrita de
-- negócio passa pelas RPCs SECURITY DEFINER confirm_stock_count() e
-- update_replenishment_order_status(), seguindo o precedente do projeto de
-- RPC explícita para mutação de estoque (decrement_stock, restore_order_stock).
