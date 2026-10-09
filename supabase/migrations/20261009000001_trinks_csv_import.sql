-- ============================================================================
-- Importação dos relatórios exportados do Trinks (CSV)
--
-- Fonte para o histórico que o webhook não cobre (tudo antes de 08/10/2026) e
-- para unidades/períodos em que o sync automático falhou. Os arquivos ficam em
-- relatorios-trinks/<slug-da-unidade>/ e são importados por
-- scripts/trinks-import.ts. Ver docs/trinks-endpoints.md.
--
-- Camada organizada (uma linha por coisa real):
--   trinks_transactions — um fechamento de conta (relatório Financeiro)
--   trinks_clients      — um cliente da unidade (relatório de Clientes)
--   trinks_imports      — um arquivo importado (auditoria e idempotência)
--
-- Os resumos que o dashboard lê (trinks_daily_revenue) são RECALCULADOS a
-- partir dessas tabelas pelas funções trinks_rebuild_*, nunca escritos à mão.
--
-- Contém dados pessoais de clientes com consentimento LGPD da rede. Leitura só
-- admin; escrita só service_role, sempre pelas funções abaixo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. trinks_imports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  report_type     text NOT NULL CHECK (report_type IN ('financeiro', 'clientes')),
  file_name       text NOT NULL,
  file_sha256     text NOT NULL,
  period_start    date,
  period_end      date,
  generated_at    timestamptz,          -- "Relatório gerado em ..." do próprio arquivo
  rows_in_file    int NOT NULL DEFAULT 0,
  rows_inserted   int NOT NULL DEFAULT 0,
  rows_removed    int NOT NULL DEFAULT 0,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_imports_file_unique UNIQUE (store_id, file_sha256)
);

CREATE INDEX IF NOT EXISTS idx_trinks_imports_store
  ON public.trinks_imports (store_id, imported_at DESC);


