-- CRM dos salões: contagem por situação + indicadores de retorno e fidelização
-- numa chamada só (a tela de Clientes fazia uma por quadro, e cada passada em
-- salon_clients_v custa ~1s). Mesmos filtros da lista, sem o de situação.
--
--   with_purchase  clientes com pelo menos 1 visita
--   returned       clientes com 2+ visitas            → taxa de retorno
--   recent         com compra e não "perdida" (<1 ano)
--   active         situação "ativa" (voltando no ritmo) → taxa de fidelização = active / recent

CREATE OR REPLACE FUNCTION public.salon_crm_overview(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH f AS (SELECT status, visits_count FROM salon_crm_filter(coalesce(p_filters, '{}'::jsonb) - 'statuses'))
  SELECT jsonb_build_object(
    'statuses', coalesce((SELECT jsonb_object_agg(status, n)
                            FROM (SELECT status, count(*) AS n FROM f GROUP BY status) x), '{}'::jsonb),
    'kpis', (SELECT jsonb_build_object(
               'with_purchase', count(*) FILTER (WHERE visits_count > 0),
               'returned',      count(*) FILTER (WHERE visits_count >= 2),
               'recent',        count(*) FILTER (WHERE visits_count > 0 AND status <> 'perdida'),
               'active',        count(*) FILTER (WHERE status = 'ativa'))
               FROM f)
  )
$$;

REVOKE ALL ON FUNCTION public.salon_crm_overview(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salon_crm_overview(jsonb) TO authenticated, service_role;
