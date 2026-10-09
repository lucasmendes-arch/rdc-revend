-- ============================================================================
-- Agenda espelhada do Trinks + rastreio de faltas/cancelamentos
--
-- 1. Cancelamento (webhook 13) deixa de apagar o agendamento: vira status
--    "Cancelado" com cancelled_at, para o histórico da cliente e o resgate.
-- 2. ends_at, booked_at e cadastro da cliente passam a ser gravados pelo
--    webhook; função e fim de contrato do profissional (eventos 5/6).
-- 3. Carga de agendamentos futuros (source = 'seed'): o CSV de Agendamentos
--    exportado com datas a partir de hoje. O webhook só cobre o que muda
--    depois da ativação; sem a carga, um horário marcado antes e nunca
--    alterado não existiria. O CSV não traz o ID do agendamento, então a
--    linha da carga sai quando o webhook mostra o mesmo agendamento
--    (trinks_seed_consume: mesma cliente, mesmo serviço ou mesmo horário,
--    o mais próximo no tempo). A carga não conta como cobertura de CSV
--    (report_type 'agenda_seed'), então não desliga o webhook nos resumos.
-- 4. trinks_agenda_day(store, data): o que a tela /admin/agenda desenha.
-- 5. CRM: última falta/cancelamento por cliente e se ela já remarcou;
--    segmento semeado "Faltaram ou cancelaram (7 dias)".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas e constraints
-- ----------------------------------------------------------------------------
ALTER TABLE public.trinks_appointments
  DROP CONSTRAINT IF EXISTS trinks_appointments_source_check;
ALTER TABLE public.trinks_appointments
  ADD CONSTRAINT trinks_appointments_source_check CHECK (source IN ('csv', 'webhook', 'seed'));

ALTER TABLE public.trinks_appointments
  ADD COLUMN IF NOT EXISTS ends_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;   -- quando o cancelamento chegou (webhook); CSV não informa

UPDATE public.trinks_appointments
   SET ends_at = starts_at + make_interval(mins => duration_min)
 WHERE ends_at IS NULL AND starts_at IS NOT NULL AND duration_min IS NOT NULL;

ALTER TABLE public.trinks_imports
  DROP CONSTRAINT IF EXISTS trinks_imports_report_type_check;
ALTER TABLE public.trinks_imports
  ADD CONSTRAINT trinks_imports_report_type_check
  CHECK (report_type IN ('financeiro', 'clientes', 'agendamentos', 'comissoes', 'agenda_seed'));

ALTER TABLE public.trinks_professionals
  ADD COLUMN IF NOT EXISTS role         text,    -- "Funcao" do Trinks (Cabeleireiro(a), Recepção...)
  ADD COLUMN IF NOT EXISTS contract_end date;    -- "DataFimContrato"

-- Profissionais que já chegaram antes desta migration: preenche pela última
-- mensagem 5/6 de cada um (o reprocessamento abaixo também faria).
UPDATE public.trinks_professionals p
   SET role = nullif(btrim(x.payload->>'Funcao'), ''),
       contract_end = to_date(nullif(btrim(x.payload->>'DataFimContrato'), ''), 'DD/MM/YYYY')
  FROM (SELECT DISTINCT ON (store_id, payload->>'IdDoProfissionalNoEstabelecimento')
               store_id, payload
          FROM public.trinks_webhook_events
         WHERE event_type IN (5, 6) AND store_id IS NOT NULL
         ORDER BY store_id, payload->>'IdDoProfissionalNoEstabelecimento', sns_timestamp DESC) x
 WHERE p.store_id = x.store_id
   AND p.trinks_professional_id = (x.payload->>'IdDoProfissionalNoEstabelecimento')::bigint;


-- ----------------------------------------------------------------------------
-- 2. Carga de agendamentos futuros
-- ----------------------------------------------------------------------------

