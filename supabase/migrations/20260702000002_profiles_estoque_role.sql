-- ============================================================================
-- Migration: 20260702000002_profiles_estoque_role.sql
-- Módulo de Estoque — Etapa 1: suporte à role "estoque"
--
-- Implementa:
--   1. Expansão do CHECK de profiles.role para incluir 'estoque'
--   2. Coluna profiles.store_id — vincula o colaborador à sua loja
--      (FK física adicionada em 20260702000003, depois que stores existir)
--   3. Function is_estoque() — espelho de is_salao()
--   4. Function my_store_id() — evita subquery direta em profiles nas RLS
--      policies do módulo de estoque (regra D-01, docs/decisions.md)
--
-- Retrocompatibilidade:
--   - Valores existentes de role ('user','admin','salao') continuam válidos
--   - store_id é nullable, sem impacto em profiles existentes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Expandir CHECK de profiles.role
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'salao', 'estoque'));

-- ----------------------------------------------------------------------------
-- 2. Coluna profiles.store_id
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_id uuid;

COMMENT ON COLUMN public.profiles.store_id IS
  'Loja (stores.id) à qual o colaborador de role = estoque está vinculado. '
  'NULL para as demais roles. FK física adicionada em 20260702000003_stores_table.sql.';

-- ----------------------------------------------------------------------------
-- 3. FUNCTION is_estoque()
--
-- Espelho de is_salao() para role = 'estoque'.
-- SECURITY DEFINER para poder ler profiles sem RLS recursion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_estoque()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'estoque'
  );
$$;

COMMENT ON FUNCTION public.is_estoque() IS
  'Retorna true se o usuário autenticado tem role = estoque. '
  'SECURITY DEFINER para evitar recursão RLS em profiles.';

-- ----------------------------------------------------------------------------
-- 4. FUNCTION my_store_id()
--
-- Retorna profiles.store_id do usuário autenticado. Usada nas RLS policies
-- de stock_counts / stock_count_items / store_stock_targets para comparar
-- store_id sem fazer subquery direta em profiles (proibido pela regra D-01 —
-- causou recursão infinita no passado, ver docs/decisions.md).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_store_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.my_store_id() IS
  'Retorna profiles.store_id do usuário autenticado. SECURITY DEFINER para '
  'evitar subquery direta em profiles em RLS policies de outras tabelas (D-01).';

REVOKE EXECUTE ON FUNCTION public.is_estoque() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_estoque() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_store_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.my_store_id() TO authenticated;
