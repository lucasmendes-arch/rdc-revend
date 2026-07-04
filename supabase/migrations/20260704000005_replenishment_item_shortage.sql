-- ============================================================================
-- Migration: 20260704000005_replenishment_item_shortage.sql
-- Módulo de Estoque — declarar falta/quantidade parcial durante a separação
--
-- Durante o picking, o separador pode declarar que um item vai com MENOS
-- unidades do que o sugerido (estoque parcial) ou que está EM FALTA (0).
-- A declaração é gravada em shipped_quantity — o passo "Confirmar envio"
-- pré-preenche com esse valor, então o registro final já nasce coerente.
-- Declarar também marca o item como separado (picked_at): a pendência
-- daquele item foi resolvida, mesmo que a resposta seja "não tem".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_replenishment_item_shipped_qty(
  p_item_id           uuid,
  p_shipped_quantity  int DEFAULT NULL  -- NULL = limpar a declaração
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid;
  v_item   record;
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

  SELECT i.id, i.suggested_quantity, r.status INTO v_item
  FROM public.replenishment_request_items i
  JOIN public.replenishment_requests r ON r.id = i.request_id
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de reposição não encontrado: %', p_item_id;
  END IF;

  IF v_item.status <> 'picking' THEN
    RAISE EXCEPTION 'Declaração só pode ser feita com o pedido em separação (status atual: %)', v_item.status;
  END IF;

  IF p_shipped_quantity IS NULL THEN
    -- Limpar declaração: volta ao padrão (envio assume o sugerido).
    UPDATE public.replenishment_request_items
    SET shipped_quantity = NULL
    WHERE id = p_item_id;
    RETURN;
  END IF;

  IF p_shipped_quantity < 0 OR p_shipped_quantity > v_item.suggested_quantity THEN
    RAISE EXCEPTION 'Quantidade declarada inválida: % (deve estar entre 0 e o sugerido %)',
      p_shipped_quantity, v_item.suggested_quantity;
  END IF;

  UPDATE public.replenishment_request_items
  SET shipped_quantity = p_shipped_quantity,
      picked_at = COALESCE(picked_at, now())
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.set_replenishment_item_shipped_qty(uuid, int) IS
  'Declara, durante o picking, quantas unidades do item realmente vão no envio '
  '(0 = produto em falta; NULL = limpa a declaração). Marca o item como '
  'separado. Admin ou estoque da loja central.';

REVOKE EXECUTE ON FUNCTION public.set_replenishment_item_shipped_qty(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_replenishment_item_shipped_qty(uuid, int) TO authenticated;
