-- ============================================================================
-- Migration: 20260704000002_stock_counts_history_view.sql
-- Módulo de Estoque — view com "última atualização" por contagem
--
-- A tela /estoque/historico precisa mostrar quando a contagem foi mexida pela
-- última vez. stock_counts não tem updated_at, mas stock_count_items.updated_at
-- é mantido por trigger a cada upsert — a última atividade da contagem é o
-- maior updated_at entre os itens (ou created_at/confirmed_at, o que for maior).
--
-- security_invoker: a view respeita o RLS das tabelas base (admin vê tudo,
-- colaborador só a própria loja) — mesmo padrão de stock_countable_products.
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
  -- GREATEST ignora NULLs — sempre resolve pra um timestamp válido.
  GREATEST(sc.created_at, sc.confirmed_at, MAX(sci.updated_at)) AS last_activity_at
FROM public.stock_counts sc
LEFT JOIN public.stock_count_items sci ON sci.stock_count_id = sc.id
GROUP BY sc.id;

COMMENT ON VIEW public.stock_counts_history IS
  'stock_counts + last_activity_at (maior entre created_at, confirmed_at e '
  'updated_at dos itens). Usada pela tela /estoque/historico.';

-- Projeto não tem grants padrão (ver memory) — conceder explicitamente.
GRANT SELECT ON public.stock_counts_history TO authenticated;
GRANT SELECT ON public.stock_counts_history TO service_role;
