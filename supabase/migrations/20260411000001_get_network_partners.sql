-- ============================================================================
-- Migration: 20260411000001_get_network_partners.sql
-- RPC para listar parceiros da rede com estatísticas enriquecidas.
-- Usado pela aba "Parceiros" em /admin/usuarios.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_network_partners()
RETURNS TABLE (
  id                      uuid,
  full_name               text,
  phone                   text,
  email                   text,
  document_type           text,
  document                text,
  business_type           text,
  employees               text,
  revenue                 text,
  customer_segment        text,
  access_status           text,
  auth_phone              text,
  credentials_created_at  timestamptz,
  last_password_reset_at  timestamptz,
  price_list_id           uuid,
  price_list_name         text,
  last_sign_in_at         timestamptz,
  total_purchased         numeric,
  order_count             int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.phone,
      u.email::text,
      p.document_type,
      p.document,
      p.business_type,
      p.employees,
      p.revenue,
      p.customer_segment,
      COALESCE(p.access_status, 'not_created')::text,
      p.auth_phone,
      p.credentials_created_at,
      p.last_password_reset_at,
      p.price_list_id,
      pl.name AS price_list_name,
      u.last_sign_in_at,
      COALESCE(
        SUM(CASE WHEN o.status NOT IN ('cancelado', 'expirado') THEN o.total ELSE 0 END),
        0
      )::numeric AS total_purchased,
      COUNT(
        CASE WHEN o.status NOT IN ('cancelado', 'expirado') THEN 1 END
      )::int AS order_count
    FROM public.profiles p
    LEFT JOIN auth.users         u  ON u.id  = p.id
    LEFT JOIN public.price_lists pl ON pl.id = p.price_list_id
    LEFT JOIN public.orders      o  ON o.user_id = p.id
    WHERE p.customer_segment = 'network_partner'
    GROUP BY
      p.id, p.full_name, p.phone, u.email,
      p.document_type, p.document, p.business_type, p.employees, p.revenue,
      p.customer_segment, p.access_status, p.auth_phone,
      p.credentials_created_at, p.last_password_reset_at,
      p.price_list_id, pl.name, u.last_sign_in_at
    ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_network_partners() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_network_partners() TO authenticated;
