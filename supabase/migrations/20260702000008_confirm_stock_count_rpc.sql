-- ============================================================================
-- Migration: 20260702000008_confirm_stock_count_rpc.sql
-- Módulo de Estoque — Etapa 7: RPC confirm_stock_count
--
-- Confirma uma contagem física e concilia cada item contra a meta de
-- estoque da loja (store_stock_targets), gerando/atualizando pedidos de
-- reposição (replenishment_orders) quando o total contado fica abaixo da
-- meta.
--
-- Regras:
--   - Não reexecutável sobre a mesma contagem (idempotência por linha:
--     uma vez confirmed, uma segunda chamada falha).
--   - Revalida total_units no servidor (não confia no valor já persistido
--     pelo trigger de stock_count_items).
--   - UPSERT em replenishment_orders SUBSTITUI o suggested_quantity de um
--     pedido 'open' existente — a contagem física mais recente é sempre a
--     verdade, não um delta a somar (ver D-20 em docs/decisions.md).
--   - Sem bloco EXCEPTION WHEN OTHERS: ao contrário de um trigger de
--     side-effect, aqui o erro É a lógica de negócio principal e deve
--     subir integralmente para o frontend.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_stock_count(p_stock_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid               uuid;
  v_count             record;
  v_item              record;
  v_total_units       int;
  v_target            int;
  v_suggested         int;
  v_items_total       int := 0;
  v_items_replenished int := 0;
  v_items_sufficient  int := 0;
  v_items_skipped     jsonb := '[]'::jsonb;
BEGIN
  -- ── Autenticação ──────────────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- ── Buscar contagem ───────────────────────────────────────────────────────
  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contagem não encontrada: %', p_stock_count_id;
  END IF;

  -- ── Autorização ───────────────────────────────────────────────────────────
  IF NOT (
    public.is_admin()
    OR (public.is_estoque() AND v_count.store_id = public.my_store_id())
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- ── Idempotência ──────────────────────────────────────────────────────────
  IF v_count.status = 'confirmed' THEN
    RAISE EXCEPTION 'Contagem já confirmada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_count_items WHERE stock_count_id = p_stock_count_id
  ) THEN
    RAISE EXCEPTION 'Contagem sem itens';
  END IF;

  -- ── Conciliação item a item ───────────────────────────────────────────────
  FOR v_item IN
    SELECT sci.product_id, sci.closed_boxes, sci.loose_units, cp.units_per_box
    FROM public.stock_count_items sci
    JOIN public.catalog_products cp ON cp.id = sci.product_id
    WHERE sci.stock_count_id = p_stock_count_id
  LOOP
    v_items_total := v_items_total + 1;

    IF v_item.units_per_box IS NULL THEN
      v_items_skipped := v_items_skipped || jsonb_build_array(
        jsonb_build_object('product_id', v_item.product_id, 'reason', 'no_units_per_box')
      );
      CONTINUE;
    END IF;

    -- Revalida total_units no servidor (não confia no valor do trigger).
    v_total_units := (v_item.closed_boxes * v_item.units_per_box) + v_item.loose_units;

    SELECT target_quantity INTO v_target
    FROM public.store_stock_targets
    WHERE product_id = v_item.product_id AND store_id = v_count.store_id;

    IF NOT FOUND THEN
      v_items_skipped := v_items_skipped || jsonb_build_array(
        jsonb_build_object('product_id', v_item.product_id, 'reason', 'no_target_defined')
      );
      CONTINUE;
    END IF;

    IF v_total_units >= v_target THEN
      v_items_sufficient := v_items_sufficient + 1;
      CONTINUE;
    END IF;

    v_suggested := v_target - v_total_units;

    INSERT INTO public.replenishment_orders (
      product_id, destination_store_id, source_stock_count_id,
      suggested_quantity, status, generated_at
    ) VALUES (
      v_item.product_id, v_count.store_id, p_stock_count_id,
      v_suggested, 'open', now()
    )
    ON CONFLICT (product_id, destination_store_id) WHERE status = 'open'
    DO UPDATE SET
      suggested_quantity    = EXCLUDED.suggested_quantity,
      generated_at           = now(),
      source_stock_count_id  = EXCLUDED.source_stock_count_id;

    v_items_replenished := v_items_replenished + 1;
  END LOOP;

  -- ── Confirmar contagem ────────────────────────────────────────────────────
  UPDATE public.stock_counts
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_stock_count_id;

  RETURN jsonb_build_object(
    'stock_count_id',    p_stock_count_id,
    'store_id',          v_count.store_id,
    'confirmed_at',      now(),
    'items_total',       v_items_total,
    'items_replenished', v_items_replenished,
    'items_sufficient',  v_items_sufficient,
    'items_skipped',     v_items_skipped
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_stock_count(uuid) IS
  'Confirma uma contagem física e concilia cada item contra store_stock_targets, '
  'gerando/atualizando replenishment_orders quando o total contado fica abaixo '
  'da meta da loja. Não reexecutável sobre a mesma contagem (idempotência por '
  'linha). Acessível por: authenticated (admin ou estoque da própria loja, '
  'verificado internamente).';

REVOKE EXECUTE ON FUNCTION public.confirm_stock_count(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_stock_count(uuid) TO authenticated;
