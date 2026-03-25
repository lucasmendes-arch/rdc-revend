-- ============================================================================
-- Migration: 20260324000004_salao_search_phone_fix.sql
-- BLOCO 3A — Fix: Normalização da busca por telefone
--
-- Problema: A busca por telefone (RPC search_customers_for_salao) usava
--           ILIKE estrito. Se o usuário digitasse apenas números, não
--           encontrava clientes com telefone formatado no banco (ex: (27)...).
--
-- Fix: Usar regexp_replace para ignorar não-dígitos (\D) tanto no banco
--      quanto no termo de busca (v_search).
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
        OR regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') ILIKE '%' || regexp_replace(v_search, '\D', '', 'g') || '%'
      )
    ORDER BY p.full_name ASC
    LIMIT v_safe_limit;
END;
$$;
