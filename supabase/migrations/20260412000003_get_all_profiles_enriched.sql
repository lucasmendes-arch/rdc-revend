-- 20260412000003_get_all_profiles_enriched.sql
--
-- Redefine a RPC central public.get_all_profiles() estendendo o RETURNS TABLE
-- com novos campos necessários para o admin/CRM:
--   - Vendedor atribuído (código + id + nome resolvidos via public.sellers)
--   - Próxima ação (next_action / next_action_at)
--   - Agregados de pedidos (total_orders, total_spent, first_order_at, last_order_at)
--
-- Todos os campos originais permanecem na mesma ordem; os novos são adicionados
-- estritamente no final para preservar compatibilidade posicional com consumidores
-- que ainda dependem das colunas anteriores. O DROP é obrigatório porque a
-- assinatura do RETURNS TABLE foi alterada (PostgreSQL não permite CREATE OR
-- REPLACE quando o shape da tabela retornada muda).

DROP FUNCTION IF EXISTS public.get_all_profiles();

CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  -- campos originais (mesma ordem da versão anterior)
  id                      uuid,
  full_name               text,
  phone                   text,
  document_type           text,
  document                text,
  business_type           text,
  employees               text,
  revenue                 text,
  email                   text,
  is_partner              boolean,
  customer_segment        text,
  access_status           text,
  auth_phone              text,
  credentials_created_at  timestamptz,
  last_password_reset_at  timestamptz,
  price_list_id           uuid,
  price_list_name         text,
  -- novos campos (adicionados no final)
  assigned_seller         text,
  seller_id               uuid,
  seller_name             text,
  next_action             text,
  next_action_at          timestamptz,
  total_orders            bigint,
  total_spent             numeric,
  first_order_at          timestamptz,
  last_order_at           timestamptz
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
    p.document_type,
    p.document,
    p.business_type,
    p.employees,
    p.revenue,
    u.email::text,
    p.is_partner,
    p.customer_segment,
    COALESCE(p.access_status, 'not_created')::text,
    p.auth_phone,
    p.credentials_created_at,
    p.last_password_reset_at,
    p.price_list_id,
    pl.name AS price_list_name,
    -- novos
    p.assigned_seller,
    s.id    AS seller_id,
    s.name  AS seller_name,
    p.next_action,
    p.next_action_at,
    COALESCE(ord.total_orders, 0)    AS total_orders,
    COALESCE(ord.total_spent,  0)    AS total_spent,
    ord.first_order_at,
    ord.last_order_at
  FROM public.profiles p
  LEFT JOIN auth.users         u   ON u.id  = p.id
  LEFT JOIN public.price_lists pl  ON pl.id = p.price_list_id
  LEFT JOIN public.sellers     s   ON s.code = p.assigned_seller AND s.active = true
  LEFT JOIN (
    SELECT
      o.user_id,
      COUNT(*)::bigint AS total_orders,
      COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelado','expirado')), 0) AS total_spent,
      MIN(o.created_at) AS first_order_at,
      MAX(o.created_at) AS last_order_at
    FROM public.orders o
    GROUP BY o.user_id
  ) ord ON ord.user_id = p.id
  WHERE p.role = 'user'
  ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_profiles() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
