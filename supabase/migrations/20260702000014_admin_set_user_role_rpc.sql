-- ============================================================================
-- Migration: 20260702000014_admin_set_user_role_rpc.sql
-- Módulo de Estoque — RPC para admin gerenciar role + loja de colaboradores
--
-- Achado: profiles.RLS hoje só tem policies "self_select"/"self_update"
-- (auth.uid() = id), desde 20250307000006_fix_catalog_rls_simple.sql — não
-- existe policy admin-wide. O botão de trocar role de OUTRO usuário em
-- /admin/usuarios (Usuarios.tsx updateRoleMutation, update direto via
-- client) não tem efeito para linhas de terceiros sob RLS. Seguindo o
-- padrão já estabelecido no projeto (admin_update_profile,
-- admin_set_profile_seller, etc. — SECURITY DEFINER com checagem interna),
-- esta RPC substitui o update direto tanto para o fluxo existente
-- (admin/salao) quanto para o novo (estoque + store_id).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id  uuid,
  p_role     text,
  p_store_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: requer admin';
  END IF;

  IF p_role NOT IN ('user', 'admin', 'salao', 'estoque') THEN
    RAISE EXCEPTION 'Role inválido: %', p_role;
  END IF;

  IF p_role = 'estoque' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'Colaborador de estoque precisa de uma loja vinculada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
      RAISE EXCEPTION 'Loja não encontrada: %', p_store_id;
    END IF;
  END IF;

  UPDATE public.profiles
  SET role     = p_role,
      store_id = CASE WHEN p_role = 'estoque' THEN p_store_id ELSE NULL END
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_role(uuid, text, uuid) IS
  'Define role e (quando estoque) store_id de um usuário. Admin-only, '
  'verificado internamente. store_id é limpo automaticamente quando o role '
  'deixa de ser estoque.';

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Atualiza get_system_users() para incluir role='estoque' e a loja vinculada
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_system_users();

CREATE OR REPLACE FUNCTION public.get_system_users()
RETURNS TABLE (
  id              uuid,
  role            text,
  full_name       text,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  permissions     jsonb,
  store_id        uuid,
  store_name      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.role,
    p.full_name,
    u.email,
    p.created_at,
    u.last_sign_in_at,
    p.permissions,
    p.store_id,
    s.name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.role IN ('admin', 'salao', 'estoque')
  ORDER BY p.role ASC, p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_users() TO authenticated;
