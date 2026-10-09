-- ============================================================================
-- Importação dos relatórios de Agendamentos e Comissões do Trinks
--
-- Continuação de 20261009000001 (financeiro/clientes). Mesmo modelo: camada
-- organizada com uma linha por coisa real, importação que SUBSTITUI o período
-- do arquivo numa transação, e resumos do dashboard sempre recalculados.
--
--   trinks_appointments — um serviço agendado (relatório de Agendamentos)
--   trinks_sale_items   — um item vendido com profissional e comissão
--                         (relatório de Comissões)
--
-- Classificação serviço × produto: o relatório de comissões não marca o tipo
-- e a "Categoria" é o tipo do produto (Ativador, Máscara...). Regra: é SERVIÇO
-- todo item cujo nome aparece nos agendamentos da unidade (só serviço é
-- agendado); pacote quando é consumo de pacote; o resto é PRODUTO. Validado em
-- Linhares (set/2024–out/2026): serviços batem 100% com o financeiro, produtos
-- 99,7% (o que falta é produto vendido sem profissional comissionado).
--
-- Contém dados pessoais de clientes com consentimento LGPD da rede.
-- ============================================================================

ALTER TABLE public.trinks_imports DROP CONSTRAINT IF EXISTS trinks_imports_report_type_check;
ALTER TABLE public.trinks_imports ADD CONSTRAINT trinks_imports_report_type_check
  CHECK (report_type IN ('financeiro', 'clientes', 'agendamentos', 'comissoes'));


