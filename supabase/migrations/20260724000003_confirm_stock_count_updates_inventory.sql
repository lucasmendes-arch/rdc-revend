-- ============================================================================
-- Migration: 20260724000003_confirm_stock_count_updates_inventory.sql
-- Estoque do checkout (inventory) passa a vir da contagem física de Linhares
--
-- Reverte parcialmente a D-21 (docs/decisions.md): Linhares (stores.type=
-- 'central') é o CD que despacha os pedidos B2B online, então a partir de
-- agora confirm_stock_count atualiza inventory.quantity quando a contagem
-- confirmada é da loja central. Loja satélite continua exatamente como
-- estava (gera replenishment_requests, nunca toca em inventory) — só varejo
-- local, não é fonte de disponibilidade do checkout.
--
-- create-order/index.ts (feature freeze) NÃO é alterado: continua lendo
-- inventory.quantity e chamando decrement_stock() a cada pedido, sem
-- mudança de sequência. Ver D-26 em docs/decisions.md.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_stock_count(p_stock_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid               uuid;
  v_count             record;
  v_store_type        text;
  v_item              record;
  v_total_units       int;
  v_target            int;
  v_suggested         int;
  v_request_id        uuid;
  v_items_total       int := 0;
  v_items_replenished int := 0;
  v_items_sufficient  int := 0;
  v_items_skipped     jsonb := '[]'::jsonb;
  v_inventory_updated int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contagem não encontrada: %', p_stock_count_id;
  END IF;

  SELECT type INTO v_store_type FROM public.stores WHERE id = v_count.store_id;

  IF NOT (
    public.has_full_stock_access()
    OR (public.is_estoque() AND v_count.store_id = public.my_store_id())
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_count.status = 'confirmed' THEN
    RAISE EXCEPTION 'Contagem já confirmada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_count_items WHERE stock_count_id = p_stock_count_id
  ) THEN
    RAISE EXCEPTION 'Contagem sem itens';
  END IF;

  DELETE FROM public.replenishment_requests
  WHERE destination_store_id = v_count.store_id AND status = 'open';

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

    IF v_store_type IS DISTINCT FROM 'central' THEN
      IF v_request_id IS NULL THEN
        INSERT INTO public.replenishment_requests (destination_store_id, source_stock_count_id)
        VALUES (v_count.store_id, p_stock_count_id)
        RETURNING id INTO v_request_id;
      END IF;

      INSERT INTO public.replenishment_request_items (request_id, product_id, suggested_quantity)
      VALUES (v_request_id, v_item.product_id, v_suggested);
    END IF;

    v_items_replenished := v_items_replenished + 1;
  END LOOP;

  -- Linhares (central) é quem despacha pedido B2B online — a contagem
  -- confirmada dela passa a ser a fonte de inventory.quantity (checkout).
  -- Produto sem units_per_box (total_units NULL) fica de fora, mesmo
  -- critério de "não classificado" usado acima. is_active=true exclui
  -- produtos stock_only automaticamente (CHECK garante que nunca coexistem).
  IF v_store_type = 'central' THEN
    WITH upserted AS (
      INSERT INTO public.inventory (product_id, quantity, last_synced_at, updated_at)
      SELECT sci.product_id, sci.total_units, now(), now()
      FROM public.stock_count_items sci
      JOIN public.catalog_products cp ON cp.id = sci.product_id AND cp.is_active = true
      WHERE sci.stock_count_id = p_stock_count_id AND sci.total_units IS NOT NULL
      ON CONFLICT (product_id) DO UPDATE
        SET quantity = EXCLUDED.quantity, last_synced_at = now(), updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_inventory_updated FROM upserted;
  END IF;

  UPDATE public.stock_counts
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_stock_count_id;

  RETURN jsonb_build_object(
    'stock_count_id',            p_stock_count_id,
    'store_id',                  v_count.store_id,
    'confirmed_at',              now(),
    'items_total',               v_items_total,
    'items_replenished',         v_items_replenished,
    'items_sufficient',          v_items_sufficient,
    'items_skipped',             v_items_skipped,
    'replenishment_request_id',  v_request_id,
    'inventory_updated',         v_inventory_updated
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- Backfill: corte inicial a partir da contagem confirmada mais recente de
-- Linhares que já existir (se houver). Sem isso, inventory ficaria com o
-- último valor do sync do Sheets até a próxima contagem de Linhares ser
-- confirmada depois deste deploy.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_linhares_store_id uuid;
  v_latest_count_id   uuid;
BEGIN
  SELECT id INTO v_linhares_store_id FROM public.stores WHERE type = 'central' LIMIT 1;

  IF v_linhares_store_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_latest_count_id
  FROM public.stock_counts
  WHERE store_id = v_linhares_store_id AND status = 'confirmed'
  ORDER BY confirmed_at DESC
  LIMIT 1;

  IF v_latest_count_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.inventory (product_id, quantity, last_synced_at, updated_at)
  SELECT sci.product_id, sci.total_units, now(), now()
  FROM public.stock_count_items sci
  JOIN public.catalog_products cp ON cp.id = sci.product_id AND cp.is_active = true
  WHERE sci.stock_count_id = v_latest_count_id AND sci.total_units IS NOT NULL
  ON CONFLICT (product_id) DO UPDATE
    SET quantity = EXCLUDED.quantity, last_synced_at = now(), updated_at = now();
END $$;
