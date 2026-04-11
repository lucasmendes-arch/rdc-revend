-- RPC para atualizar full_name de qualquer perfil (qualquer role).
-- Necessário porque admin_update_profile tem WHERE role = 'user',
-- não funcionando para admins e operadores de salão.
CREATE OR REPLACE FUNCTION public.admin_update_full_name(
  p_user_id  uuid,
  p_full_name text
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
     SET full_name = NULLIF(TRIM(p_full_name), '')
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado: %', p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_full_name(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_full_name(uuid, text) TO authenticated;
