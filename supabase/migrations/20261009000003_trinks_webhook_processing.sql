-- ============================================================================
-- Processamento dos webhooks do Trinks → camada organizada → dashboard
--
-- trinks_webhook_events (20261008000001) guarda o evento bruto. Aqui cada
-- evento vira linha nas mesmas tabelas que a importação de CSV alimenta, e os
-- resumos do dia afetado são recalculados:
--
--   1  Fechamento de Conta     → trinks_transactions + trinks_sale_items
--   2  Estorno de Conta        → fechamento marcado como estorno (sai do faturamento)
--   3/4 Cliente                → trinks_clients
--   5/6 Profissional           → trinks_professionals (nome dos IDs)
--   11/12 Agendamento          → trinks_appointments (status mais recente vence)
--   13 Exclusão de agendamento → agendamento removido
--   demais                     → marcados como processados, sem efeito
--
-- Payloads mapeados pela documentação oficial (trinks.readme.io/reference/webhook)
-- ANTES do primeiro evento real chegar. Formato inesperado não grava nada:
-- vira process_error no evento, para corrigir a regra e reprocessar.
--
-- PRECEDÊNCIA CSV × WEBHOOK: onde há relatório importado, ele manda. O
-- webhook só entra nos resumos para dias DEPOIS do fim do último relatório
-- do mesmo tipo (trinks_csv_covered_through). Sem isso, um dia coberto pelas
-- duas fontes seria contado em dobro.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;


-- ----------------------------------------------------------------------------
-- 1. Profissionais (os eventos só trazem IDs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trinks_professionals (
  store_id                uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  trinks_professional_id  bigint NOT NULL,     -- IdDoProfissionalNoEstabelecimento
  name                    text NOT NULL,
  nickname                text,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, trinks_professional_id)
);

ALTER TABLE public.trinks_professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_trinks_professionals" ON public.trinks_professionals
  FOR SELECT USING (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trinks_professionals TO service_role;
GRANT SELECT ON public.trinks_professionals TO authenticated;

-- Agendamento: ordem dos eventos. Uma alteração antiga entregue depois de
-- uma nova (o SNS não garante ordem) não pode desfazer o status atual.
ALTER TABLE public.trinks_appointments
  ADD COLUMN IF NOT EXISTS trinks_professional_id bigint,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

ALTER TABLE public.trinks_sale_items
  ADD COLUMN IF NOT EXISTS trinks_professional_id bigint;


-- ----------------------------------------------------------------------------
-- 2. Helpers
-- ----------------------------------------------------------------------------

-- "100,00" / "1.234,56" / "10" / "10.5" / número JSON → numeric
CREATE OR REPLACE FUNCTION public.trinks_num(p jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR p = 'null'::jsonb THEN 0
    WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric
    WHEN btrim(p #>> '{}') = '' THEN 0
    WHEN (p #>> '{}') LIKE '%,%' THEN replace(replace(btrim(p #>> '{}'), '.', ''), ',', '.')::numeric
    ELSE btrim(p #>> '{}')::numeric
  END
$$;

-- Mesma chave de cliente do importador (clientKey em _shared/trinks-reports.ts):
-- CPF com 11 dígitos; senão nome normalizado + dígitos do primeiro telefone.
CREATE OR REPLACE FUNCTION public.trinks_client_key(p_name text, p_cpf text, p_phone text)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN length(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')) = 11
      THEN 'cpf:' || regexp_replace(p_cpf, '\D', '', 'g')
    ELSE 'np:' || btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_name, ''))), '[^a-z0-9]+', ' ', 'g'))
         || '|' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  END
$$;

-- Fim do último relatório CSV importado do tipo: até aqui o CSV manda.
CREATE OR REPLACE FUNCTION public.trinks_csv_covered_through(p_store_id uuid, p_report text)
RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT coalesce(max(period_end), '-infinity'::date)
    FROM trinks_imports WHERE store_id = p_store_id AND report_type = p_report
$$;

CREATE OR REPLACE FUNCTION public.trinks_professional_name(p_store_id uuid, p_id bigint)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT coalesce(nullif(nickname, ''), name) FROM trinks_professionals
      WHERE store_id = p_store_id AND trinks_professional_id = p_id),
    CASE WHEN p_id IS NULL THEN NULL ELSE 'Profissional #' || p_id END)
