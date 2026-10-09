-- ============================================================================
-- CRM dos salões (clientes das unidades) — estrutura, sem disparo
--
-- Prefixo salon_ de propósito: as tabelas crm_* são do CRM B2B removido em
-- 2026-07-13 e continuam dormentes no banco (ver private-docs/memory.md).
--
--   salon_clients               resumo por cliente × unidade (recalculado)
--   salon_clients_v             + dias sem vir, situação, aniversário, opt-out
--   salon_segments              públicos salvos (os de sistema vêm semeados)
--   salon_campaigns             campanha = público + mensagem + unidade
--   salon_campaign_recipients   lista congelada de destinatárias
--   salon_contacts              registro de contato (manual ou de campanha)
--   salon_opt_outs              quem não quer receber mensagem
--   salon_crm_settings          regras de envio (disparo ainda DESLIGADO)
--
-- Fontes: trinks_clients (cadastro), trinks_transactions (visitas e gasto),
-- trinks_appointments (serviços, profissional, faltas). Mesma precedência
-- CSV × webhook dos resumos do dashboard (trinks_csv_covered_through).
--
-- Acesso: só admin (is_admin()). Contém dados pessoais com consentimento
-- LGPD da rede.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. salon_clients
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_clients (
  store_id               uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_key             text NOT NULL,      -- mesma chave de trinks_clients; 'tid:<id>' = só há fechamentos
  name                   text NOT NULL,
  phone                  text,               -- como veio do Trinks
  whatsapp               text,               -- só dígitos com DDI 55, pronto para envio
  email                  text,
  gender                 text,
  birth_date             date,
  registered_on          date,
  tags                   text[],
  origin                 text,
  acquisition_channel    text,
  trinks_client_ids      bigint[],

  visits_count           int NOT NULL DEFAULT 0,       -- comandas pagas
  first_visit            date,
  last_visit             date,
  total_spent            numeric(12,2) NOT NULL DEFAULT 0,
  services_spent         numeric(12,2) NOT NULL DEFAULT 0,
  products_spent         numeric(12,2) NOT NULL DEFAULT 0,
  avg_ticket             numeric(12,2),
  avg_interval_days      numeric(8,1),                 -- média entre visitas (2+ visitas)

  appointments_count     int NOT NULL DEFAULT 0,
  no_shows               int NOT NULL DEFAULT 0,
  cancellations          int NOT NULL DEFAULT 0,
  last_appointment_on    date,
  last_appointment_status text,
  next_appointment_on    date,
  favorite_service       text,
  favorite_professional  text,

  refreshed_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, client_key)
);

CREATE INDEX IF NOT EXISTS idx_salon_clients_last_visit ON public.salon_clients (store_id, last_visit);
CREATE INDEX IF NOT EXISTS idx_salon_clients_whatsapp   ON public.salon_clients (whatsapp);


-- ----------------------------------------------------------------------------
-- 2. Tabelas operacionais
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_opt_outs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp    text NOT NULL UNIQUE,
  reason      text,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'resposta')),
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salon_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system   boolean NOT NULL DEFAULT false,
  sort_order  int NOT NULL DEFAULT 100,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salon_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  store_id         uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  segment_id       uuid REFERENCES public.salon_segments(id) ON DELETE SET NULL,
  filters          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- cópia do público no momento da criação
  message          text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho', 'pronta', 'enviando', 'pausada', 'concluida', 'cancelada')),
  recipients_count int NOT NULL DEFAULT 0,
  excluded         jsonb,                                 -- quantas ficaram de fora e por quê
  list_built_at    timestamptz,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salon_campaign_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES public.salon_campaigns(id) ON DELETE CASCADE,
  store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_key   text NOT NULL,
  name         text NOT NULL,
  whatsapp     text NOT NULL,
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'pendente'
               CHECK (status IN ('pendente', 'enviada', 'falhou', 'pulada', 'optout')),
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salon_campaign_recipients_unique UNIQUE (campaign_id, whatsapp)
);
CREATE INDEX IF NOT EXISTS idx_salon_recipients_whatsapp ON public.salon_campaign_recipients (whatsapp, sent_at);

CREATE TABLE IF NOT EXISTS public.salon_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_key   text NOT NULL,
  channel      text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'ligacao', 'presencial', 'outro')),
  campaign_id  uuid REFERENCES public.salon_campaigns(id) ON DELETE SET NULL,
  outcome      text,
  note         text,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salon_contacts_client ON public.salon_contacts (store_id, client_key, created_at DESC);

