-- ============================================================================
-- Migration: 20260412000007_fix_catalog_anon_sort_order.sql
-- Hotfix produção: grant SELECT em sort_order para anon
--
-- Contexto:
--   20260324000015 trocou o acesso de anon em catalog_products de table-level
--   para column-level (excluindo partner_price). A coluna sort_order foi
--   adicionada depois (20260410000003) sem atualizar o grant.
--   PostgREST retorna 401 quando anon tenta ORDER BY sort_order sem privilégio
--   nessa coluna.
-- ============================================================================

GRANT SELECT (sort_order) ON public.catalog_products TO anon;

-- Force schema reload para PostgREST reconhecer a alteração imediatamente
NOTIFY pgrst, 'reload schema';
