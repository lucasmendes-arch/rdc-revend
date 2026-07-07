-- ============================================================================
-- Migration: 20260707000005_stock_counts_history_employee_name.sql
-- Módulo de Estoque — expõe employee_name na view de histórico
--
-- Complementa 20260707000004: a tela /estoque/historico precisa do nome
-- digitado pelo colaborador, não só do employee_id (login compartilhado).
-- ============================================================================

CREATE OR REPLACE VIEW public.stock_counts_history
WITH (security_invoker = true) AS
SELECT
  sc.id,
  sc.store_id,
  sc.employee_id,
  sc.status,
  sc.created_at,
  sc.confirmed_at,
  GREATEST(sc.created_at, sc.confirmed_at, MAX(sci.updated_at)) AS last_activity_at,
  sc.employee_name
FROM public.stock_counts sc
LEFT JOIN public.stock_count_items sci ON sci.stock_count_id = sc.id
GROUP BY sc.id;

COMMENT ON VIEW public.stock_counts_history IS
  'stock_counts + last_activity_at (maior entre created_at, confirmed_at e '
  'updated_at dos itens). Usada pela tela /estoque/historico.';

GRANT SELECT ON public.stock_counts_history TO authenticated;
GRANT SELECT ON public.stock_counts_history TO service_role;
