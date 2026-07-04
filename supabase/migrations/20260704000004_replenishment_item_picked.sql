-- ============================================================================
-- Migration: 20260704000004_replenishment_item_picked.sql
-- Módulo de Estoque — checklist de separação por item
--
-- Na coluna "Em separação" do kanban, o separador marca item a item o que
-- já foi separado. picked_at persiste o progresso (sobrevive a reload e
-- vale pra qualquer pessoa da central que abrir o pedido).
-- ============================================================================

ALTER TABLE public.replenishment_request_items
  ADD COLUMN IF NOT EXISTS picked_at timestamptz;

COMMENT ON COLUMN public.replenishment_request_items.picked_at IS
  'Momento em que o item foi marcado como separado no checklist do kanban. '
  'NULL = ainda não separado. Só editável enquanto o pedido está em picking.';

CREATE OR REPLACE FUNCTION public.set_replenishment_item_picked(
  p_item_id uuid,
  p_picked  boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid;
  v_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Admin ou colaborador de estoque da loja central (quem separa).
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

  SELECT r.status INTO v_status
  FROM public.replenishment_request_items i
  JOIN public.replenishment_requests r ON r.id = i.request_id
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de reposição não encontrado: %', p_item_id;
  END IF;

  IF v_status <> 'picking' THEN
    RAISE EXCEPTION 'Checklist só pode ser editado com o pedido em separação (status atual: %)', v_status;
  END IF;

  UPDATE public.replenishment_request_items
  SET picked_at = CASE WHEN p_picked THEN now() ELSE NULL END
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.set_replenishment_item_picked(uuid, boolean) IS
  'Marca/desmarca um item do pedido de reposição como separado (checklist do '
  'kanban). Só com o pedido em picking. Admin ou estoque da loja central.';

REVOKE EXECUTE ON FUNCTION public.set_replenishment_item_picked(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_replenishment_item_picked(uuid, boolean) TO authenticated;