$$;

-- Forma de pagamento do Trinks → coluna do fechamento.
CREATE OR REPLACE FUNCTION public.trinks_payment_bucket(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p ~ '(d[eé]bito|electron|maestro|redeshop)' THEN 'debit'
    WHEN p ~ '(cr[eé]dito cliente|pr[eé]-?pago|clube|assinatura|vale)' THEN 'prepaid'
    WHEN p ~ '(cr[eé]dito|visa|master|elo|amex|american|hiper|diners|cart[aã]o)' THEN 'credit'
    WHEN p ~ 'dinheiro' THEN 'cash'
    ELSE 'other'                                   -- PIX e demais, como no CSV
  END
  FROM (SELECT lower(coalesce(p_name, '')) AS p) x
$$;


-- ----------------------------------------------------------------------------
-- 3. Recalculos com precedência CSV × webhook
--    (substituem as versões de 20261009000001/000002)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_rebuild_daily_revenue(
  p_store_id uuid, p_from date, p_to date
) RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows int;
  v_csv  date := trinks_csv_covered_through(p_store_id, 'financeiro');
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _trinks_tx_day (
    business_date date, g numeric, s numeric, p numeric, pk numeric, disc numeric, t int
  ) ON COMMIT DROP;
  TRUNCATE _trinks_tx_day;

  INSERT INTO _trinks_tx_day
  SELECT t.business_date, sum(t.total), sum(t.services_total), sum(t.products_total),
         sum(t.packages_total), sum(t.discounts), count(*)
    FROM trinks_transactions t
   WHERE t.store_id = p_store_id
     AND t.business_date BETWEEN p_from AND p_to
     AND t.kind = 'pagamento'
     AND (t.source = 'csv' OR t.business_date > v_csv)
   GROUP BY t.business_date;

  UPDATE trinks_daily_revenue d
     SET gross_revenue = 0, services_revenue = 0, products_revenue = 0,
         packages_revenue = 0, discounts = 0, tickets_count = 0, synced_at = now()
   WHERE d.store_id = p_store_id
     AND d.business_date BETWEEN p_from AND p_to
     AND NOT EXISTS (SELECT 1 FROM _trinks_tx_day x WHERE x.business_date = d.business_date);

  INSERT INTO trinks_daily_revenue AS d (
    store_id, business_date, gross_revenue, services_revenue, products_revenue,
    packages_revenue, discounts, tickets_count, synced_at
  )
  SELECT p_store_id, business_date, g, s, p, pk, disc, t, now() FROM _trinks_tx_day
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

CREATE OR REPLACE FUNCTION public.trinks_rebuild_appointments(
  p_store_id uuid, p_from date, p_to date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_csv date := trinks_csv_covered_through(p_store_id, 'agendamentos');
BEGIN
  UPDATE trinks_daily_revenue d
     SET appointments_total = 0, appointments_done = 0, no_shows = 0, cancellations = 0
   WHERE d.store_id = p_store_id
     AND d.business_date BETWEEN p_from AND p_to
     AND NOT EXISTS (SELECT 1 FROM trinks_appointments a
                      WHERE a.store_id = p_store_id AND a.appointment_date = d.business_date
                        AND (a.source = 'csv' OR a.appointment_date > v_csv));

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
     AND (a.source = 'csv' OR a.appointment_date > v_csv)
   GROUP BY a.appointment_date
  ON CONFLICT (store_id, business_date) DO UPDATE SET
    appointments_total = EXCLUDED.appointments_total,
    appointments_done  = EXCLUDED.appointments_done,
    no_shows           = EXCLUDED.no_shows,
    cancellations      = EXCLUDED.cancellations;
END;
$$;

CREATE OR REPLACE FUNCTION public.trinks_rebuild_sales(
  p_store_id uuid, p_from date, p_to date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_csv date := trinks_csv_covered_through(p_store_id, 'comissoes');
BEGIN
  DELETE FROM trinks_service_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;
  DELETE FROM trinks_product_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;
  DELETE FROM trinks_professional_sales
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to;

  CREATE TEMP TABLE IF NOT EXISTS _trinks_items ON COMMIT DROP AS
    SELECT * FROM trinks_sale_items WITH NO DATA;
  TRUNCATE _trinks_items;
  INSERT INTO _trinks_items
  SELECT * FROM trinks_sale_items
   WHERE store_id = p_store_id AND business_date BETWEEN p_from AND p_to
     AND (source = 'csv' OR business_date > v_csv);

  INSERT INTO trinks_service_sales (store_id, business_date, item_key, name, qty, revenue, synced_at)
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(item_name)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(item_name)), count(*), sum(value), now()
    FROM _trinks_items WHERE item_type IN ('servico', 'pacote')
   GROUP BY 1, 2, 3;

  INSERT INTO trinks_product_sales (store_id, business_date, item_key, name, qty, revenue, synced_at)
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(item_name)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(item_name)), count(*), sum(value), now()
    FROM _trinks_items WHERE item_type = 'produto'
   GROUP BY 1, 2, 3;

  INSERT INTO trinks_professional_sales (
    store_id, business_date, professional_key, professional_name,
    services_count, revenue, commission, synced_at
  )
  SELECT p_store_id, business_date,
         left(regexp_replace(lower(btrim(professional)), '[^a-z0-9]+', '-', 'g'), 120),
         min(btrim(professional)),
         count(*) FILTER (WHERE item_type = 'servico'),
         sum(value), sum(commission_value), now()
    FROM _trinks_items
   WHERE coalesce(btrim(professional), '') <> ''
   GROUP BY 1, 2, 3;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. trinks_process_webhook_event(id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_process_webhook_event(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  e        trinks_webhook_events%ROWTYPE;
  m        jsonb;
  v_store  uuid;
  v_day    date;
  v_old    date;
  v_key    text;
  v_at     timestamptz;
  v_phone  text;
  v_result text;
BEGIN
  SELECT * INTO e FROM trinks_webhook_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'evento inexistente'; END IF;
  IF e.processed_at IS NOT NULL AND e.process_error IS NULL THEN RETURN 'ja processado'; END IF;

  m := e.payload;
  v_store := e.store_id;

  BEGIN
    IF e.sns_type <> 'Notification' OR m IS NULL THEN
      v_result := 'ignorado: ' || e.sns_type;

    ELSIF v_store IS NULL THEN
      -- Estabelecimento fora de trinks_units (ex.: Jaguaré, Vila Valério).
      v_result := 'ignorado: estabelecimento ' || coalesce(e.establishment_id::text, '?') || ' sem unidade';

    -- ── 1 Fechamento de conta ────────────────────────────────────────────────
    ELSIF e.event_type = 1 THEN
      IF m->>'IdDaTransacao' IS NULL OR m->>'DataDoFechamento' IS NULL THEN
        RAISE EXCEPTION 'fechamento sem IdDaTransacao/DataDoFechamento';
      END IF;
      v_key := m->>'IdDaTransacao';
      v_at  := (m->>'DataDoFechamento')::timestamp AT TIME ZONE 'America/Sao_Paulo';
      v_day := (m->>'DataDoFechamento')::date;

      -- Itens: produto tem EAN; serviço pela mesma regra do CSV (nome agendado).
      DELETE FROM trinks_sale_items
       WHERE store_id = v_store AND source = 'webhook' AND source_key LIKE v_key || ':%';

      INSERT INTO trinks_sale_items (
        store_id, source, source_key, business_date, paid_at, service_date,
        professional, trinks_professional_id, item_name, item_type,
        client_name, client_cpf, value, client_discount, discount_reason, registered_by
      )
      SELECT v_store, 'webhook', v_key || ':' || it.ord, v_day, v_at, v_day,
             trinks_professional_name(v_store, prof.id), prof.id,
             coalesce(nullif(btrim(it.j->>'Nome'), ''), 'Item ' || coalesce(it.j->>'Id', it.ord::text)),
             CASE
               WHEN coalesce(btrim(it.j->>'EAN'), '') <> '' THEN 'produto'
               WHEN regexp_replace(lower(btrim(it.j->>'Nome')), '\s+', ' ', 'g') IN (
                      SELECT DISTINCT regexp_replace(lower(btrim(service)), '\s+', ' ', 'g')
                        FROM trinks_appointments WHERE store_id = v_store AND service IS NOT NULL)
                 THEN 'servico'
               WHEN it.j->>'Nome' ILIKE 'pacote%' THEN 'pacote'
               ELSE 'produto'
             END,
             m->>'NomeDoCliente', nullif(regexp_replace(coalesce(m->>'CPFDoCliente', ''), '\D', '', 'g'), ''),
             trinks_num(it.j->'ValorUnitario') * greatest(trinks_num(it.j->'Quantidade'), 1),
             abs(trinks_num(it.j->'DescontoTotal')),
             nullif(btrim(it.j->>'MotivoDesconto'), ''),
             m->>'NomeDoProfissionalQueFechouConta'
        FROM jsonb_array_elements(coalesce(m->'Itens', '[]'::jsonb)) WITH ORDINALITY AS it(j, ord)
        -- Profissional do item: IdsDosProfissionaisEnvolvidos[].IdDosItens
        LEFT JOIN LATERAL (
          SELECT (p->>'IdDoProfissionalNoEstabelecimento')::bigint AS id
            FROM jsonb_array_elements(coalesce(m->'IdsDosProfissionaisEnvolvidos', '[]'::jsonb)) p
           WHERE p->'IdDosItens' @> jsonb_build_array((it.j->>'Id')::bigint)
           LIMIT 1
        ) prof ON true;

      INSERT INTO trinks_transactions (
        store_id, source, source_key, trinks_transaction_id, business_date, paid_at, service_date,
        kind, trinks_client_id, client_name,
        services_total, services_qty, products_total, products_qty, packages_total, packages_qty,
        discounts, pay_credit, pay_debit, pay_cash, pay_prepaid, pay_other, total, closed_by
      )
      SELECT v_store, 'webhook', v_key, v_key::bigint, v_day, v_at, v_day, 'pagamento',
             nullif(m->>'IdDoClienteNoEstabelecimento', '')::bigint, m->>'NomeDoCliente',
             coalesce(sum(s.value) FILTER (WHERE s.item_type = 'servico'), 0),
             count(*) FILTER (WHERE s.item_type = 'servico'),
             coalesce(sum(s.value) FILTER (WHERE s.item_type = 'produto'), 0),
             count(*) FILTER (WHERE s.item_type = 'produto'),
             coalesce(sum(s.value) FILTER (WHERE s.item_type = 'pacote'), 0),
             count(*) FILTER (WHERE s.item_type = 'pacote'),
             coalesce(sum(s.client_discount), 0),
             pay.credit, pay.debit, pay.cash, pay.prepaid, pay.other,
             trinks_num(m->'ValorDaCompra'),
             m->>'NomeDoProfissionalQueFechouConta'
        FROM (SELECT 1) one
        LEFT JOIN trinks_sale_items s
          ON s.store_id = v_store AND s.source = 'webhook' AND s.source_key LIKE v_key || ':%'
        CROSS JOIN LATERAL (
          SELECT coalesce(sum(trinks_num(f->'Valor')) FILTER (WHERE trinks_payment_bucket(f->>'FormaPagamento') = 'credit'), 0)  AS credit,
                 coalesce(sum(trinks_num(f->'Valor')) FILTER (WHERE trinks_payment_bucket(f->>'FormaPagamento') = 'debit'), 0)   AS debit,
                 coalesce(sum(trinks_num(f->'Valor')) FILTER (WHERE trinks_payment_bucket(f->>'FormaPagamento') = 'cash'), 0)    AS cash,
                 coalesce(sum(trinks_num(f->'Valor')) FILTER (WHERE trinks_payment_bucket(f->>'FormaPagamento') = 'prepaid'), 0) AS prepaid,
                 coalesce(sum(trinks_num(f->'Valor')) FILTER (WHERE trinks_payment_bucket(f->>'FormaPagamento') = 'other'), 0)   AS other
            FROM jsonb_array_elements(coalesce(m->'FormasDePagamento', '[]'::jsonb)) f
        ) pay
       GROUP BY pay.credit, pay.debit, pay.cash, pay.prepaid, pay.other
      ON CONFLICT (store_id, source, source_key) DO UPDATE SET
        business_date = EXCLUDED.business_date, paid_at = EXCLUDED.paid_at,
        kind = 'pagamento', client_name = EXCLUDED.client_name,
        services_total = EXCLUDED.services_total, services_qty = EXCLUDED.services_qty,
        products_total = EXCLUDED.products_total, products_qty = EXCLUDED.products_qty,
        packages_total = EXCLUDED.packages_total, packages_qty = EXCLUDED.packages_qty,
        discounts = EXCLUDED.discounts, pay_credit = EXCLUDED.pay_credit, pay_debit = EXCLUDED.pay_debit,
        pay_cash = EXCLUDED.pay_cash, pay_prepaid = EXCLUDED.pay_prepaid, pay_other = EXCLUDED.pay_other,
        total = EXCLUDED.total, closed_by = EXCLUDED.closed_by;

      PERFORM trinks_rebuild_daily_revenue(v_store, v_day, v_day);
      PERFORM trinks_rebuild_sales(v_store, v_day, v_day);
      v_result := 'fechamento ' || v_key;

    -- ── 2 Estorno ────────────────────────────────────────────────────────────
    ELSIF e.event_type = 2 THEN
      v_key := m->>'IdDaTransacao';
      IF v_key IS NULL THEN RAISE EXCEPTION 'estorno sem IdDaTransacao'; END IF;
      UPDATE trinks_transactions SET kind = 'estorno'
       WHERE store_id = v_store AND source = 'webhook' AND source_key = v_key
      RETURNING business_date INTO v_day;
      DELETE FROM trinks_sale_items
       WHERE store_id = v_store AND source = 'webhook' AND source_key LIKE v_key || ':%';
      IF v_day IS NOT NULL THEN
        PERFORM trinks_rebuild_daily_revenue(v_store, v_day, v_day);
        PERFORM trinks_rebuild_sales(v_store, v_day, v_day);
        v_result := 'estorno ' || v_key;
      ELSE
        -- Estorno de venda anterior ao webhook (veio por CSV): o próximo
        -- relatório importado já virá sem ela.
        v_result := 'estorno ' || v_key || ' sem fechamento via webhook';
      END IF;

    -- ── 3/4 Cliente ──────────────────────────────────────────────────────────
    ELSIF e.event_type IN (3, 4) THEN
      v_phone := m #>> '{Telefone,0,TelefoneCompleto}';
      v_day := nullif(m->>'DataDeInclusao', '')::date;
      INSERT INTO trinks_clients (
        store_id, client_key, trinks_client_id, name, cpf, email, phone_1, birth_date,
        registered_on, gender, acquisition_channel, origin, updated_at
      ) VALUES (
        v_store, trinks_client_key(m->>'Nome', m->>'CPF', v_phone),
        nullif(m->>'IdDoClienteNoEstabelecimento', '')::bigint,
        coalesce(nullif(btrim(m->>'Nome'), ''), 'Cliente'),
        nullif(regexp_replace(coalesce(m->>'CPF', ''), '\D', '', 'g'), ''),
        nullif(m->>'Email', ''), v_phone, nullif(m->>'DataDeNascimento', '')::date,
        v_day, nullif(m->>'Sexo', ''),
        nullif(m #>> '{ComoNosConheceu}', ''), nullif(m->>'OrigemDoCliente', ''), now()
      )
      ON CONFLICT (store_id, client_key) DO UPDATE SET
        trinks_client_id = coalesce(EXCLUDED.trinks_client_id, trinks_clients.trinks_client_id),
        name = EXCLUDED.name, cpf = coalesce(EXCLUDED.cpf, trinks_clients.cpf),
        email = coalesce(EXCLUDED.email, trinks_clients.email),
        phone_1 = coalesce(EXCLUDED.phone_1, trinks_clients.phone_1),
        birth_date = coalesce(EXCLUDED.birth_date, trinks_clients.birth_date),
        registered_on = coalesce(trinks_clients.registered_on, EXCLUDED.registered_on),
        updated_at = now();
      IF e.event_type = 3 AND v_day IS NOT NULL THEN
        PERFORM trinks_rebuild_new_customers(v_store, v_day, v_day);
      END IF;
      v_result := 'cliente';

    -- ── 5/6 Profissional ─────────────────────────────────────────────────────
    ELSIF e.event_type IN (5, 6) THEN
      INSERT INTO trinks_professionals (store_id, trinks_professional_id, name, nickname, updated_at)
      VALUES (v_store, (m->>'IdDoProfissionalNoEstabelecimento')::bigint,
              coalesce(nullif(btrim(m->>'Nome'), ''), 'Profissional'), nullif(btrim(m->>'Apelido'), ''), now())
      ON CONFLICT (store_id, trinks_professional_id) DO UPDATE SET
        name = EXCLUDED.name, nickname = EXCLUDED.nickname, updated_at = now();
      v_result := 'profissional';

    -- ── 11/12 Agendamento ────────────────────────────────────────────────────
    ELSIF e.event_type IN (11, 12) THEN
      v_key := m->>'IdDoAgendamento';
      IF v_key IS NULL OR m->>'DataHoraInicioDoAgendamento' IS NULL THEN
        RAISE EXCEPTION 'agendamento sem IdDoAgendamento/DataHoraInicioDoAgendamento';
      END IF;
      v_day := (m->>'DataHoraInicioDoAgendamento')::date;
      v_at  := coalesce(nullif(m->>'DataHoraEventoGerado', '')::timestamp AT TIME ZONE 'America/Sao_Paulo', e.sns_timestamp);
      v_phone := m #>> '{TelefoneDoCliente,0,TelefoneCompleto}';

      SELECT appointment_date INTO v_old FROM trinks_appointments
       WHERE store_id = v_store AND source = 'webhook' AND source_key = v_key;

      INSERT INTO trinks_appointments (
        store_id, source, source_key, appointment_date, starts_at, professional, trinks_professional_id,
        service, duration_min, value, status, origin, client_key, client_name, client_gender,
        client_phones, client_email, client_tags, notes, source_updated_at
      ) VALUES (
        v_store, 'webhook', v_key, v_day,
        (m->>'DataHoraInicioDoAgendamento')::timestamp AT TIME ZONE 'America/Sao_Paulo',
        trinks_professional_name(v_store, nullif(m->>'IdDoProfissionalNoEstabelecimento', '')::bigint),
        nullif(m->>'IdDoProfissionalNoEstabelecimento', '')::bigint,
        m->>'NomeDoServicoNoEstabelecimento',
        nullif(m->>'DuracaoDoAgendamento', '')::int,
        trinks_num(m->'PrecoDoServicoNoAgendamento'),
        coalesce(nullif(m->>'Status', ''), 'Desconhecido'),
        nullif(m->>'Origem', ''),
        trinks_client_key(m->>'NomeDoCliente', m->>'CpfDoCliente', v_phone),
        m->>'NomeDoCliente', nullif(m->>'SexoDoCliente', ''),
        (SELECT string_agg(t->>'TelefoneCompleto', ' / ')
           FROM jsonb_array_elements(coalesce(m->'TelefoneDoCliente', '[]'::jsonb)) t),
        nullif(m->>'EmailDoCliente', ''),
        (SELECT string_agg(x, ' / ') FROM jsonb_array_elements_text(coalesce(m->'Etiquetas', '[]'::jsonb)) x),
        nullif(m->>'Observacao', ''), v_at
      )
      ON CONFLICT (store_id, source, source_key) DO UPDATE SET
        appointment_date = EXCLUDED.appointment_date, starts_at = EXCLUDED.starts_at,
        professional = EXCLUDED.professional, trinks_professional_id = EXCLUDED.trinks_professional_id,
        service = EXCLUDED.service, duration_min = EXCLUDED.duration_min, value = EXCLUDED.value,
        status = EXCLUDED.status, origin = EXCLUDED.origin, client_tags = EXCLUDED.client_tags,
        notes = EXCLUDED.notes, source_updated_at = EXCLUDED.source_updated_at
      -- Evento fora de ordem não sobrescreve um mais novo.
      WHERE trinks_appointments.source_updated_at IS NULL
         OR EXCLUDED.source_updated_at >= trinks_appointments.source_updated_at;

      PERFORM trinks_rebuild_appointments(v_store, v_day, v_day);
      IF v_old IS NOT NULL AND v_old <> v_day THEN
        PERFORM trinks_rebuild_appointments(v_store, v_old, v_old);   -- remarcado de dia
      END IF;
      v_result := 'agendamento ' || v_key;

    -- ── 13 Exclusão de agendamento ──────────────────────────────────────────
    ELSIF e.event_type = 13 THEN
      v_key := m->>'IdDoAgendamento';
      DELETE FROM trinks_appointments
       WHERE store_id = v_store AND source = 'webhook' AND source_key = v_key
      RETURNING appointment_date INTO v_day;
      IF v_day IS NOT NULL THEN PERFORM trinks_rebuild_appointments(v_store, v_day, v_day); END IF;
      v_result := 'agendamento excluido ' || coalesce(v_key, '?');

    ELSE
      v_result := 'ignorado: tipo ' || coalesce(e.event_type::text, '?');
    END IF;

    UPDATE trinks_webhook_events SET processed_at = now(), process_error = NULL WHERE id = e.id;
    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    -- O bloco interno desfaz tudo o que o evento gravou; só o erro fica.
    UPDATE trinks_webhook_events SET processed_at = now(), process_error = SQLERRM WHERE id = e.id;
    RETURN 'erro: ' || SQLERRM;
  END;
END;
$$;

-- Reprocessa pendentes e com erro (depois de corrigir uma regra) em ordem.
CREATE OR REPLACE FUNCTION public.trinks_process_pending_webhooks(p_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  v_ok int := 0;
  v_err int := 0;
  v_res text;
BEGIN
  FOR r IN
    SELECT id FROM trinks_webhook_events
     WHERE processed_at IS NULL OR process_error IS NOT NULL
     ORDER BY coalesce(sns_timestamp, received_at)
     LIMIT p_limit
  LOOP
    v_res := trinks_process_webhook_event(r.id);
    IF v_res LIKE 'erro:%' THEN v_err := v_err + 1; ELSE v_ok := v_ok + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', v_ok, 'erros', v_err);
END;
$$;

REVOKE ALL ON FUNCTION public.trinks_process_webhook_event(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_process_pending_webhooks(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trinks_process_webhook_event(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_process_pending_webhooks(int) TO service_role;

-- Rede de segurança: a edge function processa na hora; o cron pega o que
-- tiver falhado por erro transitório (e reprocessa erros a cada 15 min).
SELECT cron.schedule('trinks-process-webhooks', '*/15 * * * *',
                     'SELECT public.trinks_process_pending_webhooks(500)');
