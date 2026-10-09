-- ============================================================================
-- Comissão estimada para os itens que chegam pelo webhook
--
-- O evento de fechamento do Trinks (tipo 1) não traz comissão: só valor,
-- itens e profissional. A comissão real só vem no relatório CSV de Comissões.
-- Sem isto, todo dia coberto só pelo webhook aparecia com comissão R$ 0,00.
--
-- Fórmula do Trinks, conferida contra 3,8 mil itens do CSV (erro zero):
--     comissão = (valor − desconto do cliente) × percentual
-- (a taxa da adquirente NÃO entra na base).
--
-- O percentual é o que o mesmo profissional recebeu no histórico do CSV:
--   1. no MESMO item (serviço/produto), mais recente;
--   2. senão, o mais frequente dele para o tipo (serviço/produto/pacote);
--   3. senão, o mais frequente da unidade para o tipo;
--   4. senão, 0.
-- O item fica marcado commission_estimated = true. Quando o CSV do período é
-- importado, ele passa a mandar nos resumos (trinks_csv_covered_through) e a
-- estimativa deixa de ser usada.
--
-- O trigger também roda quando o profissional muda (o nome chega depois pelo
-- evento 5/6 — trg_trinks_professional_relabel), porque o percentual depende
-- de quem atendeu.
-- ============================================================================

ALTER TABLE public.trinks_sale_items
  ADD COLUMN IF NOT EXISTS commission_estimated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trinks_sale_items.commission_estimated IS
  'true = comissão calculada pelo histórico do CSV (webhook não traz comissão). Ver trinks_commission_pct_guess.';

-- Busca do histórico por profissional/item só no CSV.
CREATE INDEX IF NOT EXISTS trinks_sale_items_csv_commission_idx
  ON public.trinks_sale_items (store_id, professional, item_type, business_date DESC)
  WHERE source = 'csv';

CREATE OR REPLACE FUNCTION public.trinks_commission_pct_guess(
  p_store_id uuid, p_professional text, p_item_name text, p_item_type text
) RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    -- 1. mesmo profissional, mesmo item, mais recente
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv' AND store_id = p_store_id
        AND professional = p_professional
        AND lower(btrim(item_name)) = lower(btrim(p_item_name))
        AND commission_pct IS NOT NULL
      ORDER BY business_date DESC LIMIT 1),
    -- 2. mesmo profissional, mesmo tipo, mais frequente nos últimos 180 dias
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv' AND store_id = p_store_id
        AND professional = p_professional AND item_type = p_item_type
        AND commission_pct IS NOT NULL
        AND business_date >= current_date - 180
      GROUP BY commission_pct ORDER BY count(*) DESC, commission_pct DESC LIMIT 1),
    -- 3. unidade, mesmo tipo, mais frequente nos últimos 180 dias
    (SELECT commission_pct FROM trinks_sale_items
      WHERE source = 'csv' AND store_id = p_store_id
        AND item_type = p_item_type
        AND commission_pct IS NOT NULL
        AND business_date >= current_date - 180
      GROUP BY commission_pct ORDER BY count(*) DESC, commission_pct DESC LIMIT 1),
    0)
$$;

CREATE OR REPLACE FUNCTION public.trinks_sale_item_estimate_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base numeric := coalesce(NEW.value, 0) - coalesce(NEW.client_discount, 0);
  v_pct  numeric;
BEGIN
  v_pct := trinks_commission_pct_guess(NEW.store_id, NEW.professional, NEW.item_name, NEW.item_type);
  NEW.commission_pct       := v_pct;
  NEW.commission_base      := v_base;
  NEW.commission_value     := round(v_base * v_pct / 100, 2);
  NEW.commission_estimated := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trinks_sale_item_estimate_commission ON public.trinks_sale_items;
CREATE TRIGGER trg_trinks_sale_item_estimate_commission
  BEFORE INSERT OR UPDATE OF professional, item_name, item_type, value, client_discount
  ON public.trinks_sale_items
  FOR EACH ROW
  WHEN (NEW.source = 'webhook')
  EXECUTE FUNCTION public.trinks_sale_item_estimate_commission();

-- Estima o que já chegou pelo webhook e recalcula os resumos desses dias.
DO $$
DECLARE r record;
BEGIN
  UPDATE trinks_sale_items SET professional = professional WHERE source = 'webhook';
  FOR r IN
    SELECT store_id, min(business_date) AS d_from, max(business_date) AS d_to
      FROM trinks_sale_items WHERE source = 'webhook' GROUP BY store_id
  LOOP
    PERFORM trinks_rebuild_sales(r.store_id, r.d_from, r.d_to);
  END LOOP;
END $$;