-- ----------------------------------------------------------------------------
-- 1. trinks_appointments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_appointments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source                 text NOT NULL CHECK (source IN ('csv', 'webhook')),
  source_key             text NOT NULL,

  appointment_date       date NOT NULL,
  starts_at              timestamptz,
  professional           text,
  professional_on_duty   boolean,             -- "Profissional da vez"
  assistant              text,
  service_category       text,
  service                text,
  duration_min           int,
  value                  numeric(12,2) NOT NULL DEFAULT 0,

  status                 text NOT NULL,       -- texto do Trinks (Finalizado, Cliente não compareceu, Cancelado...)
  ticket_closed          boolean,             -- "Fechamento Conta" = Fechada
  booked_at              timestamptz,         -- "Cadastramento": quando o agendamento foi marcado
  booked_by              text,
  origin                 text,                -- Estabelecimento / Site / App / Agendamento pelo Google

  client_key             text,                -- mesma chave de trinks_clients (nome + telefone)
  client_name            text,
  client_gender          text,
  client_phones          text,
  client_email           text,
  client_registered_at   timestamptz,
  client_tags            text,
  appointment_tags       text,               -- "Etiqueta do agendamento" (exportações a partir de 2026)
  notes                  text,

  import_id              uuid REFERENCES public.trinks_imports(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_appointments_source_unique UNIQUE (store_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_appointments_day
  ON public.trinks_appointments (store_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_trinks_appointments_client
  ON public.trinks_appointments (store_id, client_key, appointment_date);


-- ----------------------------------------------------------------------------
-- 2. trinks_sale_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_sale_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source                 text NOT NULL CHECK (source IN ('csv', 'webhook')),
  source_key             text NOT NULL,

  business_date          date NOT NULL,       -- data do PAGAMENTO (regime de caixa)
  paid_at                timestamptz,
  service_date           date,
  commission_release_on  date,

  professional           text,
  assistant              text,
  item_name              text NOT NULL,
  category               text,
  item_type              text NOT NULL DEFAULT 'produto' CHECK (item_type IN ('servico', 'produto', 'pacote')),
  package_consumption    boolean NOT NULL DEFAULT false,

  client_name            text,
  client_cpf             text,

  value                  numeric(12,2) NOT NULL DEFAULT 0,
  client_discount        numeric(12,2) NOT NULL DEFAULT 0,   -- módulo
  admin_discount         numeric(12,2) NOT NULL DEFAULT 0,
  discount_reason        text,
  paid_with              text,
  operational_cost       numeric(12,2) NOT NULL DEFAULT 0,
  commission_base        numeric(12,2) NOT NULL DEFAULT 0,
  commission_pct         numeric(6,2),
  acquirer_discount      numeric(12,2) NOT NULL DEFAULT 0,
  commission_value       numeric(12,2) NOT NULL DEFAULT 0,
  ticket_fee             numeric(12,2) NOT NULL DEFAULT 0,
  registered_by          text,
  commission_to          text,                -- Profissional / Assistente

  import_id              uuid REFERENCES public.trinks_imports(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_sale_items_source_unique UNIQUE (store_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_sale_items_day
  ON public.trinks_sale_items (store_id, business_date);


ALTER TABLE public.trinks_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinks_sale_items   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_appointments" ON public.trinks_appointments
  FOR SELECT USING (public.is_admin());
CREATE POLICY "admin_read_trinks_sale_items" ON public.trinks_sale_items
  FOR SELECT USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trinks_appointments, public.trinks_sale_items TO service_role;
GRANT SELECT ON public.trinks_appointments, public.trinks_sale_items TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Recalculos
-- ----------------------------------------------------------------------------

-- Agenda do dia: total, realizados, faltas e cancelamentos.
CREATE OR REPLACE FUNCTION public.trinks_rebuild_appointments(
  p_store_id uuid, p_from date, p_to date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE trinks_daily_revenue d
     SET appointments_total = 0, appointments_done = 0, no_shows = 0, cancellations = 0
   WHERE d.store_id = p_store_id
     AND d.business_date BETWEEN p_from AND p_to
     AND NOT EXISTS (SELECT 1 FROM trinks_appointments a
                      WHERE a.store_id = p_store_id AND a.appointment_date = d.business_date);

  INSERT INTO trinks_daily_revenue AS d (
    store_id, business_date, appointments_total, appointments_done, no_shows, cancellations, synced_at
  )
  SELECT p_store_id, a.appointment_date, count(*),
         count(*) FILTER (WHERE a.status = 'Finalizado'),
         count(*) FILTER (WHERE a.status = 'Cliente não compareceu'),
         count(*) FILTER (WHERE a.status = 'Cancelado'),
         now()
    FROM trinks_appointments a
   WHERE a.store_id = p_store_id AND a.appointment_date BETWEEN p_from AND p_to
   GROUP BY a.appointment_date
  ON CONFLICT (store_id, business_date) DO UPDATE SET
    appointments_total = EXCLUDED.appointments_total,
    appointments_done  = EXCLUDED.appointments_done,
    no_shows           = EXCLUDED.no_shows,
    cancellations      = EXCLUDED.cancellations;
END;
$$;

-- Tipo de cada item vendido, pela regra do cabeçalho. Roda sobre a unidade
-- inteira: um agendamento importado depois pode reclassificar itens antigos.
CREATE OR REPLACE FUNCTION public.trinks_classify_sale_items(p_store_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  -- Lista distinta de nomes de serviço + IN (hashed subplan): comparar cada
  -- item com todos os agendamentos seria O(itens × agendamentos).
  WITH svc AS (
    SELECT DISTINCT regexp_replace(lower(btrim(service)), '\s+', ' ', 'g') AS n
      FROM trinks_appointments
     WHERE store_id = p_store_id AND service IS NOT NULL
  )
  UPDATE trinks_sale_items s
     SET item_type = CASE
           WHEN s.package_consumption OR s.category = 'Pacotes' OR s.item_name ILIKE 'pacote%' THEN 'pacote'
           WHEN regexp_replace(lower(btrim(s.item_name)), '\s+', ' ', 'g') IN (SELECT n FROM svc) THEN 'servico'
           ELSE 'produto'
         END
   WHERE s.store_id = p_store_id;
$$;

-- Rankings de serviços/produtos e produção por profissional do período.
-- O relatório de comissões é a fonte autoritativa desses três: o período é
-- substituído inteiro (inclusive o que o sync antigo tinha gravado).
CREATE OR REPLACE FUNCTION public.trinks_rebuild_sales(
  p_store_id uuid, p_from date, p_to date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM trinks_service_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;
  DELETE FROM trinks_product_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;
  DELETE FROM trinks_professional_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;

  -- item_key = nome normalizado (mesmo critério do sync antigo).
  INSERT INTO trinks_service_sales (store_id, business_date, item_key, name, qty, revenue, synced_at)
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(item_name)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(item_name)), count(*), sum(value), now()
    FROM trinks_sale_items
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to
     AND item_type IN ('servico', 'pacote')
   GROUP BY 1, 2, 3;

  INSERT INTO trinks_product_sales (store_id, business_date, item_key, name, qty, revenue, synced_at)
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(item_name)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(item_name)), count(*), sum(value), now()
    FROM trinks_sale_items
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to
     AND item_type = 'produto'
   GROUP BY 1, 2, 3;

  -- services_count = serviços realizados (produto vendido não é atendimento);
  -- revenue = tudo que o profissional vendeu; commission = o que ele recebe.
  INSERT INTO trinks_professional_sales (
    store_id, business_date, professional_key, professional_name,
    services_count, revenue, commission, synced_at
  )
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(professional)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(professional)),
         count(*) FILTER (WHERE item_type = 'servico'),
         sum(value), sum(commission_value), now()
    FROM trinks_sale_items
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to
     AND coalesce(btrim(professional), '') <> ''
   GROUP BY 1, 2, 3;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. Importações (mesmo contrato de trinks_import_financeiro)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_import_agendamentos(
  p_store_id uuid, p_import jsonb, p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_import_id uuid;
  v_from      date := (p_import->>'period_start')::date;
  v_to        date := (p_import->>'period_end')::date;
  v_removed   int;
  v_upserted  int;
BEGIN
  IF v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RAISE EXCEPTION 'periodo invalido: % a %', v_from, v_to;
  END IF;
  IF EXISTS (SELECT 1 FROM trinks_imports
              WHERE store_id = p_store_id AND file_sha256 = p_import->>'file_sha256') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'arquivo ja importado');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r
              WHERE (r->>'appointment_date')::date NOT BETWEEN v_from AND v_to) THEN
    RAISE EXCEPTION 'arquivo tem agendamento fora do periodo declarado';
  END IF;

  INSERT INTO trinks_imports (store_id, report_type, file_name, file_sha256,
                              period_start, period_end, generated_at, rows_in_file)
  VALUES (p_store_id, 'agendamentos', p_import->>'file_name', p_import->>'file_sha256',
          v_from, v_to, (p_import->>'generated_at')::timestamptz, jsonb_array_length(p_rows))
  RETURNING id INTO v_import_id;

  DELETE FROM trinks_appointments t
   WHERE t.store_id = p_store_id AND t.source = 'csv'
     AND t.appointment_date BETWEEN v_from AND v_to
     AND t.source_key NOT IN (SELECT r->>'source_key' FROM jsonb_array_elements(p_rows) r);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO trinks_appointments (
    store_id, source, source_key, appointment_date, starts_at, professional, professional_on_duty,
    assistant, service_category, service, duration_min, value, status, ticket_closed,
    booked_at, booked_by, origin, client_key, client_name, client_gender, client_phones,
    client_email, client_registered_at, client_tags, appointment_tags, notes, import_id
  )
  SELECT p_store_id, 'csv', r->>'source_key', (r->>'appointment_date')::date,
         (r->>'starts_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         r->>'professional', (r->>'professional_on_duty')::boolean, r->>'assistant',
         r->>'service_category', r->>'service', (r->>'duration_min')::int,
         (r->>'value')::numeric, r->>'status', (r->>'ticket_closed')::boolean,
         (r->>'booked_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         r->>'booked_by', r->>'origin', r->>'client_key', r->>'client_name', r->>'client_gender',
         r->>'client_phones', r->>'client_email',
         (r->>'client_registered_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         r->>'client_tags', r->>'appointment_tags', r->>'notes', v_import_id
    FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (store_id, source, source_key) DO UPDATE SET
    -- Muda depois do agendamento marcado: a exportação mais recente vence.
    status = EXCLUDED.status, ticket_closed = EXCLUDED.ticket_closed,
    value = EXCLUDED.value, notes = EXCLUDED.notes, client_tags = EXCLUDED.client_tags,
    appointment_tags = EXCLUDED.appointment_tags,
    import_id = EXCLUDED.import_id;
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  UPDATE trinks_imports SET rows_inserted = v_upserted, rows_removed = v_removed WHERE id = v_import_id;

  PERFORM trinks_rebuild_appointments(p_store_id, v_from, v_to);

  -- Nomes de serviço novos podem reclassificar vendas já importadas: refaz a
  -- classificação e os rankings de cada período de comissões já importado
  -- (só esses — fora deles o dado pode ser do sync antigo e não é tocado).
  PERFORM trinks_classify_sale_items(p_store_id);
  PERFORM trinks_rebuild_sales(p_store_id, i.period_start, i.period_end)
     FROM trinks_imports i
    WHERE i.store_id = p_store_id AND i.report_type = 'comissoes';

  RETURN jsonb_build_object('import_id', v_import_id, 'rows', jsonb_array_length(p_rows),
                            'upserted', v_upserted, 'removed', v_removed);
END;
$$;

CREATE OR REPLACE FUNCTION public.trinks_import_comissoes(
  p_store_id uuid, p_import jsonb, p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_import_id uuid;
  v_from      date := (p_import->>'period_start')::date;
  v_to        date := (p_import->>'period_end')::date;
  v_removed   int;
  v_upserted  int;
BEGIN
  IF v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RAISE EXCEPTION 'periodo invalido: % a %', v_from, v_to;
  END IF;
  IF EXISTS (SELECT 1 FROM trinks_imports
              WHERE store_id = p_store_id AND file_sha256 = p_import->>'file_sha256') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'arquivo ja importado');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r
              WHERE (r->>'business_date')::date NOT BETWEEN v_from AND v_to) THEN
    RAISE EXCEPTION 'arquivo tem item fora do periodo declarado';
  END IF;

  INSERT INTO trinks_imports (store_id, report_type, file_name, file_sha256,
                              period_start, period_end, generated_at, rows_in_file)
  VALUES (p_store_id, 'comissoes', p_import->>'file_name', p_import->>'file_sha256',
          v_from, v_to, (p_import->>'generated_at')::timestamptz, jsonb_array_length(p_rows))
  RETURNING id INTO v_import_id;

  DELETE FROM trinks_sale_items t
   WHERE t.store_id = p_store_id AND t.source = 'csv'
     AND t.business_date BETWEEN v_from AND v_to
     AND t.source_key NOT IN (SELECT r->>'source_key' FROM jsonb_array_elements(p_rows) r);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO trinks_sale_items (
    store_id, source, source_key, business_date, paid_at, service_date, commission_release_on,
    professional, assistant, item_name, category, package_consumption, client_name, client_cpf,
    value, client_discount, admin_discount, discount_reason, paid_with, operational_cost,
    commission_base, commission_pct, acquirer_discount, commission_value, ticket_fee,
    registered_by, commission_to, import_id
  )
  SELECT p_store_id, 'csv', r->>'source_key', (r->>'business_date')::date,
         (r->>'paid_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         (r->>'service_date')::date, (r->>'commission_release_on')::date,
         r->>'professional', r->>'assistant', r->>'item_name', r->>'category',
         (r->>'package_consumption')::boolean, r->>'client_name', r->>'client_cpf',
         (r->>'value')::numeric, (r->>'client_discount')::numeric, (r->>'admin_discount')::numeric,
         r->>'discount_reason', r->>'paid_with', (r->>'operational_cost')::numeric,
         (r->>'commission_base')::numeric, (r->>'commission_pct')::numeric,
         (r->>'acquirer_discount')::numeric, (r->>'commission_value')::numeric,
         (r->>'ticket_fee')::numeric, r->>'registered_by', r->>'commission_to', v_import_id
    FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (store_id, source, source_key) DO UPDATE SET
    commission_release_on = EXCLUDED.commission_release_on,
    commission_base = EXCLUDED.commission_base, commission_pct = EXCLUDED.commission_pct,
    commission_value = EXCLUDED.commission_value, paid_with = EXCLUDED.paid_with,
    import_id = EXCLUDED.import_id;
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  UPDATE trinks_imports SET rows_inserted = v_upserted, rows_removed = v_removed WHERE id = v_import_id;

  PERFORM trinks_classify_sale_items(p_store_id);
  PERFORM trinks_rebuild_sales(p_store_id, v_from, v_to);

  RETURN jsonb_build_object('import_id', v_import_id, 'rows', jsonb_array_length(p_rows),
                            'upserted', v_upserted, 'removed', v_removed);
END;
$$;


REVOKE ALL ON FUNCTION public.trinks_rebuild_appointments(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_classify_sale_items(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_rebuild_sales(uuid, date, date)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_import_agendamentos(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_import_comissoes(uuid, jsonb, jsonb)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trinks_rebuild_appointments(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_classify_sale_items(uuid)              TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_rebuild_sales(uuid, date, date)        TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_import_agendamentos(uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_import_comissoes(uuid, jsonb, jsonb)    TO service_role;
