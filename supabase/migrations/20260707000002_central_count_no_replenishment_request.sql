-- ============================================================================
-- Migration: 20260707000002_central_count_no_replenishment_request.sql
-- Módulo de Estoque — contagem da loja central não gera replenishment_request
--
-- Contexto: store_stock_targets já suporta meta pra qualquer loja, inclusive
-- a central (matriz em /estoque/config). Sem essa correção, se o admin
-- cadastrar meta pra central, confirm_stock_count criaria um
-- replenishment_request com destination_store_id = própria central — uma
-- linha sem sentido no kanban de separação/envio (/estoque/pedidos), que
-- modela envio ENTRE lojas, não compra da central junto ao fornecedor.
--
-- v3: mantém a conciliação (items_replenished continua contando itens
-- abaixo da meta nas estatísticas retornadas), mas só persiste
-- replenishment_requests/items quando a loja da contagem NÃO é central.
-- A lista de itens abaixo da meta da central passa a ser consultada sob
-- demanda na tela de revisão (Confirmacao.tsx), não fica presa ao pipeline
-- de pedidos entre lojas.
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

  SELECT type INTO v_store_type FROM public.stores WHERE id = v_count.store_id;

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

  -- ── Substitui o pedido aberto da loja (contagem mais recente = verdade) ───
  -- Itens caem em cascata. Pedidos em picking/shipped não são tocados.
  -- Sem efeito pra central, que não gera replenishment_requests (abaixo).
  DELETE FROM public.replenishment_requests
  WHERE destination_store_id = v_count.store_id AND status = 'open';

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

    -- Central: item abaixo da meta é compra junto ao fornecedor, não pedido
    -- interno entre lojas — não entra em replenishment_requests. A loja
    -- ainda conta pra items_replenished (estatística), só não vira pedido.
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

  -- ── Confirmar contagem ────────────────────────────────────────────────────
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
    'replenishment_request_id',  v_request_id
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_stock_count(uuid) IS
  'Confirma uma contagem física e concilia cada item contra store_stock_targets. '
  'v3 (2026-07-07): loja central não gera replenishment_requests (compra do '
  'fornecedor, não envio entre lojas) — itens_replenished ainda conta esses '
  'itens nas estatísticas, mas replenishment_request_id fica NULL. Não '
  'reexecutável sobre a mesma contagem (idempotência por linha). Acessível '
  'por: authenticated (admin ou estoque da própria loja, verificado internamente).';
