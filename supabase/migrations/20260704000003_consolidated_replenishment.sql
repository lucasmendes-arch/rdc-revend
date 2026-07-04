-- ============================================================================
-- Migration: 20260704000003_consolidated_replenishment.sql
-- Módulo de Estoque — pedido de reposição CONSOLIDADO
--
-- Antes: replenishment_orders = uma linha (pedido) por produto+loja.
-- Agora: UM pedido por loja destino (replenishment_requests), com os itens
-- que precisam de reposição em replenishment_request_items. A confirmação
-- de uma contagem gera/substitui o pedido aberto da loja inteiro.
--
-- replenishment_orders vira tabela legada (histórico preservado, nada mais
-- escreve nela). Pedidos open/picking existentes são migrados pro novo
-- formato abaixo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.replenishment_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_store_id  uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  source_stock_count_id uuid REFERENCES public.stock_counts(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picking', 'shipped')),
  generated_at          timestamptz NOT NULL DEFAULT now(),
  picked_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shipped_at            timestamptz
);

-- Só UM pedido aberto por loja — nova contagem confirmada substitui o pedido
-- aberto inteiro (a contagem física mais recente é sempre a verdade, D-20).
-- Pedidos em picking/shipped não são tocados; surge um novo open ao lado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_replenishment_requests_open_store
  ON public.replenishment_requests (destination_store_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_replenishment_requests_status
  ON public.replenishment_requests (status);

CREATE TABLE IF NOT EXISTS public.replenishment_request_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         uuid NOT NULL REFERENCES public.replenishment_requests(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE RESTRICT,
  suggested_quantity int NOT NULL CHECK (suggested_quantity > 0),
  shipped_quantity   int CHECK (shipped_quantity IS NULL OR shipped_quantity >= 0),
  UNIQUE (request_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_replenishment_request_items_request
  ON public.replenishment_request_items (request_id);

COMMENT ON TABLE public.replenishment_requests IS
  'Pedido de reposição consolidado: um por loja destino, gerado por '
  'confirm_stock_count(). Itens em replenishment_request_items.';
COMMENT ON TABLE public.replenishment_orders IS
  'LEGADO (2026-07-04): substituída por replenishment_requests + '
  'replenishment_request_items. Mantida só como histórico.';

-- ----------------------------------------------------------------------------
-- 2. RLS — espelha as policies de replenishment_orders
-- ----------------------------------------------------------------------------
ALTER TABLE public.replenishment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replenishment_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replenishment_requests_admin_all" ON public.replenishment_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "replenishment_requests_estoque_own_store" ON public.replenishment_requests
  FOR SELECT TO authenticated
  USING (public.is_estoque() AND destination_store_id = public.my_store_id());

CREATE POLICY "replenishment_requests_estoque_central_read" ON public.replenishment_requests
  FOR SELECT TO authenticated
  USING (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = public.my_store_id() AND type = 'central'
    )
  );

CREATE POLICY "replenishment_request_items_admin_all" ON public.replenishment_request_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Item visível se o pedido pai é visível (mesmas regras da tabela pai).
CREATE POLICY "replenishment_request_items_estoque_read" ON public.replenishment_request_items
  FOR SELECT TO authenticated
  USING (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.replenishment_requests r
      WHERE r.id = request_id
        AND (
          r.destination_store_id = public.my_store_id()
          OR EXISTS (
            SELECT 1 FROM public.stores
            WHERE id = public.my_store_id() AND type = 'central'
          )
        )
    )
  );

-- Projeto não tem grants padrão — conceder explicitamente.
GRANT SELECT ON public.replenishment_requests TO authenticated;
GRANT SELECT ON public.replenishment_request_items TO authenticated;
GRANT ALL ON public.replenishment_requests TO service_role;
GRANT ALL ON public.replenishment_request_items TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Migração dos pedidos open/picking existentes (shipped fica no legado)
-- ----------------------------------------------------------------------------
WITH open_req AS (
  INSERT INTO public.replenishment_requests (destination_store_id, source_stock_count_id, status, generated_at)
  SELECT
    destination_store_id,
    (array_agg(source_stock_count_id) FILTER (WHERE source_stock_count_id IS NOT NULL))[1],
    'open',
    max(generated_at)
  FROM public.replenishment_orders
  WHERE status = 'open'
  GROUP BY destination_store_id
  RETURNING id, destination_store_id
)
INSERT INTO public.replenishment_request_items (request_id, product_id, suggested_quantity)
SELECT r.id, o.product_id, sum(o.suggested_quantity)
FROM public.replenishment_orders o
JOIN open_req r ON r.destination_store_id = o.destination_store_id
WHERE o.status = 'open'
GROUP BY r.id, o.product_id;

WITH pick_req AS (
  INSERT INTO public.replenishment_requests (destination_store_id, source_stock_count_id, status, generated_at, picked_by)
  SELECT
    destination_store_id,
    (array_agg(source_stock_count_id) FILTER (WHERE source_stock_count_id IS NOT NULL))[1],
    'picking',
    max(generated_at),
    (array_agg(picked_by) FILTER (WHERE picked_by IS NOT NULL))[1]
  FROM public.replenishment_orders
  WHERE status = 'picking'
  GROUP BY destination_store_id
  RETURNING id, destination_store_id
)
INSERT INTO public.replenishment_request_items (request_id, product_id, suggested_quantity)
SELECT r.id, o.product_id, sum(o.suggested_quantity)
FROM public.replenishment_orders o
JOIN pick_req r ON r.destination_store_id = o.destination_store_id
WHERE o.status = 'picking'
GROUP BY r.id, o.product_id;

-- ----------------------------------------------------------------------------
-- 4. confirm_stock_count v2 — gera UM pedido consolidado por loja
-- ----------------------------------------------------------------------------
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

    -- Cria o pedido consolidado só quando o primeiro item precisar de reposição.
    IF v_request_id IS NULL THEN
      INSERT INTO public.replenishment_requests (destination_store_id, source_stock_count_id)
      VALUES (v_count.store_id, p_stock_count_id)
      RETURNING id INTO v_request_id;
    END IF;

    INSERT INTO public.replenishment_request_items (request_id, product_id, suggested_quantity)
    VALUES (v_request_id, v_item.product_id, v_suggested);

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

-- ----------------------------------------------------------------------------
-- 5. RPC update_replenishment_request_status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_replenishment_request_status(
  p_request_id     uuid,
  p_new_status     text,
  p_shipped_items  jsonb DEFAULT NULL  -- [{"item_id": uuid, "shipped_quantity": int}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_request record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_request FROM public.replenishment_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de reposição não encontrado: %', p_request_id;
  END IF;

  -- Admin ou colaborador de estoque da loja central (quem separa e envia).
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

  IF v_request.status = 'shipped' THEN
    RAISE EXCEPTION 'Pedido já foi enviado, não pode ser alterado';
  END IF;

  IF p_new_status = 'picking' THEN
    IF v_request.status <> 'open' THEN
      RAISE EXCEPTION 'Transição inválida: pedido não está aberto (status atual: %)', v_request.status;
    END IF;

    UPDATE public.replenishment_requests
    SET status = 'picking', picked_by = v_uid
    WHERE id = p_request_id;

  ELSIF p_new_status = 'shipped' THEN
    -- Quantidades por item (opcional). Item ausente assume o sugerido.
    IF p_shipped_items IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_shipped_items) e
        WHERE (e.value->>'shipped_quantity')::int < 0
      ) THEN
        RAISE EXCEPTION 'Quantidade enviada não pode ser negativa';
      END IF;

      UPDATE public.replenishment_request_items i
      SET shipped_quantity = (e.value->>'shipped_quantity')::int
      FROM jsonb_array_elements(p_shipped_items) e
      WHERE i.id = (e.value->>'item_id')::uuid
        AND i.request_id = p_request_id;
    END IF;

    UPDATE public.replenishment_request_items
    SET shipped_quantity = suggested_quantity
    WHERE request_id = p_request_id AND shipped_quantity IS NULL;

    UPDATE public.replenishment_requests
    SET status = 'shipped', shipped_at = now(), picked_by = COALESCE(picked_by, v_uid)
    WHERE id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Status inválido: %', p_new_status;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_replenishment_request_status(uuid, text, jsonb) IS
  'Avança o status de um pedido de reposição consolidado: open->picking, '
  'open|picking->shipped (terminal). p_shipped_items informa quantidades '
  'enviadas por item; item ausente assume o sugerido.';

REVOKE EXECUTE ON FUNCTION public.update_replenishment_request_status(uuid, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_replenishment_request_status(uuid, text, jsonb) TO authenticated;