-- ----------------------------------------------------------------------------
-- 2. trinks_transactions — um fechamento de conta
--
-- source_key: chave de deduplicação. No CSV o "Nº Fechamento" vem vazio, então
-- a chave é um hash dos campos imutáveis do fechamento (data/hora do pagamento,
-- data do atendimento, cliente e valores) + a ordem de ocorrência entre linhas
-- idênticas no mesmo arquivo. Comentário, quem fechou e o rateio das formas
-- de pagamento ficam FORA do hash: podem ser editados no Trinks e não podem
-- gerar um fechamento duplicado numa reexportação.
-- Quando o webhook passar a gravar aqui, source='webhook' e source_key =
-- IdDaTransacao.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source              text NOT NULL CHECK (source IN ('csv', 'webhook')),
  source_key          text NOT NULL,
  trinks_transaction_id bigint,

  business_date       date NOT NULL,          -- data do PAGAMENTO (regime de caixa)
  paid_at             timestamptz,
  service_date        date,                   -- data do atendimento/venda
  kind                text NOT NULL DEFAULT 'pagamento' CHECK (kind IN ('pagamento', 'estorno')),

  trinks_client_id    bigint,
  client_name         text,

  services_total      numeric(12,2) NOT NULL DEFAULT 0,
  services_qty        int NOT NULL DEFAULT 0,
  products_total      numeric(12,2) NOT NULL DEFAULT 0,
  products_qty        numeric(10,2) NOT NULL DEFAULT 0,
  packages_total      numeric(12,2) NOT NULL DEFAULT 0,
  packages_qty        int NOT NULL DEFAULT 0,
  gift_cards_total    numeric(12,2) NOT NULL DEFAULT 0,
  client_credit_total numeric(12,2) NOT NULL DEFAULT 0,
  discounts           numeric(12,2) NOT NULL DEFAULT 0,   -- módulo (o CSV traz negativo)
  discount_reason     text,

  pay_credit          numeric(12,2) NOT NULL DEFAULT 0,
  pay_debit           numeric(12,2) NOT NULL DEFAULT 0,
  pay_cash            numeric(12,2) NOT NULL DEFAULT 0,
  pay_prepaid         numeric(12,2) NOT NULL DEFAULT 0,
  pay_other           numeric(12,2) NOT NULL DEFAULT 0,   -- no Trinks "Outros" é sobretudo PIX
  change_given        numeric(12,2) NOT NULL DEFAULT 0,   -- troco (CSV traz negativo; guardamos o módulo)
  tip                 numeric(12,2) NOT NULL DEFAULT 0,
  total               numeric(12,2) NOT NULL DEFAULT 0,   -- "Total (R$)" = gross_revenue do dashboard

  closed_by           text,
  comment             text,

  import_id           uuid REFERENCES public.trinks_imports(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trinks_transactions_source_unique UNIQUE (store_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_transactions_day
  ON public.trinks_transactions (store_id, business_date);
CREATE INDEX IF NOT EXISTS idx_trinks_transactions_client
  ON public.trinks_transactions (store_id, trinks_client_id, business_date);


-- ----------------------------------------------------------------------------
-- 3. trinks_clients — um cliente da unidade
--
-- O relatório de clientes não traz o ID do Trinks e o CPF quase nunca vem
-- preenchido (26 de 2.770 em Linhares). client_key = CPF quando existe; senão
-- nome normalizado + telefone. Telefone sozinho não serve: famílias dividem
-- o mesmo número.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_clients (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_key               text NOT NULL,
  trinks_client_id         bigint,

  name                     text NOT NULL,
  cpf                      text,
  gender                   text,
  phone_1                  text,
  phone_2                  text,
  email                    text,
  birth_date               date,
  registered_on            date,              -- "Data de Cadastro" → new_customers
  origin                   text,              -- Balcão / Web
  acquisition_channel      text,              -- "Como nos conheceu"
  notes                    text,
  tags                     text[],            -- "Etiquetas" (ex.: Cliente Faltoso, Pref. FULANA)
  instagram                text,

  first_appointment_on     date,
  first_appointment_status text,
  last_appointment_on      date,
  last_appointment_status  text,

  can_book_online          boolean,
  accepts_sms              boolean,
  accepts_email            boolean,
  accepts_loyalty_email    boolean,

  cep                      text,
  state                    text,
  address                  text,
  address_number           text,
  address_complement       text,
  neighborhood             text,
  city                     text,

  import_id                uuid REFERENCES public.trinks_imports(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trinks_clients_key_unique UNIQUE (store_id, client_key)
);

CREATE INDEX IF NOT EXISTS idx_trinks_clients_registered
  ON public.trinks_clients (store_id, registered_on);


-- ----------------------------------------------------------------------------
-- RLS + grants
-- ----------------------------------------------------------------------------
ALTER TABLE public.trinks_imports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinks_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinks_clients      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_trinks_imports" ON public.trinks_imports
  FOR SELECT USING (public.is_admin());
CREATE POLICY "admin_read_trinks_transactions" ON public.trinks_transactions
  FOR SELECT USING (public.is_admin());
CREATE POLICY "admin_read_trinks_clients" ON public.trinks_clients
  FOR SELECT USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trinks_imports, public.trinks_transactions, public.trinks_clients TO service_role;
GRANT SELECT ON public.trinks_imports, public.trinks_transactions, public.trinks_clients TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. trinks_rebuild_daily_revenue(store, from, to)
--
-- Recalcula as colunas de FATURAMENTO de trinks_daily_revenue a partir de
-- trinks_transactions. Não toca em agenda, clientes novos nem despesas.
-- Dia sem fechamento no intervalo fica zerado (se a linha existir) — por isso
-- o intervalo tem de ser um período inteiramente coberto pela fonte.
-- Mesmas definições do sync antigo (validadas: 304 de 304 dias idênticos em
-- Linhares): gross = "Total (R$)", tickets = nº de fechamentos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_rebuild_daily_revenue(
  p_store_id uuid, p_from date, p_to date
) RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE trinks_daily_revenue d
     SET gross_revenue = 0, services_revenue = 0, products_revenue = 0,
         packages_revenue = 0, discounts = 0, tickets_count = 0, synced_at = now()
   WHERE d.store_id = p_store_id
     AND d.business_date BETWEEN p_from AND p_to
     AND NOT EXISTS (
       SELECT 1 FROM trinks_transactions t
        WHERE t.store_id = p_store_id AND t.business_date = d.business_date
          AND t.kind = 'pagamento');

  INSERT INTO trinks_daily_revenue AS d (
    store_id, business_date, gross_revenue, services_revenue, products_revenue,
    packages_revenue, discounts, tickets_count, synced_at
  )
  SELECT p_store_id, t.business_date, sum(t.total), sum(t.services_total),
         sum(t.products_total), sum(t.packages_total), sum(t.discounts), count(*), now()
    FROM trinks_transactions t
   WHERE t.store_id = p_store_id
     AND t.business_date BETWEEN p_from AND p_to
     AND t.kind = 'pagamento'
   GROUP BY t.business_date
  ON CONFLICT (store_id, business_date) DO UPDATE SET
    gross_revenue    = EXCLUDED.gross_revenue,
    services_revenue = EXCLUDED.services_revenue,
    products_revenue = EXCLUDED.products_revenue,
    packages_revenue = EXCLUDED.packages_revenue,
    discounts        = EXCLUDED.discounts,
    tickets_count    = EXCLUDED.tickets_count,
    synced_at        = EXCLUDED.synced_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. trinks_rebuild_new_customers(store, from, to)
--
-- new_customers = clientes com "Data de Cadastro" no dia. Ressalva: o
-- relatório de clientes lista só os ATIVOS, então quem foi inativado depois
-- some da contagem histórica — mesmo critério do sync antigo
-- (FiltrarApenasAtivos=true).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_rebuild_new_customers(
  p_store_id uuid, p_from date, p_to date
) RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE trinks_daily_revenue d
     SET new_customers = 0
   WHERE d.store_id = p_store_id
     AND d.business_date BETWEEN p_from AND p_to
     AND NOT EXISTS (
       SELECT 1 FROM trinks_clients c
        WHERE c.store_id = p_store_id AND c.registered_on = d.business_date);

  INSERT INTO trinks_daily_revenue AS d (store_id, business_date, new_customers, synced_at)
  SELECT p_store_id, c.registered_on, count(*), now()
    FROM trinks_clients c
   WHERE c.store_id = p_store_id
     AND c.registered_on BETWEEN p_from AND p_to
   GROUP BY c.registered_on
  ON CONFLICT (store_id, business_date) DO UPDATE SET
    new_customers = EXCLUDED.new_customers;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. trinks_import_financeiro(store, import, rows)
--
-- Substitui, numa transação só, os fechamentos CSV da unidade no período do
-- arquivo: apaga os que não vieram (estornados/excluídos no Trinks depois da
-- exportação anterior), insere os novos e recalcula o dashboard do período.
-- Arquivo já importado (mesmo sha256) é ignorado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_import_financeiro(
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
  v_inserted  int;
BEGIN
  IF v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RAISE EXCEPTION 'periodo invalido: % a %', v_from, v_to;
  END IF;

  IF EXISTS (SELECT 1 FROM trinks_imports
              WHERE store_id = p_store_id AND file_sha256 = p_import->>'file_sha256') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'arquivo ja importado');
  END IF;

  -- Trava: toda linha tem de estar dentro do período declarado no arquivo.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r
              WHERE (r->>'business_date')::date NOT BETWEEN v_from AND v_to) THEN
    RAISE EXCEPTION 'arquivo tem fechamento fora do periodo declarado';
  END IF;

  INSERT INTO trinks_imports (store_id, report_type, file_name, file_sha256,
                              period_start, period_end, generated_at, rows_in_file)
  VALUES (p_store_id, 'financeiro', p_import->>'file_name', p_import->>'file_sha256',
          v_from, v_to, (p_import->>'generated_at')::timestamptz, jsonb_array_length(p_rows))
  RETURNING id INTO v_import_id;

  DELETE FROM trinks_transactions t
   WHERE t.store_id = p_store_id AND t.source = 'csv'
     AND t.business_date BETWEEN v_from AND v_to
     -- NOT IN vira "hashed subplan": O(n) em vez de comparar todos com todos.
     -- source_key é NOT NULL, então não há a armadilha do NULL no NOT IN.
     AND t.source_key NOT IN (SELECT r->>'source_key' FROM jsonb_array_elements(p_rows) r);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO trinks_transactions (
    store_id, source, source_key, business_date, paid_at, service_date, kind,
    trinks_client_id, client_name,
    services_total, services_qty, products_total, products_qty, packages_total, packages_qty,
    gift_cards_total, client_credit_total, discounts, discount_reason,
    pay_credit, pay_debit, pay_cash, pay_prepaid, pay_other, change_given, tip, total,
    closed_by, comment, import_id
  )
  SELECT p_store_id, 'csv', r->>'source_key', (r->>'business_date')::date,
         (r->>'paid_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         (r->>'service_date')::date, r->>'kind',
         (r->>'trinks_client_id')::bigint, r->>'client_name',
         (r->>'services_total')::numeric, (r->>'services_qty')::int,
         (r->>'products_total')::numeric, (r->>'products_qty')::numeric,
         (r->>'packages_total')::numeric, (r->>'packages_qty')::int,
         (r->>'gift_cards_total')::numeric, (r->>'client_credit_total')::numeric,
         (r->>'discounts')::numeric, r->>'discount_reason',
         (r->>'pay_credit')::numeric, (r->>'pay_debit')::numeric, (r->>'pay_cash')::numeric,
         (r->>'pay_prepaid')::numeric, (r->>'pay_other')::numeric,
         (r->>'change_given')::numeric, (r->>'tip')::numeric, (r->>'total')::numeric,
         r->>'closed_by', r->>'comment', v_import_id
    FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (store_id, source, source_key) DO UPDATE SET
    -- Campos editáveis no Trinks: a exportação mais recente vence.
    closed_by  = EXCLUDED.closed_by,
    comment    = EXCLUDED.comment,
    pay_credit = EXCLUDED.pay_credit, pay_debit = EXCLUDED.pay_debit,
    pay_cash   = EXCLUDED.pay_cash, pay_prepaid = EXCLUDED.pay_prepaid,
    pay_other  = EXCLUDED.pay_other, discount_reason = EXCLUDED.discount_reason;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE trinks_imports SET rows_inserted = v_inserted, rows_removed = v_removed
   WHERE id = v_import_id;

  PERFORM trinks_rebuild_daily_revenue(p_store_id, v_from, v_to);

  RETURN jsonb_build_object('import_id', v_import_id, 'rows', jsonb_array_length(p_rows),
                            'upserted', v_inserted, 'removed', v_removed);
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. trinks_import_clientes(store, import, rows)
--
-- Upsert dos clientes (snapshot mais recente vence) e recálculo de
-- new_customers no intervalo de cadastros do arquivo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_import_clientes(
  p_store_id uuid, p_import jsonb, p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_import_id uuid;
  v_upserted  int;
  v_from      date;
  v_to        date;
BEGIN
  IF EXISTS (SELECT 1 FROM trinks_imports
              WHERE store_id = p_store_id AND file_sha256 = p_import->>'file_sha256') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'arquivo ja importado');
  END IF;

  INSERT INTO trinks_imports (store_id, report_type, file_name, file_sha256,
                              generated_at, rows_in_file)
  VALUES (p_store_id, 'clientes', p_import->>'file_name', p_import->>'file_sha256',
          (p_import->>'generated_at')::timestamptz, jsonb_array_length(p_rows))
  RETURNING id INTO v_import_id;

  INSERT INTO trinks_clients (
    store_id, client_key, name, cpf, gender, phone_1, phone_2, email, birth_date,
    registered_on, origin, acquisition_channel, notes, tags, instagram,
    first_appointment_on, first_appointment_status, last_appointment_on, last_appointment_status,
    can_book_online, accepts_sms, accepts_email, accepts_loyalty_email,
    cep, state, address, address_number, address_complement, neighborhood, city,
    import_id, updated_at
  )
  SELECT p_store_id, r->>'client_key', r->>'name', r->>'cpf', r->>'gender',
         r->>'phone_1', r->>'phone_2', r->>'email', (r->>'birth_date')::date,
         (r->>'registered_on')::date, r->>'origin', r->>'acquisition_channel', r->>'notes',
         CASE WHEN jsonb_typeof(r->'tags') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(r->'tags')) END,
         r->>'instagram',
         (r->>'first_appointment_on')::date, r->>'first_appointment_status',
         (r->>'last_appointment_on')::date, r->>'last_appointment_status',
         (r->>'can_book_online')::boolean, (r->>'accepts_sms')::boolean,
         (r->>'accepts_email')::boolean, (r->>'accepts_loyalty_email')::boolean,
         r->>'cep', r->>'state', r->>'address', r->>'address_number',
         r->>'address_complement', r->>'neighborhood', r->>'city',
         v_import_id, now()
    FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (store_id, client_key) DO UPDATE SET
    name = EXCLUDED.name, cpf = EXCLUDED.cpf, gender = EXCLUDED.gender,
    phone_1 = EXCLUDED.phone_1, phone_2 = EXCLUDED.phone_2, email = EXCLUDED.email,
    birth_date = EXCLUDED.birth_date, registered_on = EXCLUDED.registered_on,
    origin = EXCLUDED.origin, acquisition_channel = EXCLUDED.acquisition_channel,
    notes = EXCLUDED.notes, tags = EXCLUDED.tags, instagram = EXCLUDED.instagram,
    first_appointment_on = EXCLUDED.first_appointment_on,
    first_appointment_status = EXCLUDED.first_appointment_status,
    last_appointment_on = EXCLUDED.last_appointment_on,
    last_appointment_status = EXCLUDED.last_appointment_status,
    can_book_online = EXCLUDED.can_book_online, accepts_sms = EXCLUDED.accepts_sms,
    accepts_email = EXCLUDED.accepts_email, accepts_loyalty_email = EXCLUDED.accepts_loyalty_email,
    cep = EXCLUDED.cep, state = EXCLUDED.state, address = EXCLUDED.address,
    address_number = EXCLUDED.address_number, address_complement = EXCLUDED.address_complement,
    neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city,
    import_id = EXCLUDED.import_id, updated_at = now();
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  SELECT min(registered_on), max(registered_on) INTO v_from, v_to
    FROM trinks_clients WHERE store_id = p_store_id;

  UPDATE trinks_imports SET rows_inserted = v_upserted, period_start = v_from, period_end = v_to
   WHERE id = v_import_id;

  IF v_from IS NOT NULL THEN
    PERFORM trinks_rebuild_new_customers(p_store_id, v_from, v_to);
  END IF;

  RETURN jsonb_build_object('import_id', v_import_id, 'rows', jsonb_array_length(p_rows),
                            'upserted', v_upserted, 'registered_from', v_from, 'registered_to', v_to);
END;
$$;


-- ----------------------------------------------------------------------------
-- 8. get_trinks_breakdown(from, to, store) — indicadores sob demanda p/ o dashboard
--
-- SECURITY INVOKER: roda com a RLS de quem chama (admin lê; os demais recebem
-- conjunto vazio). Calcula a partir de trinks_transactions, então cobre só os
-- períodos que vieram de fechamentos (CSV/webhook), não do sync antigo.
-- "Primeira compra" = primeiro fechamento do cliente na unidade dentro do
-- histórico importado; nos primeiros meses do histórico isso infla.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trinks_breakdown(
  p_from date, p_to date, p_store_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH tx AS (
    SELECT * FROM trinks_transactions
     WHERE business_date BETWEEN p_from AND p_to
       AND kind = 'pagamento'
       AND (p_store_id IS NULL OR store_id = p_store_id)
  ),
  firsts AS (
    SELECT store_id, trinks_client_id, min(business_date) AS first_day
      FROM trinks_transactions
     WHERE kind = 'pagamento' AND trinks_client_id IS NOT NULL
       AND (p_store_id IS NULL OR store_id = p_store_id)
     GROUP BY 1, 2
  ),
  clients AS (
    SELECT DISTINCT tx.store_id, tx.trinks_client_id, f.first_day
      FROM tx JOIN firsts f USING (store_id, trinks_client_id)
  )
  SELECT jsonb_build_object(
    'coverage', (SELECT jsonb_build_object('transactions', count(*),
                                           'first_day', min(business_date),
                                           'last_day', max(business_date)) FROM tx),
    'payments', (SELECT jsonb_build_object(
                   'credit', coalesce(sum(pay_credit), 0), 'debit', coalesce(sum(pay_debit), 0),
                   'cash', coalesce(sum(pay_cash) - sum(change_given), 0),
                   'prepaid', coalesce(sum(pay_prepaid), 0), 'other', coalesce(sum(pay_other), 0),
                   'tips', coalesce(sum(tip), 0)) FROM tx),
    'discounts', coalesce((SELECT jsonb_agg(x ORDER BY x.total DESC) FROM (
                   SELECT coalesce(nullif(discount_reason, ''), 'Sem motivo') AS reason,
                          count(*) AS uses, sum(discounts) AS total
                     FROM tx WHERE discounts > 0 GROUP BY 1) x), '[]'::jsonb),
    'clients', (SELECT jsonb_build_object(
                  'unique', count(*),
                  'first_time', count(*) FILTER (WHERE first_day BETWEEN p_from AND p_to),
                  'returning', count(*) FILTER (WHERE first_day < p_from)) FROM clients),
    'closers', coalesce((SELECT jsonb_agg(x ORDER BY x.total DESC) FROM (
                   SELECT coalesce(nullif(closed_by, ''), '—') AS name,
                          count(*) AS tickets, sum(total) AS total
                     FROM tx GROUP BY 1) x), '[]'::jsonb)
  );
$$;


-- ----------------------------------------------------------------------------
-- 9. trinks_data_freshness — até quando cada unidade tem dado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.trinks_data_freshness
WITH (security_invoker = true) AS
SELECT u.store_id,
       (SELECT max(business_date) FROM trinks_daily_revenue d
         WHERE d.store_id = u.store_id AND d.gross_revenue > 0)          AS last_revenue_day,
       (SELECT max(period_end) FROM trinks_imports i
         WHERE i.store_id = u.store_id AND i.report_type = 'financeiro') AS imported_through,
       (SELECT max(imported_at) FROM trinks_imports i
         WHERE i.store_id = u.store_id)                                   AS last_import_at,
       (SELECT max(received_at) FROM trinks_webhook_events e
         WHERE e.store_id = u.store_id)                                   AS last_webhook_at
  FROM trinks_units u
 WHERE u.active;

GRANT SELECT ON public.trinks_data_freshness TO authenticated, service_role;


-- Escrita só pelo importador (service_role). Leitura do dashboard via RPC.
REVOKE ALL ON FUNCTION public.trinks_rebuild_daily_revenue(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_rebuild_new_customers(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_import_financeiro(uuid, jsonb, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_import_clientes(uuid, jsonb, jsonb)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trinks_rebuild_daily_revenue(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_rebuild_new_customers(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_import_financeiro(uuid, jsonb, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_import_clientes(uuid, jsonb, jsonb)     TO service_role;

REVOKE ALL ON FUNCTION public.get_trinks_breakdown(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trinks_breakdown(date, date, uuid) TO authenticated, service_role;