-- Regras de envio definidas pelo usuário em 2026-10-09. dispatch_enabled
-- fica false até o disparo automático ser construído e liberado.
CREATE TABLE IF NOT EXISTS public.salon_crm_settings (
  id                     int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  send_weekdays          int[] NOT NULL DEFAULT '{1,2,3,4}',   -- ISO: 1=seg … 4=qui
  window_start           time NOT NULL DEFAULT '08:00',
  window_end             time NOT NULL DEFAULT '18:00',
  daily_cap_per_number   int NOT NULL DEFAULT 80,
  min_interval_seconds   int NOT NULL DEFAULT 120,
  max_interval_seconds   int NOT NULL DEFAULT 240,
  cooldown_days          int NOT NULL DEFAULT 30,              -- não repetir a mesma cliente antes disso
  dispatch_enabled       boolean NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.salon_crm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;


-- RLS: tudo admin. Escrita direta pelo front (admin), sem SECURITY DEFINER
-- (regra do projeto: não depender de DEFINER para furar RLS).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['salon_clients', 'salon_opt_outs', 'salon_segments', 'salon_campaigns',
                           'salon_campaign_recipients', 'salon_contacts', 'salon_crm_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "admin_all_%s" ON public.%I FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 3. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salon_norm_name(p text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT btrim(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- "(27) 99999-0001" → "5527999990001". Só números brasileiros com DDD.
CREATE OR REPLACE FUNCTION public.salon_whatsapp(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d ~ '^55\d{10,11}$' THEN d
    WHEN d ~ '^\d{10,11}$' THEN '55' || d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(split_part(coalesce(p, ''), '/', 1), '\D', '', 'g') AS d) x
$$;


-- ----------------------------------------------------------------------------
-- 4. salon_crm_refresh(store) — recalcula o resumo de uma unidade
-- ----------------------------------------------------------------------------
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
    visits_count, first_visit, last_visit, total_spent, services_spent, products_spent,
    avg_ticket, avg_interval_days,
    appointments_count, no_shows, cancellations, last_appointment_on, last_appointment_status,
    next_appointment_on, favorite_service, favorite_professional, refreshed_at
  )
  WITH t AS (
    SELECT m.client_key,
           array_agg(DISTINCT t.trinks_client_id) AS ids,
           max(t.client_name) AS any_name,
           count(*) AS visits, min(t.business_date) AS first_v, max(t.business_date) AS last_v,
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
         coalesce(t.visits, 0), t.first_v, t.last_v,
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

CREATE OR REPLACE FUNCTION public.salon_crm_refresh_all() RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE r record; out jsonb := '{}'::jsonb;
BEGIN
  FOR r IN SELECT u.store_id, s.slug FROM trinks_units u JOIN stores s ON s.id = u.store_id WHERE u.active LOOP
    out := out || jsonb_build_object(r.slug, salon_crm_refresh(r.store_id));
  END LOOP;
  RETURN out;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. salon_clients_v — situação calculada na hora
--
-- "Dias sem vir" contam até o último dia com faturamento da UNIDADE, não até
-- hoje: unidade com relatório velho ficaria inteira "sumida" por falta de
-- dado, não por falta de cliente.
--
-- Situação (ritmo = intervalo médio da própria cliente, mínimo 21 dias,
-- 45 quando ela só tem uma visita):
--   sem_compra  nenhuma comanda paga (só cadastro/agendamento)
--   nova        1 visita, até 30 dias
--   uma_visita  1 visita, 31–365 dias
--   ativa       2+ visitas, dentro de 1,5× o ritmo
--   em_risco    2+ visitas, entre 1,5× e 2,5× o ritmo
--   sumida      2+ visitas, além de 2,5× o ritmo, até 365 dias
--   perdida     mais de 365 dias sem vir
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.salon_clients_v
WITH (security_invoker = true) AS
SELECT c.*,
       s.name AS store_name,
       ref.ref_date,
       (ref.ref_date - c.last_visit) AS days_since_last_visit,
       CASE
         WHEN c.visits_count = 0 THEN 'sem_compra'
         WHEN (ref.ref_date - c.last_visit) > 365 THEN 'perdida'
         WHEN c.visits_count = 1 AND (ref.ref_date - c.last_visit) <= 30 THEN 'nova'
         WHEN c.visits_count = 1 THEN 'uma_visita'
         WHEN (ref.ref_date - c.last_visit) <= 1.5 * greatest(coalesce(c.avg_interval_days, 45), 21) THEN 'ativa'
         WHEN (ref.ref_date - c.last_visit) <= 2.5 * greatest(coalesce(c.avg_interval_days, 45), 21) THEN 'em_risco'
         ELSE 'sumida'
       END AS status,
       extract(month FROM c.birth_date)::int AS birth_month,
       extract(day FROM c.birth_date)::int AS birth_day,
       EXISTS (SELECT 1 FROM salon_opt_outs o WHERE o.whatsapp = c.whatsapp) AS opted_out,
       (SELECT max(r.sent_at) FROM salon_campaign_recipients r
         WHERE r.whatsapp = c.whatsapp AND r.status = 'enviada') AS last_campaign_at
  FROM salon_clients c
  JOIN stores s ON s.id = c.store_id
  CROSS JOIN LATERAL (
    SELECT coalesce(
      (SELECT max(business_date) FROM trinks_daily_revenue d
        WHERE d.store_id = c.store_id AND d.gross_revenue > 0),
      current_date) AS ref_date
  ) ref;

GRANT SELECT ON public.salon_clients_v TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 6. salon_crm_search(filters, sort, limit, offset)
--
-- Filtros aceitos (todos opcionais; chave desconhecida é ignorada):
--   store_id, statuses[], search (nome/telefone), days_since_min/max,
--   visits_min/max, spent_min/max, ticket_min/max, only_products (bool),
--   tags_any[], birthday ('this_month'|'next_month'|'next_7_days'),
--   favorite_service, favorite_professional, no_shows_min, has_whatsapp (bool),
--   include_opted_out (bool, padrão false), exclude_future_appointment (bool),
--   registered_from/to, last_visit_from/to
-- sort: last_visit_desc (padrão) | last_visit_asc | spent_desc | visits_desc |
--       days_since_desc | name
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salon_crm_filter(f jsonb)
RETURNS SETOF public.salon_clients_v
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT v.* FROM salon_clients_v v
   WHERE (f->>'store_id' IS NULL OR v.store_id = (f->>'store_id')::uuid)
     AND (jsonb_typeof(f->'statuses') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'statuses') = 0
          OR v.status IN (SELECT jsonb_array_elements_text(f->'statuses')))
     AND (coalesce(f->>'search', '') = ''
          OR salon_norm_name(v.name) LIKE '%' || salon_norm_name(f->>'search') || '%'
          OR (regexp_replace(f->>'search', '\D', '', 'g') <> ''
              AND v.whatsapp LIKE '%' || regexp_replace(f->>'search', '\D', '', 'g') || '%'))
     AND (f->>'days_since_min' IS NULL OR v.days_since_last_visit >= (f->>'days_since_min')::int)
     AND (f->>'days_since_max' IS NULL OR v.days_since_last_visit <= (f->>'days_since_max')::int)
     AND (f->>'visits_min' IS NULL OR v.visits_count >= (f->>'visits_min')::int)
     AND (f->>'visits_max' IS NULL OR v.visits_count <= (f->>'visits_max')::int)
     AND (f->>'spent_min' IS NULL OR v.total_spent >= (f->>'spent_min')::numeric)
     AND (f->>'spent_max' IS NULL OR v.total_spent <= (f->>'spent_max')::numeric)
     AND (f->>'ticket_min' IS NULL OR v.avg_ticket >= (f->>'ticket_min')::numeric)
     AND (f->>'ticket_max' IS NULL OR v.avg_ticket <= (f->>'ticket_max')::numeric)
     AND (coalesce((f->>'only_products')::boolean, false) = false
          OR (v.visits_count > 0 AND v.services_spent = 0 AND v.products_spent > 0))
     AND (jsonb_typeof(f->'tags_any') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'tags_any') = 0
          OR v.tags && ARRAY(SELECT jsonb_array_elements_text(f->'tags_any')))
     AND (f->>'birthday' IS NULL
          OR (f->>'birthday' = 'this_month' AND v.birth_month = extract(month FROM current_date))
          OR (f->>'birthday' = 'next_month' AND v.birth_month = extract(month FROM current_date + interval '1 month'))
          OR (f->>'birthday' = 'next_7_days' AND v.birth_date IS NOT NULL AND
              make_date(extract(year FROM current_date)::int, v.birth_month,
                        least(v.birth_day, 28 + CASE WHEN v.birth_month = 2 THEN 0 ELSE 2 END))
              BETWEEN current_date AND current_date + 7))
     AND (coalesce(f->>'favorite_service', '') = '' OR v.favorite_service = f->>'favorite_service')
     AND (coalesce(f->>'favorite_professional', '') = '' OR v.favorite_professional = f->>'favorite_professional')
     AND (f->>'no_shows_min' IS NULL OR v.no_shows >= (f->>'no_shows_min')::int)
     AND (coalesce((f->>'has_whatsapp')::boolean, false) = false OR v.whatsapp IS NOT NULL)
     AND (coalesce((f->>'include_opted_out')::boolean, false) OR NOT v.opted_out)
     AND (coalesce((f->>'exclude_future_appointment')::boolean, false) = false OR v.next_appointment_on IS NULL)
     AND (f->>'registered_from' IS NULL OR v.registered_on >= (f->>'registered_from')::date)
     AND (f->>'registered_to'   IS NULL OR v.registered_on <= (f->>'registered_to')::date)
     AND (f->>'last_visit_from' IS NULL OR v.last_visit >= (f->>'last_visit_from')::date)
     AND (f->>'last_visit_to'   IS NULL OR v.last_visit <= (f->>'last_visit_to')::date)
