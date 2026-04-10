-- ============================================================================
-- resolve_partner_login_email
-- Dado um telefone E.164, retorna o email do parceiro ativo elegível.
-- Acessível por anon para uso no fluxo de login.
--
-- Retorna NULL se:
--   - telefone não encontrado em profiles.auth_phone
--   - parceiro não é network_partner
--   - acesso está bloqueado ou não criado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_partner_login_email(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT u.email::text INTO v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.auth_phone = p_phone
    AND p.customer_segment = 'network_partner'
    AND p.access_status   = 'active'
  LIMIT 1;

  RETURN v_email; -- NULL if not found / ineligible
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_partner_login_email(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_partner_login_email(text) TO anon;
GRANT  EXECUTE ON FUNCTION public.resolve_partner_login_email(text) TO authenticated;
