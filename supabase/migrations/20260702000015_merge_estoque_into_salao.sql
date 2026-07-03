-- ============================================================================
-- Migration: 20260702000015_merge_estoque_into_salao.sql
-- Módulo de Estoque — unifica role 'estoque' em 'salao'
--
-- Decisão do usuário: o mesmo colaborador de loja física faz venda E
-- contagem — não faz sentido ter duas contas/roles separadas. 'salao'
-- passa a ser o único role de colaborador de loja física; profiles.store_id
-- (antes exclusivo de 'estoque') agora é usado por 'salao' também, mas
-- opcional (um salao sem store_id só acessa o módulo de venda, não estoque).
--
-- Implementa:
--   1. Migra profiles.role='estoque' → 'salao' (mantém store_id)
--   2. Redefine is_estoque() para checar role='salao' — MANTÉM O NOME da
--      função para não precisar tocar nas ~7 RLS policies/RPCs que já a
--      referenciam (stores, stock_counts, stock_count_items,
--      store_stock_targets, replenishment_orders, confirm_stock_count,
--      update_replenishment_order_status). Ver D-23 em docs/decisions.md.
--   3. Reverte o CHECK de profiles.role — 'estoque' não é mais um valor
--      válido (nenhuma linha o usa mais após o passo 1).
--
-- Retrocompatibilidade: nenhuma linha perde store_id; apenas o valor de
-- role muda. RLS do módulo de estoque continua funcionando sem alteração
-- porque is_estoque()/my_store_id() são a camada de abstração usada em
-- todas as policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Migrar linhas existentes
-- ----------------------------------------------------------------------------
UPDATE public.profiles
SET role = 'salao'
WHERE role = 'estoque';

-- ----------------------------------------------------------------------------
-- 2. Redefinir is_estoque()
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
    WHERE id = auth.uid() AND role = 'salao'
  );
$$;

COMMENT ON FUNCTION public.is_estoque() IS
  'Retorna true se o usuário autenticado pode acessar o módulo de estoque. '
  'Unificado com salao em 2026-07-02 (D-23): colaborador de loja física é '
  'role=salao + store_id atribuído pelo admin (opcional — sem store_id, '
  'acessa só o módulo de venda). Nome da função mantido por compatibilidade '
  'com as RLS policies/RPCs já existentes que a referenciam.';

-- ----------------------------------------------------------------------------
-- 3. Reverter CHECK de profiles.role — 'estoque' não é mais criado
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'salao'));
