-- Taxa de retorno em 90 dias no CRM dos salões.
--
-- salon_clients ganha second_visit (2º dia com comanda paga), calculado em
-- salon_crm_refresh — cópia fiel da 20261009000006 (conferida por md5 com o
-- banco em 2026-10-09) com só essa coluna a mais.

ALTER TABLE public.salon_clients ADD COLUMN IF NOT EXISTS second_visit date;

CREATE OR REPLACE FUNCTION public.salon_crm_refresh(p_store_id uuid)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fin   date := trinks_csv_covered_through(p_store_id, 'financeiro');
  v_ag    date := trinks_csv_covered_through(p_store_id, 'agendamentos');
  v_rows  int;
BEGIN
  -- Fechamento → cliente. O fechamento traz o ID do Trinks e o nome, mas não
  -- o telefone; o cadastro traz telefone, mas não o ID. Ponte, em ordem:
  --   1) agendamento do mesmo dia com o mesmo nome (tem a chave do cadastro);
  --   2) nome único no cadastro da unidade;
  --   3) sem ponte: chave 'tid:<id>' (entra nas métricas, sem contato).
  CREATE TEMP TABLE IF NOT EXISTS _salon_map (trinks_client_id bigint PRIMARY KEY, client_key text) ON COMMIT DROP;
  TRUNCATE _salon_map;

  INSERT INTO _salon_map
  WITH tx AS (
    SELECT DISTINCT trinks_client_id, salon_norm_name(client_name) AS n, service_date
      FROM trinks_transactions
     WHERE store_id = p_store_id AND kind = 'pagamento' AND trinks_client_id IS NOT NULL
  ),
  appt AS (
    SELECT DISTINCT appointment_date, salon_norm_name(client_name) AS n, client_key
      FROM trinks_appointments
     WHERE store_id = p_store_id AND client_key IS NOT NULL
  ),
  via_appt AS (
    SELECT tx.trinks_client_id, appt.client_key, count(*) AS c
      FROM tx JOIN appt ON appt.appointment_date = tx.service_date AND appt.n = tx.n
     GROUP BY 1, 2
  ),
  best_appt AS (
    SELECT DISTINCT ON (trinks_client_id) trinks_client_id, client_key
      FROM via_appt ORDER BY trinks_client_id, c DESC, client_key
  ),
  names AS (
    SELECT salon_norm_name(name) AS n, min(client_key) AS k, count(*) AS cnt
      FROM trinks_clients WHERE store_id = p_store_id GROUP BY 1
  ),
  tx_name AS (
    SELECT DISTINCT ON (trinks_client_id) trinks_client_id, n
      FROM tx ORDER BY trinks_client_id, service_date DESC
  )
  SELECT tn.trinks_client_id,
         coalesce(b.client_key, CASE WHEN nm.cnt = 1 THEN nm.k END, 'tid:' || tn.trinks_client_id)
    FROM tx_name tn
    LEFT JOIN best_appt b USING (trinks_client_id)
    LEFT JOIN names nm ON nm.n = tn.n;

  DELETE FROM salon_clients WHERE store_id = p_store_id;

  INSERT INTO salon_clients (
    store_id, client_key, name, phone, whatsapp, email, gender, birth_date, registered_on, tags,
    origin, acquisition_channel, trinks_client_ids,
    visits_count, first_visit, second_visit, last_visit, total_spent, services_spent, products_spent,
    avg_ticket, avg_interval_days,
    appointments_count, no_shows, cancellations, last_appointment_on, last_appointment_status,
    next_appointment_on, favorite_service, favorite_professional, refreshed_at
  )
  WITH t AS (
    SELECT m.client_key,
           array_agg(DISTINCT t.trinks_client_id) AS ids,
           max(t.client_name) AS any_name,
           count(*) AS visits, min(t.business_date) AS first_v, max(t.business_date) AS last_v,
           -- 2º DIA com comanda: duas comandas no mesmo dia não são retorno.
           (array_agg(DISTINCT t.business_date ORDER BY t.business_date))[2] AS second_v,
           sum(t.total) AS spent, sum(t.services_total) AS serv, sum(t.products_total) AS prod
      FROM trinks_transactions t JOIN _salon_map m USING (trinks_client_id)
     WHERE t.store_id = p_store_id AND t.kind = 'pagamento'
       AND (t.source = 'csv' OR t.business_date > v_fin)
     GROUP BY 1
  ),
  a AS (
    SELECT client_key,
           max(client_name) AS any_name,
           max(client_phones) AS any_phone,
           count(*) AS appts,
           count(*) FILTER (WHERE status = 'Cliente não compareceu') AS no_shows,
           count(*) FILTER (WHERE status = 'Cancelado') AS cancels,
           max(appointment_date) FILTER (WHERE appointment_date <= current_date) AS last_appt,
           (array_agg(status ORDER BY appointment_date DESC, starts_at DESC)
              FILTER (WHERE appointment_date <= current_date))[1] AS last_status,
           min(appointment_date) FILTER (WHERE appointment_date > current_date
                                           AND status NOT IN ('Cancelado', 'Cliente não compareceu')) AS next_appt,
           mode() WITHIN GROUP (ORDER BY service) FILTER (WHERE status = 'Finalizado') AS fav_service,
           mode() WITHIN GROUP (ORDER BY professional) FILTER (WHERE status = 'Finalizado') AS fav_prof
      FROM trinks_appointments
     WHERE store_id = p_store_id AND client_key IS NOT NULL
       AND (source = 'csv' OR appointment_date > v_ag)
     GROUP BY 1
  ),
  keys AS (
    SELECT client_key FROM trinks_clients WHERE store_id = p_store_id
    UNION SELECT client_key FROM a
    UNION SELECT client_key FROM t
  )
  SELECT p_store_id, k.client_key,
         coalesce(c.name, a.any_name, t.any_name, 'Cliente'),
         coalesce(c.phone_1, a.any_phone),
         salon_whatsapp(coalesce(c.phone_1, a.any_phone)),
         c.email, c.gender,
         -- "07/01/1904" e afins são placeholder de cadastro, não aniversário.
         CASE WHEN c.birth_date >= '1920-01-01' THEN c.birth_date END,
         c.registered_on, c.tags, c.origin, c.acquisition_channel, t.ids,
         coalesce(t.visits, 0), t.first_v, t.second_v, t.last_v,
         coalesce(t.spent, 0), coalesce(t.serv, 0), coalesce(t.prod, 0),
         CASE WHEN t.visits > 0 THEN round(t.spent / t.visits, 2) END,
         CASE WHEN t.visits > 1 THEN round((t.last_v - t.first_v)::numeric / (t.visits - 1), 1) END,
         coalesce(a.appts, 0), coalesce(a.no_shows, 0), coalesce(a.cancels, 0),
         a.last_appt, a.last_status, a.next_appt,
         a.fav_service, regexp_replace(a.fav_prof, '^\d+\s+', ''),
         now()
    FROM keys k
    LEFT JOIN trinks_clients c ON c.store_id = p_store_id AND c.client_key = k.client_key
    LEFT JOIN a ON a.client_key = k.client_key
    LEFT JOIN t ON t.client_key = k.client_key;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Indicador em salon_crm_overview: das clientes cuja 1ª visita foi entre 15 e
