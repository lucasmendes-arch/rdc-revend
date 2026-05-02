-- ============================================================================
-- Migration: 20260502000001_salao_search_price_list.sql
-- Expõe price_list_id no retorno de search_customers_for_salao para que o
-- operador do salão possa ver os preços da tabela vinculada ao cliente.
-- ============================================================================

-- DROP obrigatório: PostgreSQL não permite CREATE OR REPLACE com novo RETURNS TABLE
DROP FUNCTION IF EXISTS public.search_customers_for_salao(text, int);

CREATE FUNCTION public.search_customers_for_salao(
  p_search  text,
  p_limit   int DEFAULT 10
)
RETURNS TABLE (
  id            uuid,
  full_name     text,
  phone         text,
  email         text,
  is_partner    boolean,
  price_list_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_search     text;
  v_digits     text;
  v_safe_limit int;
BEGIN
  IF NOT (public.is_salao() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado: requer role salao ou admin';
  END IF;

  v_search := TRIM(COALESCE(p_search, ''));
  IF length(v_search) < 2 THEN
    RAISE EXCEPTION 'Busca deve ter ao menos 2 caracteres';
  END IF;

  v_digits     := regexp_replace(v_search, '\D', '', 'g');
  v_safe_limit := LEAST(GREATEST(p_limit, 1), 20);

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.phone,
      u.email::text,
      p.is_partner,
      p.price_list_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
      AND (
        p.full_name ILIKE '%' || v_search || '%'
        OR (
          v_digits <> '' AND
          regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') ILIKE '%' || v_digits || '%'
        )
      )
    ORDER BY p.full_name ASC
    LIMIT v_safe_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_customers_for_salao(text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.search_customers_for_salao(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