$$;

CREATE OR REPLACE FUNCTION public.salon_crm_search(
  p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'last_visit_desc',
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH f AS (SELECT * FROM salon_crm_filter(coalesce(p_filters, '{}'::jsonb))),
  page AS (
    SELECT * FROM f
     ORDER BY
       CASE WHEN p_sort = 'spent_desc' THEN total_spent END DESC NULLS LAST,
       CASE WHEN p_sort = 'visits_desc' THEN visits_count END DESC NULLS LAST,
       CASE WHEN p_sort = 'days_since_desc' THEN days_since_last_visit END DESC NULLS LAST,
       CASE WHEN p_sort = 'last_visit_asc' THEN last_visit END ASC NULLS LAST,
       CASE WHEN p_sort = 'name' THEN name END ASC,
       last_visit DESC NULLS LAST, name
     LIMIT least(greatest(p_limit, 1), 5000) OFFSET greatest(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'with_whatsapp', (SELECT count(*) FROM f WHERE whatsapp IS NOT NULL),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)
  )
$$;

-- Contagem por situação (os "chips" da tela), respeitando os demais filtros.
CREATE OR REPLACE FUNCTION public.salon_crm_status_counts(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
    FROM (SELECT status, count(*) AS n
            FROM salon_crm_filter(coalesce(p_filters, '{}'::jsonb) - 'statuses')
           GROUP BY status) x
$$;


-- ----------------------------------------------------------------------------
-- 7. Ficha da cliente: linha do tempo (visitas, agendamentos, itens)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salon_crm_client_timeline(p_store_id uuid, p_client_key text)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH c AS (SELECT * FROM salon_clients WHERE store_id = p_store_id AND client_key = p_client_key),
  tx AS (
    SELECT t.* FROM trinks_transactions t, c
     WHERE t.store_id = p_store_id AND t.trinks_client_id = ANY (c.trinks_client_ids)
       AND t.kind = 'pagamento'
  ),
  items AS (
    -- Itens da mesma comanda: mesmo pagamento e mesmo nome de cliente.
    SELECT s.paid_at, s.item_name, s.item_type, s.professional, s.value, s.client_discount
      FROM trinks_sale_items s
      JOIN tx ON s.store_id = tx.store_id AND s.paid_at = tx.paid_at
             AND salon_norm_name(s.client_name) = salon_norm_name(tx.client_name)
  )
  SELECT jsonb_build_object(
    'visits', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', tx.business_date, 'paid_at', tx.paid_at, 'total', tx.total,
        'services', tx.services_total, 'products', tx.products_total, 'discount', tx.discounts,
        'discount_reason', tx.discount_reason, 'closed_by', tx.closed_by,
        'payment', CASE GREATEST(tx.pay_credit, tx.pay_debit, tx.pay_cash, tx.pay_other, tx.pay_prepaid)
                     WHEN 0 THEN NULL
                     WHEN tx.pay_credit THEN 'Crédito' WHEN tx.pay_debit THEN 'Débito'
                     WHEN tx.pay_cash THEN 'Dinheiro' WHEN tx.pay_other THEN 'PIX/Outros'
                     ELSE 'Pré-pago' END,
        'items', (SELECT jsonb_agg(jsonb_build_object(
                    'name', i.item_name, 'type', i.item_type,
                    'professional', regexp_replace(coalesce(i.professional, ''), '^\d+\s+', ''),
                    'value', i.value - i.client_discount) ORDER BY i.item_type, i.item_name)
                    FROM items i WHERE i.paid_at = tx.paid_at)
      ) ORDER BY tx.paid_at DESC) FROM tx), '[]'::jsonb),
    'appointments', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'date', a.appointment_date, 'starts_at', a.starts_at, 'service', a.service,
        'category', a.service_category,
        'professional', regexp_replace(coalesce(a.professional, ''), '^\d+\s+', ''),
        'status', a.status, 'value', a.value, 'origin', a.origin
      ) ORDER BY a.appointment_date DESC, a.starts_at DESC)
      FROM trinks_appointments a
     WHERE a.store_id = p_store_id AND a.client_key = p_client_key), '[]'::jsonb),
    'contacts', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'created_at', k.created_at, 'channel', k.channel, 'outcome', k.outcome,
        'note', k.note, 'campaign', (SELECT name FROM salon_campaigns WHERE id = k.campaign_id)
      ) ORDER BY k.created_at DESC)
      FROM salon_contacts k WHERE k.store_id = p_store_id AND k.client_key = p_client_key), '[]'::jsonb)
  )
