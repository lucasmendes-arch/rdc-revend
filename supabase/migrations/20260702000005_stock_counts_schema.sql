-- ============================================================================
-- Migration: 20260702000005_stock_counts_schema.sql
-- Módulo de Estoque — Etapa 4: stock_counts + stock_count_items
--
-- Implementa:
--   1. Tabela stock_counts (uma contagem física por loja/momento)
--   2. Tabela stock_count_items (item de contagem: caixas fechadas + soltas)
--   3. Trigger que calcula total_units a partir de catalog_products.units_per_box
--   4. RLS: admin gerencia tudo; colaborador de estoque só vê/edita a
--      própria loja, e só pode editar enquanto status = 'draft' — depois de
--      confirmada (via RPC confirm_stock_count), a contagem fica travada
--      para o colaborador (mas continua visível).
--
-- Retrocompatibilidade: tabelas novas, nenhum dado existente afetado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela stock_counts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  employee_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_store_status
  ON public.stock_counts (store_id, status);

COMMENT ON TABLE public.stock_counts IS
  'Uma contagem física de estoque em uma loja. status=draft enquanto o '
  'colaborador está preenchendo; status=confirmed após confirm_stock_count().';

-- ----------------------------------------------------------------------------
-- 2. Tabela stock_count_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE RESTRICT,
  closed_boxes   int NOT NULL DEFAULT 0 CHECK (closed_boxes >= 0),
  loose_units    int NOT NULL DEFAULT 0 CHECK (loose_units >= 0),
  total_units    int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_count_id, product_id)
);

COMMENT ON COLUMN public.stock_count_items.total_units IS
  'Calculado por trigger: closed_boxes * catalog_products.units_per_box + '
  'loose_units. NULL se o produto não tiver units_per_box cadastrado. '
  'Revalidado server-side (não confiado) dentro de confirm_stock_count().';

-- ----------------------------------------------------------------------------
-- 3. Trigger: calcula total_units
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_stock_count_item_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_units_per_box int;
BEGIN
  SELECT units_per_box INTO v_units_per_box
  FROM public.catalog_products WHERE id = NEW.product_id;

  IF v_units_per_box IS NULL THEN
    NEW.total_units := NULL;
  ELSE
    NEW.total_units := (NEW.closed_boxes * v_units_per_box) + NEW.loose_units;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_count_item_total ON public.stock_count_items;
CREATE TRIGGER trg_stock_count_item_total
  BEFORE INSERT OR UPDATE OF closed_boxes, loose_units, product_id
  ON public.stock_count_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_stock_count_item_total();

-- ----------------------------------------------------------------------------
-- 4. RLS — stock_counts
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_counts_admin_all" ON public.stock_counts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Colaborador vê todas as contagens (draft ou confirmed) da própria loja.
CREATE POLICY "stock_counts_estoque_select" ON public.stock_counts
  FOR SELECT TO authenticated
  USING (public.is_estoque() AND store_id = public.my_store_id());

-- Só pode criar contagem nova como draft, na própria loja.
CREATE POLICY "stock_counts_estoque_insert" ON public.stock_counts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_estoque() AND store_id = public.my_store_id() AND status = 'draft'
  );

-- Só pode atualizar enquanto ainda draft (USING = linha antiga), e nunca pode
-- setar status para confirmed diretamente (WITH CHECK = linha nova) — a
-- confirmação só acontece via RPC confirm_stock_count (SECURITY DEFINER).
CREATE POLICY "stock_counts_estoque_update" ON public.stock_counts
  FOR UPDATE TO authenticated
  USING (public.is_estoque() AND store_id = public.my_store_id() AND status = 'draft')
  WITH CHECK (public.is_estoque() AND store_id = public.my_store_id() AND status = 'draft');

-- Sem policy de DELETE para is_estoque() — remoção de contagem é admin-only.

-- ----------------------------------------------------------------------------
-- 5. RLS — stock_count_items
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_count_items_admin_all" ON public.stock_count_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "stock_count_items_estoque_select" ON public.stock_count_items
  FOR SELECT TO authenticated
  USING (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = public.my_store_id()
    )
  );

CREATE POLICY "stock_count_items_estoque_insert" ON public.stock_count_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = public.my_store_id()
        AND sc.status = 'draft'
    )
  );

CREATE POLICY "stock_count_items_estoque_update" ON public.stock_count_items
  FOR UPDATE TO authenticated
  USING (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = public.my_store_id()
        AND sc.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = public.my_store_id()
        AND sc.status = 'draft'
    )
  );

CREATE POLICY "stock_count_items_estoque_delete" ON public.stock_count_items
  FOR DELETE TO authenticated
  USING (
    public.is_estoque() AND EXISTS (
      SELECT 1 FROM public.stock_counts sc
      WHERE sc.id = stock_count_items.stock_count_id
        AND sc.store_id = public.my_store_id()
        AND sc.status = 'draft'
    )
  );

-- Nota: a subquery acima referencia stock_counts, não profiles — permitido
-- pela regra D-01 (a proibição é especificamente sobre subquery em profiles
-- dentro de RLS de outras tabelas, para evitar recursão).
