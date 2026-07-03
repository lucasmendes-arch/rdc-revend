-- ============================================================================
-- Migration: 20260702000009_replenishment_order_status_rpc.sql
-- Módulo de Estoque — Etapa 8: RPC update_replenishment_order_status
--
-- Avança o status de um pedido de reposição (separação em Linhares).
-- Transições permitidas: open -> picking, open|picking -> shipped.
-- shipped é terminal (não pode ser alterado depois).
--
-- Sem policy de UPDATE direta para is_estoque() em replenishment_orders
-- (20260702000007) — toda mutação passa por esta RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_replenishment_order_status(
  p_order_id          uuid,
  p_new_status        text,
  p_shipped_quantity  int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid;
  v_order record;
BEGIN
  -- ── Autenticação ──────────────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- ── Buscar pedido ─────────────────────────────────────────────────────────
  SELECT * INTO v_order FROM public.replenishment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de reposição não encontrado: %', p_order_id;
  END IF;

  -- ── Autorização: admin ou colaborador de estoque da loja central ────────
  IF NOT (
    public.is_admin()
    OR (
      public.is_estoque() AND EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = public.my_store_id() AND type = 'central'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe de separação (loja central) ou admin';
  END IF;

  -- ── Terminal: pedido já enviado não pode ser alterado ────────────────────
  IF v_order.status = 'shipped' THEN
    RAISE EXCEPTION 'Pedido já foi enviado, não pode ser alterado';
  END IF;

  -- ── Transições ────────────────────────────────────────────────────────────
  IF p_new_status = 'picking' THEN
    IF v_order.status <> 'open' THEN
      RAISE EXCEPTION 'Transição inválida: pedido não está aberto (status atual: %)', v_order.status;
    END IF;

    UPDATE public.replenishment_orders
    SET status = 'picking', picked_by = v_uid
    WHERE id = p_order_id;

  ELSIF p_new_status = 'shipped' THEN
    IF p_shipped_quantity IS NULL OR p_shipped_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade enviada inválida: %', p_shipped_quantity;
    END IF;

    UPDATE public.replenishment_orders
    SET status = 'shipped',
        shipped_quantity = p_shipped_quantity,
        shipped_at = now(),
        picked_by = COALESCE(picked_by, v_uid)
    WHERE id = p_order_id;

  ELSE
    RAISE EXCEPTION 'Status inválido: %', p_new_status;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_replenishment_order_status(uuid, text, int) IS
  'Avança o status de um pedido de reposição: open->picking, open|picking->shipped. '
  'shipped é terminal. Acessível por: authenticated (admin ou estoque da loja '
  'central, verificado internamente).';

REVOKE EXECUTE ON FUNCTION public.update_replenishment_order_status(uuid, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_replenishment_order_status(uuid, text, int) TO authenticated;
