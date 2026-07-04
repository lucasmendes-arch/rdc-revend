-- ============================================================================
-- Migration: 20260704000007_und_units_per_box_trigger.sql
-- Módulo de Estoque — invariante UND ⇒ units_per_box = 1 no banco
--
-- A regra existia só na UI (/estoque/config) e escapou em produtos criados
-- com bundle antigo em cache. Trigger garante o invariante em qualquer
-- caminho de escrita (form, edição inline, sync, SQL manual), e o backfill
-- corrige as linhas que passaram depois do backfill anterior (20260704000001).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_und_units_per_box()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- UND = item avulso: caixa de 1 é o único valor coerente.
  IF NEW.package_type = 'UND' THEN
    NEW.units_per_box := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_products_und_units ON public.catalog_products;
CREATE TRIGGER trg_catalog_products_und_units
  BEFORE INSERT OR UPDATE OF package_type, units_per_box
  ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_und_units_per_box();

COMMENT ON FUNCTION public.enforce_und_units_per_box() IS
  'Invariante: catalog_products com package_type UND sempre tem '
  'units_per_box = 1, independente do caminho de escrita.';

-- Corrige linhas UND que entraram sem o preenchimento automático.
UPDATE public.catalog_products
SET units_per_box = 1
WHERE package_type = 'UND'
  AND (units_per_box IS DISTINCT FROM 1);