-- 3 meses antes da data de referência da unidade (todas tiveram 90 dias
-- inteiros para voltar), quantas voltaram em até 90 dias.
--   cohort_90     clientes do grupo
--   returned_90   voltaram em até 90 dias
-- second_visit vem de salon_clients pela chave (a view não expõe a coluna).
CREATE OR REPLACE FUNCTION public.salon_crm_overview(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH f AS (
    SELECT v.status, v.visits_count, v.total_spent, v.products_spent, v.avg_interval_days, v.no_shows,
           v.next_appointment_on, v.missed_unresolved, v.whatsapp, v.opted_out, v.birth_date,
           v.first_visit, v.ref_date, c.second_visit
      FROM salon_crm_filter(coalesce(p_filters, '{}'::jsonb) - 'statuses') v
      LEFT JOIN salon_clients c ON c.store_id = v.store_id AND c.client_key = v.client_key
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
               'cohort_90',         count(*) FILTER (WHERE first_visit <= ref_date - 90
                                                       AND first_visit >  ref_date - 455),
               'returned_90',       count(*) FILTER (WHERE first_visit <= ref_date - 90
                                                       AND first_visit >  ref_date - 455
                                                       AND second_visit <= first_visit + 90),
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

-- Preenche second_visit já (o cron de hora em hora manteria depois).
SELECT public.salon_crm_refresh_all();
