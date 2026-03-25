-- ============================================================================
-- Migration: 20260324000008_fix_sellers_security.sql
-- BLOCO 3A — Fix: Isolamento de Vendedores e RPC Segura
--
-- 1. Remove políticas excessivamente permissivas introduzidas
--    recentemente nas migrations 06 e 07.
--
-- 2. Cria uma Function RPC (get_active_sellers_for_dropdown)
--    baseada em Security Definer, que filtra e restringe os dados
--    (apenas id, name e code para sellers ativos).
-- ============================================================================

-- ── 1. Revogar políticas amplas ─────────────────────────────────────────────
DO $$
BEGIN
  -- Remover a policy que dava acesso total a qualquer autenticado
  DROP POLICY IF EXISTS "Leitura de vendedores permitida" ON public.sellers;
  
  -- Remover a policy falha da migration 06 se ainda existir
  DROP POLICY IF EXISTS "Vendedores visíveis para salao" ON public.sellers;
END
$$;

-- ── 2. Criar RPC segura para o frontend ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_sellers_for_dropdown()
RETURNS TABLE (
  id   uuid,
  name text,
  code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- 1. Checagem rígida de permissão: Admins ou operadores de Salão autorizados
  IF NOT (public.is_admin() OR public.is_salao()) THEN
    RAISE EXCEPTION 'Acesso negado: requer role salao ou admin';
  END IF;

  -- 2. Retornar apenas colunas minimais de vendedores ativos explícitos
  RETURN QUERY
    SELECT 
      s.id, 
      s.name, 
      s.code
    FROM public.sellers s
    WHERE s.active = true
    ORDER BY s.name ASC;
END;
$$;

-- ── 3. Permissões Explicitas ────────────────────────────────────────────────
-- O PostgREST do Supabase concede EXECUTE no schema public a 'PUBLIC' por 
-- padrão. Para blindar a function, revogamos esse aspecto global e amarramos
-- estritamente aos clients validados (authenticated).
REVOKE EXECUTE ON FUNCTION public.get_active_sellers_for_dropdown() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_sellers_for_dropdown() TO authenticated;
