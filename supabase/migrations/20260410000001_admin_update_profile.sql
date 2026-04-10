-- ============================================================================
-- admin_update_profile
-- Permite que o admin edite campos do perfil de qualquer usuário.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id       uuid,
  p_full_name     text    DEFAULT NULL,
  p_phone         text    DEFAULT NULL,
  p_document_type text    DEFAULT NULL,
  p_document      text    DEFAULT NULL,
  p_business_type text    DEFAULT NULL,
  p_employees     text    DEFAULT NULL,
  p_revenue       text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.profiles
     SET full_name     = COALESCE(NULLIF(TRIM(p_full_name), ''),     full_name),
         phone         = COALESCE(NULLIF(TRIM(p_phone), ''),         phone),
         document_type = p_document_type,
         document      = COALESCE(NULLIF(TRIM(p_document), ''),      document),
         business_type = p_business_type,
         employees     = p_employees,
         revenue       = p_revenue
   WHERE id = p_user_id
     AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text, text) TO authenticated;
