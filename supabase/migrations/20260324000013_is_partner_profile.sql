-- ============================================================================
-- Migration: 20260324000013_is_partner_profile.sql
-- Description: Adiciona coluna is_partner em profiles e atualiza a busca do salão
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_partner boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.profiles.is_partner IS 'Define se o cliente tem acesso aos precos de atacado (partner_price)';

-- Atualizando a RPC search_customers_for_salao para incluir is_partner
CREATE OR REPLACE FUNCTION public.search_customers_for_salao(
  p_search  text,
  p_limit   int DEFAULT 10
)
RETURNS TABLE (
  id         uuid,
  full_name  text,
  phone      text,
  email      text,
  is_partner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_search   text;
  v_safe_limit int;
BEGIN
  -- Verificação de autorização: salao ou admin
  IF NOT (public.is_salao() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Acesso negado: requer role salao ou admin';
  END IF;

  -- Sanitizar entrada
  v_search := TRIM(COALESCE(p_search, ''));
  IF length(v_search) < 2 THEN
    RAISE EXCEPTION 'Busca deve ter ao menos 2 caracteres';
  END IF;

  -- Limitar resultados (ceiling de segurança)
  v_safe_limit := LEAST(GREATEST(p_limit, 1), 20);

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.phone,
      u.email,
      p.is_partner
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
      AND (
        p.full_name ILIKE '%' || v_search || '%'
        OR p.phone ILIKE '%' || v_search || '%'
      )
    ORDER BY p.full_name ASC
    LIMIT v_safe_limit;
END;
$$;

-- ============================================================================
-- Atualizando a RPC get_all_profiles() usada pelo Admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  business_type text,
  email text,
  is_partner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas admins podem listar todos
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT 
      p.id, p.full_name, p.phone, p.business_type, u.email::text, p.is_partner
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
    ORDER BY p.full_name ASC;
END;
$$;
