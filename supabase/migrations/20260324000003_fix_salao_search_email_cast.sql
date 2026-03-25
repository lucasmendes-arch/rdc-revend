-- ============================================================================
-- Migration: 20260324000003_fix_salao_search_email_cast.sql
-- BLOCO 3A — Fix: type mismatch em search_customers_for_salao()
--
-- Problema: auth.users.email é varchar(255), mas a RPC declarava
--           retorno como text. PostgreSQL rejeita com erro 42804:
--           "Returned type character varying(255) does not match
--            expected type text in column 4."
--
-- Fix: Cast u.email::text na query interna.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_customers_for_salao(
  p_search  text,
  p_limit   int DEFAULT 10
)
RETURNS TABLE (
  id        uuid,
  full_name text,
  phone     text,
  email     text
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
  IF NOT (is_salao() OR is_admin()) THEN
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
      u.email::text   -- FIX: cast varchar(255) → text
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