$$;


-- ----------------------------------------------------------------------------
-- 8. Campanha: congela a lista de destinatárias
--
-- Aplica as travas definidas para os disparos: precisa de WhatsApp válido,
-- não pode ter pedido para sair, não pode ter recebido campanha nos últimos
-- cooldown_days, um número só uma vez por campanha. A mensagem é renderizada
-- aqui para a tela mostrar exatamente o que cada cliente receberia.
--
-- Variáveis: {primeiro_nome} {nome} {unidade} {dias_sem_vir}
--            {servico_favorito} {profissional_favorita}
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salon_render_message(p_template text, v public.salon_clients_v)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT replace(replace(replace(replace(replace(replace(coalesce(p_template, ''),
    '{primeiro_nome}', initcap(split_part(btrim(v.name), ' ', 1))),
    '{nome}', initcap(btrim(v.name))),
    '{unidade}', coalesce(v.store_name, '')),
    '{dias_sem_vir}', coalesce(v.days_since_last_visit::text, '')),
    '{servico_favorito}', coalesce(v.favorite_service, 'seu cabelo')),
    '{profissional_favorita}', coalesce(v.favorite_professional, 'nossa equipe'))
$$;

CREATE OR REPLACE FUNCTION public.salon_campaign_build_list(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cp        salon_campaigns%ROWTYPE;
  cfg       salon_crm_settings%ROWTYPE;
  v_total   int;
  v_nophone int;
  v_optout  int;
  v_cool    int;
  v_dup     int;
  v_in      int;
BEGIN
  SELECT * INTO cp FROM salon_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campanha nao encontrada'; END IF;
  IF cp.status NOT IN ('rascunho', 'pronta') THEN
    RAISE EXCEPTION 'a lista so pode ser refeita em campanha rascunho/pronta (status atual: %)', cp.status;
  END IF;
  SELECT * INTO cfg FROM salon_crm_settings WHERE id = 1;

  CREATE TEMP TABLE IF NOT EXISTS _salon_pub ON COMMIT DROP AS
    SELECT * FROM salon_clients_v WITH NO DATA;
  TRUNCATE _salon_pub;
  INSERT INTO _salon_pub
  SELECT * FROM salon_crm_filter((cp.filters - 'store_id' - 'include_opted_out')
                                 || jsonb_build_object('store_id', cp.store_id, 'include_opted_out', true));

  SELECT count(*) INTO v_total FROM _salon_pub;
  SELECT count(*) INTO v_nophone FROM _salon_pub WHERE whatsapp IS NULL;
  SELECT count(*) INTO v_optout FROM _salon_pub WHERE whatsapp IS NOT NULL AND opted_out;
  SELECT count(*) INTO v_cool FROM _salon_pub
   WHERE whatsapp IS NOT NULL AND NOT opted_out
     AND last_campaign_at > now() - make_interval(days => cfg.cooldown_days);

  DELETE FROM salon_campaign_recipients WHERE campaign_id = p_campaign_id;

  INSERT INTO salon_campaign_recipients (campaign_id, store_id, client_key, name, whatsapp, message)
  SELECT DISTINCT ON (p.whatsapp) p_campaign_id, p.store_id, p.client_key, p.name, p.whatsapp,
         salon_render_message(cp.message, p)
    FROM _salon_pub p
   WHERE p.whatsapp IS NOT NULL AND NOT p.opted_out
     AND (p.last_campaign_at IS NULL OR p.last_campaign_at <= now() - make_interval(days => cfg.cooldown_days))
   ORDER BY p.whatsapp, p.last_visit DESC NULLS LAST;
  GET DIAGNOSTICS v_in = ROW_COUNT;

  v_dup := v_total - v_nophone - v_optout - v_cool - v_in;

  UPDATE salon_campaigns
     SET recipients_count = v_in,
         excluded = jsonb_build_object('sem_whatsapp', v_nophone, 'pediu_para_sair', v_optout,
                                       'recebeu_recentemente', v_cool, 'telefone_repetido', v_dup),
         list_built_at = now(), status = 'pronta', updated_at = now()
   WHERE id = p_campaign_id;

  RETURN jsonb_build_object('publico', v_total, 'na_lista', v_in, 'sem_whatsapp', v_nophone,
                            'pediu_para_sair', v_optout, 'recebeu_recentemente', v_cool,
                            'telefone_repetido', v_dup);
END;
$$;


-- ----------------------------------------------------------------------------
-- 9. Segmentos de sistema
-- ----------------------------------------------------------------------------
INSERT INTO public.salon_segments (name, description, filters, is_system, sort_order) VALUES
  ('Sumidas', 'Vinham com frequência e passaram muito do próprio ritmo de visitas (até 1 ano).',
   '{"statuses": ["sumida"], "has_whatsapp": true, "exclude_future_appointment": true}', true, 10),
  ('Em risco', 'Passaram 1,5× do intervalo habitual entre visitas: ainda dá para segurar.',
   '{"statuses": ["em_risco"], "has_whatsapp": true, "exclude_future_appointment": true}', true, 20),
  ('Vieram só uma vez', 'Uma única visita há mais de 30 dias e menos de 1 ano.',
   '{"statuses": ["uma_visita"], "has_whatsapp": true, "exclude_future_appointment": true}', true, 30),
  ('Fiéis', '5 visitas ou mais e dentro do ritmo.',
   '{"statuses": ["ativa"], "visits_min": 5}', true, 40),
  ('Só compram produto', 'Nunca fizeram serviço na unidade, só compraram produto.',
   '{"only_products": true, "has_whatsapp": true}', true, 50),
  ('Aniversariantes do mês', 'Fazem aniversário neste mês.',
   '{"birthday": "this_month", "has_whatsapp": true}', true, 60),
  ('Faltosas', 'Faltaram 2 vezes ou mais sem avisar.',
   '{"no_shows_min": 2}', true, 70),
  ('Perdidas', 'Mais de 1 ano sem vir.',
   '{"statuses": ["perdida"], "has_whatsapp": true}', true, 80);


-- ----------------------------------------------------------------------------
-- 10. Grants e agenda
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.salon_crm_refresh(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salon_crm_refresh_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salon_crm_filter(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salon_crm_search(jsonb, text, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salon_crm_status_counts(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salon_crm_client_timeline(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salon_campaign_build_list(uuid) FROM PUBLIC, anon;
-- authenticated pode chamar; a RLS (is_admin) decide o que cada um enxerga/grava.
GRANT EXECUTE ON FUNCTION public.salon_crm_refresh(uuid), public.salon_crm_refresh_all(),
  public.salon_crm_filter(jsonb), public.salon_crm_search(jsonb, text, int, int),
  public.salon_crm_status_counts(jsonb), public.salon_crm_client_timeline(uuid, text),
  public.salon_campaign_build_list(uuid)
  TO authenticated, service_role;

-- Atualiza o resumo de hora em hora (pega o que o webhook trouxe).
SELECT cron.schedule('salon-crm-refresh', '7 * * * *', 'SELECT public.salon_crm_refresh_all()');

SELECT public.salon_crm_refresh_all();
