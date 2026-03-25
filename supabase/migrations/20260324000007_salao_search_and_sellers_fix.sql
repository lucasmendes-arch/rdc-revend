-- ============================================================================
-- Migration: 20260324000007_salao_search_and_sellers_fix.sql
-- BLOCO 3A — Fix: Correção fina da busca e acesso aos vendedores
--
-- 1. Corrige o match universal: se o termo digitado (v_search) for
--    apenas letras (ex: 're'), regexp_replace('\D') ficava vazio ('')
--    e a condição `phone ILIKE '%%'` retornava todos os clientes da base.
--
-- 2. Altera a política de leitura de Vendedores (sellers) para garantir
--    que tanto Admin testando a tela, quanto Salão, consigam ler, ou
--    simplesmente libera leitura para todo usuário autenticado (seguro).
-- ============================================================================

-- ── 1. Fix do Search ────────────────────────────────────────────────────────
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
  v_digits   text;
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

  -- Extrair apenas dígitos para testar o telefone
  v_digits := regexp_replace(v_search, '\D', '', 'g');

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
        OR (
          v_digits <> '' AND 
          regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') ILIKE '%' || v_digits || '%'
        )
      )
    ORDER BY p.full_name ASC
    LIMIT v_safe_limit;
END;
$$;

-- ── 2. Fix do RLS na Sellers ───────────────────────────────────────────────
DO $$
BEGIN
  -- Substituir política restrita para uma mais ampla se aplicável
  DROP POLICY IF EXISTS "Vendedores visíveis para salao" ON public.sellers;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sellers' AND policyname = 'Leitura de vendedores permitida'
  ) THEN
    CREATE POLICY "Leitura de vendedores permitida"
      ON public.sellers
      FOR SELECT
      TO authenticated
      USING ( true );  -- Qualquer request autenticado (admin/salao) vê a lista
  END IF;
END
$$;
