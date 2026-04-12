-- ============================================================================
-- Migration: 20260412000006_sellers_user_id.sql
-- CRM Operacional P3 — Vínculo seller ↔ usuário admin
--
-- Implementa:
--   1. Coluna user_id em sellers (FK auth.users, nullable)
--   2. Unique index parcial: cada usuário vinculado a no máximo 1 seller
--   3. RPC admin_get_my_seller_id() — resolve seller do usuário autenticado
--   4. RPC admin_set_seller_user_id() — admin vincula usuário a seller
-- ============================================================================


-- ============================================================================
-- 1. Coluna user_id em sellers
-- ============================================================================

ALTER TABLE public.sellers
ADD COLUMN IF NOT EXISTS user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sellers.user_id IS
  'Usuário Supabase (admin/salao) vinculado a este seller. '
  'Permite resolução automática do responsável comercial no CRM. '
  'Nullable: seller sem usuário vinculado continua funcional.';


-- ============================================================================
-- 2. Unique index parcial — um usuário em no máximo 1 seller
--    WHERE user_id IS NOT NULL garante que NULLs não conflitem entre si.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS sellers_user_id_unique
  ON public.sellers(user_id)
  WHERE user_id IS NOT NULL;


-- ============================================================================
-- 3. RPC admin_get_my_seller_id()
--    Retorna o seller_id do seller vinculado ao usuário autenticado.
--    Retorna NULL se o usuário não tiver seller vinculado ou seller inativo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_my_seller_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id
  FROM public.sellers
  WHERE user_id = auth.uid()
    AND active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_my_seller_id() TO authenticated;

COMMENT ON FUNCTION public.admin_get_my_seller_id() IS
  'Retorna o seller_id do usuário autenticado. NULL se não vinculado.';


-- ============================================================================
-- 4. RPC admin_set_seller_user_id(p_seller_id, p_user_id)
--    Vincula (ou desvincula com NULL) um usuário a um seller.
--    Verificação de admin obrigatória.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_seller_user_id(
  p_seller_id uuid,
  p_user_id   uuid  -- NULL para desvincular
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas admins podem vincular usuários a sellers';
  END IF;

  UPDATE public.sellers
  SET user_id = p_user_id
  WHERE id = p_seller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller não encontrado: %', p_seller_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_seller_user_id(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_set_seller_user_id(uuid, uuid) IS
  'Vincula (ou desvincula com NULL) um usuário Supabase a um seller. Admin-only.';
