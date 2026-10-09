-- CRM dos salões: mais indicadores em salon_crm_overview (mesma passada única
-- em salon_clients_v; mesma assinatura, então os grants da 000022 continuam).
-- Taxas são montadas no front a partir destas contagens/somas.
--
--   total              clientes da seleção (inclui sem compra)
--   with_purchase      1+ visita
--   returned           2+ visitas
--   recent             com compra e não "perdida"
--   active             "ativa"
--   active_scheduled   "ativa" com próximo horário marcado
--   at_risk            "em_risco"
--   churned            "sumida" + "perdida"
--   revenue            soma do gasto de quem comprou
--   visits             soma de visitas de quem comprou
--   top20_revenue      gasto dos 20% que mais gastam (concentração)
--   avg_interval_days  intervalo médio entre visitas (quem tem 2+)
--   with_no_show       1+ falta;   repeat_no_show  2+ faltas
--   missed_unresolved  cancelou/faltou e não remarcou
--   product_buyers     já comprou produto
--   reachable          WhatsApp válido e sem opt-out
--   with_birthday      aniversário cadastrado

CREATE OR REPLACE FUNCTION public.salon_crm_overview(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH f AS (
    SELECT status, visits_count, total_spent, products_spent, avg_interval_days, no_shows,
           next_appointment_on, missed_unresolved, whatsapp, opted_out, birth_date
      FROM salon_crm_filter(coalesce(p_filters, '{}'::jsonb) - 'statuses')
  ),
  buyers AS (
    SELECT total_spent,
           row_number() OVER (ORDER BY total_spent DESC) AS rn,
           count(*) OVER () AS n
      FROM f WHERE visits_count > 0
  )
  SELECT jsonb_build_object(
    'statuses', coalesce((SELECT jsonb_object_agg(status, n)
                            FROM (SELECT status, count(*) AS n FROM f GROUP BY status) x), '{}'::jsonb),
    'kpis', (SELECT jsonb_build_object(
               'total',             count(*),
               'with_purchase',     count(*) FILTER (WHERE visits_count > 0),
               'returned',          count(*) FILTER (WHERE visits_count >= 2),
               'recent',            count(*) FILTER (WHERE visits_count > 0 AND status <> 'perdida'),
               'active',            count(*) FILTER (WHERE status = 'ativa'),
               'active_scheduled',  count(*) FILTER (WHERE status = 'ativa' AND next_appointment_on IS NOT NULL),
               'at_risk',           count(*) FILTER (WHERE status = 'em_risco'),
               'churned',           count(*) FILTER (WHERE status IN ('sumida', 'perdida')),
               'revenue',           coalesce(sum(total_spent) FILTER (WHERE visits_count > 0), 0),
               'visits',            coalesce(sum(visits_count) FILTER (WHERE visits_count > 0), 0),
               'top20_revenue',     (SELECT coalesce(sum(total_spent), 0) FROM buyers WHERE rn <= ceil(n * 0.2)),
               'avg_interval_days', round(avg(avg_interval_days) FILTER (WHERE visits_count >= 2), 1),
               'with_no_show',      count(*) FILTER (WHERE no_shows >= 1),
               'repeat_no_show',    count(*) FILTER (WHERE no_shows >= 2),
               'missed_unresolved', count(*) FILTER (WHERE missed_unresolved),
               'product_buyers',    count(*) FILTER (WHERE products_spent > 0),
               'reachable',         count(*) FILTER (WHERE whatsapp IS NOT NULL AND NOT opted_out),
               'with_birthday',     count(*) FILTER (WHERE birth_date IS NOT NULL))
               FROM f)
  )
$$;
