-- ============================================================================
-- Migration: 20260702000016_admin_set_user_role_salao_optional_store.sql
-- Módulo de Estoque — admin_set_user_role/get_system_users pós-unificação
--
-- Após 20260702000015 (merge estoque→salao): store_id agora é atribuído a
-- role='salao' (opcional — salao sem store_id acessa só o módulo de venda).
-- 'estoque' não é mais um role válido.
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

  IF p_role NOT IN ('user', 'admin', 'salao') THEN
    RAISE EXCEPTION 'Role inválido: %', p_role;
  END IF;

  IF p_store_id IS NOT NULL THEN
    IF p_role <> 'salao' THEN
      RAISE EXCEPTION 'store_id só pode ser atribuído a role=salao';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
      RAISE EXCEPTION 'Loja não encontrada: %', p_store_id;
    END IF;
  END IF;

  UPDATE public.profiles
  SET role     = p_role,
      store_id = CASE WHEN p_role = 'salao' THEN p_store_id ELSE NULL END
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_role(uuid, text, uuid) IS
  'Define role (user/admin/salao) e, opcionalmente, store_id de um usuário '
  'salao (colaborador de loja física com acesso ao módulo de estoque). '
  'Admin-only, verificado internamente. store_id sempre NULL para roles '
  'diferentes de salao.';

-- ----------------------------------------------------------------------------
-- get_system_users(): 'estoque' não é mais um role válido
-- ----------------------------------------------------------------------------
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
  WHERE p.role IN ('admin', 'salao')
  ORDER BY p.role ASC, p.created_at DESC;
$$;