-- Remove a linha da carga que corresponde a um agendamento visto pelo
-- webhook e devolve o dia dela (para recalcular o resumo). p_booked_at =
-- quando o agendamento foi marcado, se conhecido: o que foi marcado depois
-- da exportação não pode estar nela.
CREATE OR REPLACE FUNCTION public.trinks_seed_consume(
  p_store_id uuid, p_client_name text, p_service text, p_starts_at timestamptz, p_booked_at timestamptz
) RETURNS date
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_day date;
BEGIN
  IF p_client_name IS NULL OR p_starts_at IS NULL THEN RETURN NULL; END IF;

  DELETE FROM trinks_appointments t
   WHERE t.id = (
     SELECT a.id
       FROM trinks_appointments a
       JOIN trinks_imports i ON i.id = a.import_id
      WHERE a.store_id = p_store_id AND a.source = 'seed'
        AND salon_norm_name(a.client_name) = salon_norm_name(p_client_name)
        AND (a.service = p_service OR a.starts_at = p_starts_at)
        AND (p_booked_at IS NULL OR i.generated_at >= p_booked_at)
      ORDER BY (a.service = p_service) DESC NULLS LAST,
               abs(extract(epoch FROM a.starts_at - p_starts_at))
      LIMIT 1)
  RETURNING t.appointment_date INTO v_day;
  RETURN v_day;
END;
$$;

-- Mesmo contrato das outras importações. Substitui a carga anterior no
-- período do arquivo e descarta o que o webhook já mostrou.
CREATE OR REPLACE FUNCTION public.trinks_import_agenda_seed(
  p_store_id uuid, p_import jsonb, p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_import_id uuid;
  v_from      date := (p_import->>'period_start')::date;
  v_to        date := (p_import->>'period_end')::date;
  v_gen       timestamptz := (p_import->>'generated_at')::timestamptz;
  v_removed   int;
  v_inserted  int;
  v_matched   int := 0;
  w           record;
BEGIN
  IF v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RAISE EXCEPTION 'periodo invalido: % a %', v_from, v_to;
  END IF;
  IF v_gen IS NULL THEN
    RAISE EXCEPTION 'carga de agenda precisa da data de geracao do relatorio';
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
  VALUES (p_store_id, 'agenda_seed', p_import->>'file_name', p_import->>'file_sha256',
          v_from, v_to, v_gen, jsonb_array_length(p_rows))
  RETURNING id INTO v_import_id;

  DELETE FROM trinks_appointments
   WHERE store_id = p_store_id AND source = 'seed' AND appointment_date BETWEEN v_from AND v_to;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO trinks_appointments (
    store_id, source, source_key, appointment_date, starts_at, ends_at, professional,
    professional_on_duty, assistant, service_category, service, duration_min, value, status,
    ticket_closed, booked_at, booked_by, origin, client_key, client_name, client_gender,
    client_phones, client_email, client_registered_at, client_tags, appointment_tags, notes, import_id
  )
  SELECT p_store_id, 'seed', r->>'source_key', (r->>'appointment_date')::date,
         (r->>'starts_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         (r->>'starts_at')::timestamp AT TIME ZONE 'America/Sao_Paulo'
           + make_interval(mins => coalesce((r->>'duration_min')::int, 30)),
         r->>'professional', (r->>'professional_on_duty')::boolean, r->>'assistant',
         r->>'service_category', r->>'service', (r->>'duration_min')::int,
         (r->>'value')::numeric, r->>'status', (r->>'ticket_closed')::boolean,
         (r->>'booked_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         r->>'booked_by', r->>'origin', r->>'client_key', r->>'client_name', r->>'client_gender',
         r->>'client_phones', r->>'client_email',
         (r->>'client_registered_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',
         r->>'client_tags', r->>'appointment_tags', r->>'notes', v_import_id
    FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (store_id, source, source_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- O que o webhook já trouxe ganha da carga. Só agendamentos que existiam
  -- quando o relatório foi gerado (marcados antes, ou de data desconhecida).
  FOR w IN
    SELECT client_name, service, starts_at, booked_at
      FROM trinks_appointments
     WHERE store_id = p_store_id AND source = 'webhook'
       AND appointment_date >= v_from
       AND (booked_at IS NULL OR booked_at <= v_gen)
     ORDER BY starts_at
  LOOP
    IF trinks_seed_consume(p_store_id, w.client_name, w.service, w.starts_at, NULL) IS NOT NULL THEN
      v_matched := v_matched + 1;
    END IF;
  END LOOP;

  UPDATE trinks_imports SET rows_inserted = v_inserted - v_matched, rows_removed = v_removed
   WHERE id = v_import_id;

  PERFORM trinks_rebuild_appointments(p_store_id, v_from, v_to);

  RETURN jsonb_build_object('import_id', v_import_id, 'rows', v_inserted - v_matched,
                            'already_in_webhook', v_matched, 'replaced', v_removed);
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Processamento do webhook (11/12/13 e 5/6 reescritos; o resto igual)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trinks_process_webhook_event(p_event_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
  v_status text;
  v_new    boolean;
  v_seed   date;
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
      INSERT INTO trinks_professionals (store_id, trinks_professional_id, name, nickname, role,
                                        contract_end, updated_at)
      VALUES (v_store, (m->>'IdDoProfissionalNoEstabelecimento')::bigint,
              coalesce(nullif(btrim(m->>'Nome'), ''), 'Profissional'), nullif(btrim(m->>'Apelido'), ''),
              nullif(btrim(m->>'Funcao'), ''),
              to_date(nullif(btrim(m->>'DataFimContrato'), ''), 'DD/MM/YYYY'), now())
      ON CONFLICT (store_id, trinks_professional_id) DO UPDATE SET
        name = EXCLUDED.name, nickname = EXCLUDED.nickname, role = EXCLUDED.role,
        contract_end = EXCLUDED.contract_end, updated_at = now();
      v_result := 'profissional';

    -- ── 11/12/13 Agendamento ─────────────────────────────────────────────────
    -- A exclusão (13) chega com o agendamento inteiro e Status "Cancelado":
    -- vira status, não DELETE, para o cancelamento ficar no histórico da
    -- cliente e no grupo de resgate do CRM.
    ELSIF e.event_type IN (11, 12, 13) THEN
      v_key := m->>'IdDoAgendamento';
      IF v_key IS NULL THEN
        RAISE EXCEPTION 'agendamento sem IdDoAgendamento';
      END IF;
      v_at := coalesce(nullif(m->>'DataHoraEventoGerado', '')::timestamp AT TIME ZONE 'America/Sao_Paulo', e.sns_timestamp);
      v_status := CASE WHEN e.event_type = 13 THEN 'Cancelado'
                       ELSE coalesce(nullif(m->>'Status', ''), 'Desconhecido') END;

      SELECT appointment_date INTO v_old FROM trinks_appointments
       WHERE store_id = v_store AND source = 'webhook' AND source_key = v_key;
      v_new := NOT FOUND;

      IF m->>'DataHoraInicioDoAgendamento' IS NULL THEN
        IF e.event_type <> 13 THEN
          RAISE EXCEPTION 'agendamento sem DataHoraInicioDoAgendamento';
        END IF;
        -- Exclusão sem os dados do agendamento: marca o que já existe.
        UPDATE trinks_appointments
           SET status = 'Cancelado', cancelled_at = coalesce(cancelled_at, v_at), source_updated_at = v_at
         WHERE store_id = v_store AND source = 'webhook' AND source_key = v_key
           AND (source_updated_at IS NULL OR v_at >= source_updated_at);
        v_day := v_old;
      ELSE
        v_day := (m->>'DataHoraInicioDoAgendamento')::date;
        v_phone := m #>> '{TelefoneDoCliente,0,TelefoneCompleto}';

        INSERT INTO trinks_appointments (
          store_id, source, source_key, appointment_date, starts_at, ends_at, professional,
          trinks_professional_id, service, duration_min, value, status, origin, client_key,
          client_name, client_gender, client_phones, client_email, client_registered_at, client_tags,
          notes, booked_at, cancelled_at, source_updated_at
        ) VALUES (
          v_store, 'webhook', v_key, v_day,
          (m->>'DataHoraInicioDoAgendamento')::timestamp AT TIME ZONE 'America/Sao_Paulo',
          nullif(m->>'DataHoraFimDoAgendamento', '')::timestamp AT TIME ZONE 'America/Sao_Paulo',
          trinks_professional_name(v_store, nullif(m->>'IdDoProfissionalNoEstabelecimento', '')::bigint),
          nullif(m->>'IdDoProfissionalNoEstabelecimento', '')::bigint,
          m->>'NomeDoServicoNoEstabelecimento',
          nullif(m->>'DuracaoDoAgendamento', '')::int,
          trinks_num(m->'PrecoDoServicoNoAgendamento'),
          v_status,
          nullif(m->>'Origem', ''),
          trinks_client_key(m->>'NomeDoCliente', m->>'CpfDoCliente', v_phone),
          m->>'NomeDoCliente', nullif(m->>'SexoDoCliente', ''),
          (SELECT string_agg(t->>'TelefoneCompleto', ' / ')
             FROM jsonb_array_elements(coalesce(m->'TelefoneDoCliente', '[]'::jsonb)) t),
          nullif(m->>'EmailDoCliente', ''),
          nullif(m->>'DataDeInclusaoDoClienteNoEstabelecimento', '')::timestamp AT TIME ZONE 'America/Sao_Paulo',
          (SELECT string_agg(x, ' / ') FROM jsonb_array_elements_text(coalesce(m->'Etiquetas', '[]'::jsonb)) x),
          nullif(m->>'Observacao', ''),
          CASE WHEN e.event_type = 11 THEN v_at END,          -- inclusão = momento em que foi marcado
          CASE WHEN v_status = 'Cancelado' THEN v_at END,
          v_at
        )
        ON CONFLICT (store_id, source, source_key) DO UPDATE SET
          appointment_date = EXCLUDED.appointment_date, starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          professional = EXCLUDED.professional, trinks_professional_id = EXCLUDED.trinks_professional_id,
          service = EXCLUDED.service, duration_min = EXCLUDED.duration_min, value = EXCLUDED.value,
          status = EXCLUDED.status, origin = EXCLUDED.origin, client_tags = EXCLUDED.client_tags,
          notes = EXCLUDED.notes,
          booked_at = coalesce(trinks_appointments.booked_at, EXCLUDED.booked_at),
          cancelled_at = CASE WHEN EXCLUDED.status = 'Cancelado'
                              THEN coalesce(trinks_appointments.cancelled_at, EXCLUDED.cancelled_at) END,
          source_updated_at = EXCLUDED.source_updated_at
        -- Evento fora de ordem não sobrescreve um mais novo.
        WHERE trinks_appointments.source_updated_at IS NULL
           OR EXCLUDED.source_updated_at >= trinks_appointments.source_updated_at;

        -- Primeira vez que este agendamento aparece: se ele veio na carga de
        -- agendamentos futuros (CSV), a linha da carga sai e esta assume.
        IF v_new THEN
          v_seed := trinks_seed_consume(
            v_store, m->>'NomeDoCliente', m->>'NomeDoServicoNoEstabelecimento',
            (m->>'DataHoraInicioDoAgendamento')::timestamp AT TIME ZONE 'America/Sao_Paulo',
            CASE WHEN e.event_type = 11 THEN v_at END);
        END IF;
      END IF;

      IF v_day IS NOT NULL THEN
        PERFORM trinks_rebuild_appointments(v_store, v_day, v_day);
      END IF;
      IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_day THEN
        PERFORM trinks_rebuild_appointments(v_store, v_old, v_old);   -- remarcado de dia
      END IF;
      IF v_seed IS NOT NULL AND v_seed IS DISTINCT FROM v_day AND v_seed IS DISTINCT FROM v_old THEN
        PERFORM trinks_rebuild_appointments(v_store, v_seed, v_seed);
      END IF;
      v_result := CASE WHEN e.event_type = 13 THEN 'agendamento cancelado ' ELSE 'agendamento ' END || v_key;

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



-- ----------------------------------------------------------------------------
-- 4. trinks_agenda_day(store, data) — a tela /admin/agenda
--
-- Colunas: profissionais com função de atendimento (não vazia, não recepção,
-- contrato vigente) + quem tiver agendamento no dia. Ordem = número no
-- apelido ("0 O Rei dos Cachos", "1 Willian"...), igual ao Trinks.
-- CSV/carga só trazem o rótulo do profissional: liga pelo apelido/nome.
-- SECURITY INVOKER: a RLS (is_admin) das tabelas decide quem vê.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_agenda_day(p_store_id uuid, p_date date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH pro AS (
    SELECT p.trinks_professional_id, p.name, coalesce(p.nickname, p.name) AS label, p.role, p.contract_end
      FROM trinks_professionals p
     WHERE p.store_id = p_store_id
  ),
  appt AS (
    SELECT a.*,
           coalesce(a.trinks_professional_id,
                    (SELECT pro.trinks_professional_id FROM pro
                      WHERE pro.label = a.professional OR pro.name = a.professional
                      ORDER BY (pro.label = a.professional) DESC LIMIT 1)) AS pro_id
      FROM trinks_appointments a
     WHERE a.store_id = p_store_id AND a.appointment_date = p_date AND a.starts_at IS NOT NULL
       AND (a.source = 'csv' OR a.appointment_date > trinks_csv_covered_through(p_store_id, 'agendamentos'))
  ),
  cols AS (
    SELECT pro.trinks_professional_id::text AS key, pro.label, pro.role
      FROM pro
     WHERE (pro.role IS NOT NULL AND pro.role NOT ILIKE 'recep%'
            AND (pro.contract_end IS NULL OR pro.contract_end >= p_date))
        OR EXISTS (SELECT 1 FROM appt WHERE appt.pro_id = pro.trinks_professional_id)
    UNION
    SELECT coalesce(appt.pro_id::text, 'label:' || coalesce(appt.professional, '?')),
           coalesce(appt.professional, 'Sem profissional'), NULL
      FROM appt
     WHERE appt.pro_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM pro WHERE pro.trinks_professional_id = appt.pro_id)
  )
  SELECT jsonb_build_object(
    'professionals', coalesce((
      SELECT jsonb_agg(jsonb_build_object('key', key, 'label', label, 'role', role)
                       ORDER BY substring(label FROM '^\s*(\d+)')::int NULLS LAST, label)
        FROM cols), '[]'::jsonb),
    'appointments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'source', a.source,
               'professional_key', coalesce(a.pro_id::text, 'label:' || coalesce(a.professional, '?')),
               'professional', a.professional,
               'starts_at', a.starts_at,
               'ends_at', coalesce(a.ends_at, a.starts_at + make_interval(mins => coalesce(a.duration_min, 30))),
               'service', a.service, 'category', a.service_category, 'value', a.value,
               'status', a.status, 'origin', a.origin,
               'client_key', a.client_key, 'client_name', a.client_name,
               'client_phones', a.client_phones, 'client_tags', a.client_tags,
               'appointment_tags', a.appointment_tags, 'notes', a.notes,
               'is_new', c.first_visit IS NULL OR c.first_visit >= p_date,
               'booked_at', a.booked_at, 'cancelled_at', a.cancelled_at
             ) ORDER BY a.starts_at)
        FROM appt a
        LEFT JOIN salon_clients c ON c.store_id = a.store_id AND c.client_key = a.client_key), '[]'::jsonb),
    'last_event_at', (SELECT max(received_at) FROM trinks_webhook_events WHERE store_id = p_store_id),
    'seed_generated_at', (SELECT max(generated_at) FROM trinks_imports
                           WHERE store_id = p_store_id AND report_type = 'agenda_seed')
  )
$$;


-- ----------------------------------------------------------------------------
-- 5. CRM: falta/cancelamento mais recente por cliente
--
-- missed_on = dia do agendamento (falta) ou dia em que cancelou (se o
-- webhook informou; senão o dia do agendamento). missed_unresolved = ainda
-- não tem outro agendamento válido daquele dia em diante (não remarcou nem
-- voltou). Colunas novas vão no FIM da view (CREATE OR REPLACE só permite
-- acrescentar); c.* expande para as mesmas colunas de antes.
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
         WHERE r.whatsapp = c.whatsapp AND r.status = 'enviada') AS last_campaign_at,
       miss.missed_on        AS last_missed_on,
       miss.status           AS last_missed_status,
       miss.service          AS last_missed_service,
       miss.reason           AS last_missed_reason,
       (miss.missed_on IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM trinks_appointments b
           WHERE b.store_id = c.store_id AND b.client_key = c.client_key
             AND b.id <> miss.id
             AND b.status NOT IN ('Cancelado', 'Cliente não compareceu')
             AND b.appointment_date >= miss.missed_on)) AS missed_unresolved
  FROM salon_clients c
  JOIN stores s ON s.id = c.store_id
  CROSS JOIN LATERAL (
    SELECT coalesce(
      (SELECT max(business_date) FROM trinks_daily_revenue d
        WHERE d.store_id = c.store_id AND d.gross_revenue > 0),
      current_date) AS ref_date
  ) ref
  LEFT JOIN LATERAL (
    SELECT a.id, a.status, a.service,
           CASE WHEN a.status = 'Cancelado'
                THEN coalesce((a.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date, a.appointment_date)
                ELSE a.appointment_date END AS missed_on,
           nullif(btrim(substring(a.notes FROM 'Observações de Cancelamento:\s*(.*)$')), '') AS reason
      FROM trinks_appointments a
     WHERE a.store_id = c.store_id AND a.client_key = c.client_key
       AND a.status IN ('Cancelado', 'Cliente não compareceu')
       AND a.appointment_date <= current_date + 90
     ORDER BY 4 DESC, a.starts_at DESC
     LIMIT 1
  ) miss ON true;

GRANT SELECT ON public.salon_clients_v TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_trinks_appointments_client_status
  ON public.trinks_appointments (store_id, client_key, status);



-- salon_crm_filter: + missed_within_days (int), missed_unresolved (bool)

CREATE OR REPLACE FUNCTION public.salon_crm_filter(f jsonb)
 RETURNS SETOF salon_clients_v
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
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
     AND (f->>'missed_within_days' IS NULL
          OR v.last_missed_on >= current_date - (f->>'missed_within_days')::int)
     AND (coalesce((f->>'missed_unresolved')::boolean, false) = false OR v.missed_unresolved)
$$;


INSERT INTO public.salon_segments (name, description, filters, is_system, sort_order)
SELECT 'Faltaram ou cancelaram (7 dias)',
       'Faltaram ou cancelaram nos últimos 7 dias e ainda não remarcaram: resgate da semana.',
       '{"missed_within_days": 7, "missed_unresolved": true, "has_whatsapp": true}'::jsonb, true, 5
 WHERE NOT EXISTS (SELECT 1 FROM public.salon_segments WHERE name = 'Faltaram ou cancelaram (7 dias)');


-- ----------------------------------------------------------------------------
-- 6. Permissões (DROP/CREATE não houve; CREATE OR REPLACE mantém grants,
--    mas as funções novas nascem com EXECUTE para PUBLIC)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trinks_seed_consume(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_import_agenda_seed(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_agenda_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trinks_seed_consume(uuid, text, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_import_agenda_seed(uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.trinks_agenda_day(uuid, date) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 7. Reprocessa profissionais e agendamentos já recebidos: preenche ends_at,
--    booked_at e cadastro, e devolve como "Cancelado" o que o 13 apagou.
--    Em ordem de chegada; a guarda source_updated_at mantém o estado final.
-- ----------------------------------------------------------------------------
UPDATE public.trinks_webhook_events
   SET processed_at = NULL
 WHERE event_type IN (5, 6, 11, 12, 13) AND store_id IS NOT NULL;

SELECT public.trinks_process_pending_webhooks(5000);
