-- ============================================================================
-- Escuta de WhatsApp — fundação (log passivo de conversas das unidades)
--
-- Generaliza a entrada de mensagens que nasceu na triagem de entrevistas do RH
-- (20260727000002, nunca ligada: whatsapp_messages tinha 0 linhas). Em vez de
-- um segundo webhook e um segundo log, há um só:
--
--   whatsapp_listen_settings   limite de silêncio da conversa (padrão 12h)
--   whatsapp_instances         + unidade, papel (atendimento/massa), escuta on/off
--   whatsapp_raw_events        payload bruto de cada evento (pode ser limpo)
--   whatsapp_contacts          números sem cadastro único no CRM ("só WhatsApp")
--   whatsapp_conversations     agrupamento por telefone × instância
--   whatsapp_messages          log append-only (recriada no formato novo)
--
-- 100% passivo: nada aqui envia, marca como lido ou simula digitação.
--
-- Telefone: phone_br_canonical() / phone_br_key() são a fonte única da regra.
-- normalize_phone_br() (RH) passa a ser um apelido de phone_br_key().
-- Casos cobertos: supabase/tests/phone_br_cases.json (npm run test:phone).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Configuração (mesmo padrão de salon_crm_settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_listen_settings (
  id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Silêncio máximo dentro de uma conversa. Passou disso, a próxima mensagem
  -- abre conversa nova e o job fecha a anterior.
  conversation_gap_hours  int NOT NULL DEFAULT 12 CHECK (conversation_gap_hours BETWEEN 1 AND 168),
  -- NULL = guarda o payload bruto para sempre. Com valor, o job horário apaga
  -- whatsapp_raw_events já processados mais velhos que isso.
  raw_retention_days      int CHECK (raw_retention_days IS NULL OR raw_retention_days >= 1),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_listen_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_listen_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_whatsapp_listen_settings ON public.whatsapp_listen_settings;
CREATE POLICY admin_all_whatsapp_listen_settings ON public.whatsapp_listen_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, UPDATE ON public.whatsapp_listen_settings TO authenticated;
GRANT SELECT, UPDATE ON public.whatsapp_listen_settings TO service_role;


-- ----------------------------------------------------------------------------
-- 1. Normalização de telefone — fonte única
--
-- phone_br_canonical: 55 + DDD + número, ou NULL quando não é telefone
-- brasileiro reconhecível. Não inventa o nono dígito: um celular antigo de 8
-- dígitos continua com 8 (é assim que muitas contas existem no WhatsApp).
--
-- Regras (levantadas na base de Linhares em 2026-10-10):
--   * aceita máscara, "+", espaço, sufixo de JID (@s.whatsapp.net, @c.us);
--   * JID @lid não é telefone → NULL;
--   * 55 na frente só é tirado quando o tamanho prova que é DDI (12/13
--     dígitos) — "(55) 9…" com 11 dígitos é DDD 55 (RS);
--   * zero de discagem na frente (0 + DDD + número) é tirado;
--   * DDD tem que existir na lista da Anatel;
--   * 11 dígitos: o 3º tem que ser 9 (nono dígito). Pega DDD digitado duas
--     vezes "(27) 27992-7963" e número truncado "(55) 27998-0230";
--   * 10 dígitos: o número tem que começar com 2–9 (fixo 2–5, celular antigo
--     6–9). "(98) 1254-2427" e "(27) 0000-0000" caem aqui;
--   * placeholder: os 8 últimos dígitos todos iguais (0000-0000, 9999-9999,
--     11111-1111) → NULL.
--
-- phone_br_key: DDD + 8 últimos dígitos. Casa o mesmo número com e sem o
-- nono dígito e com e sem DDI.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.phone_br_canonical(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  IF p IS NULL OR p ILIKE '%@lid%' THEN RETURN NULL; END IF;

  d := regexp_replace(split_part(p, '@', 1), '[^0-9]', '', 'g');

  IF length(d) IN (12, 13) AND left(d, 2) = '55' THEN
    d := substr(d, 3);
  ELSIF length(d) IN (11, 12) AND left(d, 1) = '0' THEN
    d := substr(d, 2);
  END IF;

  IF length(d) NOT IN (10, 11) THEN RETURN NULL; END IF;

  IF left(d, 2)::int NOT IN (
    11,12,13,14,15,16,17,18,19, 21,22,24,27,28, 31,32,33,34,35,37,38,
    41,42,43,44,45,46,47,48,49, 51,53,54,55, 61,62,63,64,65,66,67,68,69,
    71,73,74,75,77,79, 81,82,83,84,85,86,87,88,89, 91,92,93,94,95,96,97,98,99
  ) THEN
    RETURN NULL;
  END IF;

  IF length(d) = 11 AND substr(d, 3, 1) <> '9' THEN RETURN NULL; END IF;
  IF length(d) = 10 AND substr(d, 3, 1) NOT IN ('2','3','4','5','6','7','8','9') THEN RETURN NULL; END IF;

  IF right(d, 8) ~ '^(\d)\1{7}$' THEN RETURN NULL; END IF;

  RETURN '55' || d;
END;
$$;

CREATE OR REPLACE FUNCTION public.phone_br_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN c IS NULL THEN NULL ELSE substr(c, 3, 2) || right(c, 8) END
    FROM (SELECT public.phone_br_canonical(p) AS c) x
$$;

COMMENT ON FUNCTION public.phone_br_canonical(text) IS
  'Telefone BR canônico (55 + DDD + número) ou NULL. Fonte única da regra de telefone; casos em supabase/tests/phone_br_cases.json.';
COMMENT ON FUNCTION public.phone_br_key(text) IS
  'DDD + 8 últimos dígitos — casa o mesmo número com/sem nono dígito e com/sem DDI. NULL quando phone_br_canonical é NULL.';

-- O RH usava a própria versão. Agora é um apelido: uma regra só. A assinatura
-- (nome do parâmetro inclusive) é a mesma, então o índice de expressão em
-- candidates continua válido — só precisa ser reindexado.
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT public.phone_br_key(p_phone) $$;

REINDEX INDEX public.idx_candidates_phone_key;


-- ----------------------------------------------------------------------------
-- 2. phone_key nos clientes do CRM
--
-- Coluna gerada: o backfill acontece no próprio ALTER e todo insert/update
-- futuro (import CSV, webhook do Trinks) já sai com a chave. Se a regra de
-- phone_br_canonical mudar, recalcular com:
--   UPDATE trinks_clients SET phone_1 = phone_1;
-- ----------------------------------------------------------------------------
ALTER TABLE public.trinks_clients
  ADD COLUMN IF NOT EXISTS phone_key   text GENERATED ALWAYS AS (public.phone_br_key(phone_1)) STORED,
  ADD COLUMN IF NOT EXISTS phone_2_key text GENERATED ALWAYS AS (public.phone_br_key(phone_2)) STORED;

CREATE INDEX IF NOT EXISTS idx_trinks_clients_phone_key   ON public.trinks_clients (phone_key)   WHERE phone_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trinks_clients_phone_2_key ON public.trinks_clients (phone_2_key) WHERE phone_2_key IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 3. whatsapp_instances — unidade, papel, escuta
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS store_id       uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role           text CHECK (role IN ('atendimento', 'massa')),
  ADD COLUMN IF NOT EXISTS phone_number   text,
  -- Desligada por padrão: o webhook descarta evento de instância que não está
  -- explicitamente marcada para escuta.
  ADD COLUMN IF NOT EXISTS listen_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_instances.listen_enabled IS
  'Escuta passiva: só eventos de instâncias com true são gravados pelo webhook-uazapi.';

-- A tela de conversas (view security_invoker) precisa do nome/papel da
-- instância. Grant POR COLUNA: uazapi_token e uazapi_url continuam fora do
-- alcance de authenticated; e só admin enxerga as linhas.
DROP POLICY IF EXISTS admin_read_whatsapp_instances ON public.whatsapp_instances;
CREATE POLICY admin_read_whatsapp_instances ON public.whatsapp_instances
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT (id, name, is_active, store_id, role, phone_number, listen_enabled)
  ON public.whatsapp_instances TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Sai o log antigo do RH (vazio), entra o novo
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_messages) THEN
    RAISE EXCEPTION 'whatsapp_messages tem linhas — migrar os dados antes de recriar a tabela';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.record_whatsapp_message(text, text, text, text, text, timestamptz, jsonb);
DROP TABLE public.whatsapp_messages;


-- 4.1 Payload bruto -----------------------------------------------------------
CREATE TABLE public.whatsapp_raw_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id          uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  event_type           text,
  provider_message_id  text,
  -- Campos já extraídos pelo parser da edge function (_shared/uazapi-message.ts).
  parsed               jsonb,
  -- Como chegou, sem o token da instância.
  payload              jsonb NOT NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processed', 'ignored', 'error')),
  status_reason        text,
  attempts             int NOT NULL DEFAULT 0,
  processed_at         timestamptz,
  -- Reentrega da Uazapi não duplica nem o bruto.
  CONSTRAINT whatsapp_raw_events_message_unique UNIQUE (instance_id, provider_message_id)
);

CREATE INDEX idx_whatsapp_raw_events_pending
  ON public.whatsapp_raw_events (received_at) WHERE status IN ('pending', 'error');
CREATE INDEX idx_whatsapp_raw_events_received
  ON public.whatsapp_raw_events (received_at DESC);

COMMENT ON TABLE public.whatsapp_raw_events IS
  'Eventos de mensagem da Uazapi como chegaram (sem token). Debug e reprocessamento; pode ser limpa (whatsapp_listen_settings.raw_retention_days).';


-- 4.2 Contatos fora do CRM ----------------------------------------------------
CREATE TABLE public.whatsapp_contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identidade da pessoa: phone_key quando há telefone BR; 'tel:<dígitos>'
  -- para número estrangeiro/irreconhecível; 'lid:<jid>' sem telefone resolvido.
  party_key             text NOT NULL UNIQUE,
  phone                 text,            -- canônico (55…) quando há
  phone_key             text,
  jid                   text,            -- último JID visto
  lid                   text,            -- LID, quando apareceu
  push_name             text,            -- nome do perfil do WhatsApp
  match_status          text NOT NULL
                        CHECK (match_status IN ('matched', 'unmatched', 'shared', 'unresolved_lid')),
  -- Telefone compartilhado: as clientes empatadas. Nunca se escolhe uma.
  ambiguous_client_ids  uuid[],
  -- Preenchido quando a conciliação achar um cadastro único depois.
  client_id             uuid REFERENCES public.trinks_clients(id) ON DELETE SET NULL,
  reconciled_at         timestamptz,
  first_seen_at         timestamptz NOT NULL,
  last_seen_at          timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_contacts_phone_key ON public.whatsapp_contacts (phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX idx_whatsapp_contacts_pending   ON public.whatsapp_contacts (phone_key) WHERE client_id IS NULL;


-- 4.3 Conversas ---------------------------------------------------------------
-- A conversa pertence ao telefone (party_key) dentro de uma instância, não a
-- uma cliente: client_id/contact_id são a identificação mais recente dele.
CREATE TABLE public.whatsapp_conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id           uuid NOT NULL REFERENCES public.whatsapp_instances(id),
  store_id              uuid REFERENCES public.stores(id) ON DELETE SET NULL,  -- da instância, na abertura
  party_key             text NOT NULL,
  phone                 text,
  client_id             uuid REFERENCES public.trinks_clients(id) ON DELETE SET NULL,
  contact_id            uuid REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  match_status          text NOT NULL
                        CHECK (match_status IN ('matched', 'unmatched', 'shared', 'unresolved_lid')),
  ambiguous_client_ids  uuid[],

  status                text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  opened_at             timestamptz NOT NULL,
  last_message_at       timestamptz NOT NULL,
  -- = last_message_at + limite de silêncio (o instante em que a conversa
  -- expirou), independente de quando o job rodou.
  closed_at             timestamptz,

  -- Reações não entram em nenhum destes campos nem nas contagens.
  first_inbound_at      timestamptz,
  first_outbound_at     timestamptz,     -- qualquer envio (inclusive API)
  first_human_reply_at  timestamptz,     -- 1º envio não-API depois da 1ª mensagem recebida
  inbound_count         int NOT NULL DEFAULT 0,
  outbound_count        int NOT NULL DEFAULT 0,
  last_direction        text CHECK (last_direction IN ('inbound', 'outbound')),

  -- Etapa futura (resumo por LLM). Nada preenche estes campos ainda.
  intent                text,
  sentiment             text,
  summary               text,
  summary_model         text,
  summarized_at         timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- No máximo uma conversa aberta por telefone × instância.
CREATE UNIQUE INDEX uq_whatsapp_conversations_open
  ON public.whatsapp_conversations (instance_id, party_key) WHERE status = 'aberta';
CREATE INDEX idx_whatsapp_conversations_party ON public.whatsapp_conversations (instance_id, party_key, last_message_at DESC);
CREATE INDEX idx_whatsapp_conversations_store ON public.whatsapp_conversations (store_id, last_message_at DESC);
CREATE INDEX idx_whatsapp_conversations_open  ON public.whatsapp_conversations (last_message_at) WHERE status = 'aberta';


-- 4.4 Mensagens (append-only) -------------------------------------------------
CREATE TABLE public.whatsapp_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id           uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  conversation_id       uuid NOT NULL REFERENCES public.whatsapp_conversations(id),
  raw_event_id          uuid REFERENCES public.whatsapp_raw_events(id) ON DELETE SET NULL,
  provider_message_id   text NOT NULL,

  party_key             text NOT NULL,
  phone_key             text,
  phone_raw             text,            -- JID/telefone como veio
  -- Identificação no momento da mensagem (snapshot; a conversa guarda a atual).
  client_id             uuid REFERENCES public.trinks_clients(id) ON DELETE SET NULL,
  contact_id            uuid REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  candidate_id          uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  match_status          text NOT NULL
                        CHECK (match_status IN ('matched', 'unmatched', 'shared', 'unresolved_lid')),

  direction             text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  was_sent_by_api       boolean NOT NULL DEFAULT false,
  message_type          text NOT NULL DEFAULT 'text'
                        CHECK (message_type IN ('text', 'audio', 'image', 'video', 'document', 'sticker',
                                                'location', 'contact', 'reaction', 'other')),
  provider_type         text,            -- messageType cru da Uazapi
  body                  text,
  media                 jsonb,           -- só metadados (mimetype, tamanho, duração…); arquivo não é baixado
  sent_at               timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_messages_provider_unique UNIQUE (instance_id, provider_message_id)
);

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages (conversation_id, sent_at);
CREATE INDEX idx_whatsapp_messages_candidate    ON public.whatsapp_messages (candidate_id, sent_at) WHERE candidate_id IS NOT NULL;
CREATE INDEX idx_whatsapp_messages_client       ON public.whatsapp_messages (client_id, sent_at DESC) WHERE client_id IS NOT NULL;

COMMENT ON TABLE public.whatsapp_messages IS
  'Log append-only de mensagens de WhatsApp (todas as instâncias em escuta). Escrito só por whatsapp_process_raw_event (service_role). UPDATE/DELETE bloqueados por trigger.';

-- Append-only. A única alteração aceita é uma FK virar NULL por ON DELETE SET
-- NULL (ex.: purge_archived_candidates apaga o candidato, limpeza do bruto).
CREATE OR REPLACE FUNCTION public.whatsapp_messages_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fks text[] := ARRAY['instance_id', 'raw_event_id', 'client_id', 'contact_id', 'candidate_id'];
  c text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'whatsapp_messages é append-only: DELETE não permitido';
  END IF;
  FOREACH c IN ARRAY fks LOOP
    IF (to_jsonb(NEW) ->> c) IS NOT NULL AND (to_jsonb(NEW) ->> c) IS DISTINCT FROM (to_jsonb(OLD) ->> c) THEN
      RAISE EXCEPTION 'whatsapp_messages é append-only: % não pode ser alterado', c;
    END IF;
  END LOOP;
  IF (to_jsonb(NEW) - fks) IS DISTINCT FROM (to_jsonb(OLD) - fks) THEN
    RAISE EXCEPTION 'whatsapp_messages é append-only: UPDATE não permitido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_whatsapp_messages_append_only
  BEFORE UPDATE OR DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_messages_append_only();


-- 4.5 RLS / grants ------------------------------------------------------------
ALTER TABLE public.whatsapp_raw_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages       ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_read_whatsapp_raw_events    ON public.whatsapp_raw_events    FOR SELECT USING (public.is_admin());
CREATE POLICY admin_read_whatsapp_contacts      ON public.whatsapp_contacts      FOR SELECT USING (public.is_admin());
CREATE POLICY admin_read_whatsapp_conversations ON public.whatsapp_conversations FOR SELECT USING (public.is_admin());
-- RH continua lendo a conversa dos candidatos (get_candidate_conversation);
-- conversa de cliente das unidades é só admin.
CREATE POLICY read_whatsapp_messages ON public.whatsapp_messages FOR SELECT
  USING (public.is_admin() OR (candidate_id IS NOT NULL AND public.has_rh_access()));

GRANT SELECT ON public.whatsapp_raw_events, public.whatsapp_contacts,
                public.whatsapp_conversations, public.whatsapp_messages TO authenticated;
-- Projeto sem grants padrão para service_role (ver private-docs/memory.md).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_raw_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_contacts, public.whatsapp_conversations TO service_role;
GRANT SELECT, INSERT ON public.whatsapp_messages TO service_role;


-- ----------------------------------------------------------------------------
-- 5. Conciliação telefone → cliente
--
-- Rede toda, phone_1 e phone_2. Mais de uma cliente: fica a da mesma unidade
-- da instância, se for só uma. Empate que persiste = 'shared' (telefone
-- compartilhado), com as empatadas em tied_client_ids. Nunca no chute.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_match_client(
  p_phone_key text,
  p_store_id uuid,
  OUT match_status text,
  OUT client_id uuid,
  OUT tied_client_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_all  uuid[];
  v_same uuid[];
BEGIN
  IF p_phone_key IS NULL THEN
    match_status := 'unmatched';
    RETURN;
  END IF;

  SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}') INTO v_all
    FROM trinks_clients c
   WHERE c.phone_key = p_phone_key OR c.phone_2_key = p_phone_key;

  IF cardinality(v_all) = 0 THEN
    match_status := 'unmatched';
  ELSIF cardinality(v_all) = 1 THEN
    match_status := 'matched';
    client_id := v_all[1];
  ELSE
    SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}') INTO v_same
      FROM trinks_clients c
     WHERE c.id = ANY (v_all) AND c.store_id = p_store_id;

    IF cardinality(v_same) = 1 THEN
      match_status := 'matched';
      client_id := v_same[1];
    ELSE
      match_status := 'shared';
      tied_client_ids := CASE WHEN cardinality(v_same) > 1 THEN v_same ELSE v_all END;
    END IF;
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. Processamento de um evento bruto
--
-- Chamado pelo webhook logo depois de gravar o bruto (EdgeRuntime.waitUntil)
-- e, como rede de segurança, pelo cron whatsapp-process-pending. O lock na
-- linha do bruto evita que os dois processem o mesmo evento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_process_raw_event(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  e            whatsapp_raw_events%ROWTYPE;
  p            jsonb;
  v_store_id   uuid;
  v_gap        interval;
  v_ts         timestamptz;
  v_dir        text;
  v_type       text;
  v_phone_raw  text;
  v_lid        text;
  v_canonical  text;
  v_phone_key  text;
  v_party      text;
  v_digits     text;
  m            record;
  v_contact_id uuid;
  v_candidate  uuid;
  v_conv_id    uuid;
  v_has_open   boolean;
BEGIN
  SELECT * INTO e FROM whatsapp_raw_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'nao encontrado'; END IF;
  IF e.status IN ('processed', 'ignored') THEN RETURN 'ja processado'; END IF;

  BEGIN
    p := e.parsed;
    IF p IS NULL OR e.instance_id IS NULL THEN
      RAISE EXCEPTION 'evento sem parse ou sem instância';
    END IF;

    -- Reentrega que passou pelo bruto (ex.: bruto apagado e recebido de novo).
    IF EXISTS (SELECT 1 FROM whatsapp_messages
                WHERE instance_id = e.instance_id AND provider_message_id = e.provider_message_id) THEN
      UPDATE whatsapp_raw_events
         SET status = 'ignored', status_reason = 'duplicada', processed_at = now()
       WHERE id = e.id;
      RETURN 'duplicada';
    END IF;

    SELECT store_id INTO v_store_id FROM whatsapp_instances WHERE id = e.instance_id;
    SELECT make_interval(hours => conversation_gap_hours) INTO v_gap FROM whatsapp_listen_settings WHERE id = 1;
    v_gap := coalesce(v_gap, interval '12 hours');

    v_ts        := coalesce((p ->> 'sentAt')::timestamptz, e.received_at);
    v_dir       := p ->> 'direction';
    v_type      := coalesce(p ->> 'messageType', 'other');
    v_phone_raw := nullif(p ->> 'phoneRaw', '');
    v_lid       := nullif(p ->> 'lid', '');
    v_canonical := phone_br_canonical(v_phone_raw);
    v_phone_key := phone_br_key(v_phone_raw);
    v_digits    := regexp_replace(split_part(coalesce(v_phone_raw, ''), '@', 1), '[^0-9]', '', 'g');

    -- Identidade da pessoa nesta conversa.
    v_party := CASE
      WHEN v_phone_key IS NOT NULL THEN v_phone_key
      WHEN v_digits <> '' THEN 'tel:' || v_digits
      WHEN v_lid IS NOT NULL THEN 'lid:' || v_lid
      ELSE 'jid:' || coalesce(p ->> 'partyJid', e.provider_message_id)
    END;

    IF v_phone_key IS NOT NULL THEN
      SELECT * INTO m FROM whatsapp_match_client(v_phone_key, v_store_id);
      v_candidate := resolve_candidate_by_phone(v_phone_key);
    ELSIF v_digits = '' THEN
      SELECT 'unresolved_lid'::text AS match_status, NULL::uuid AS client_id, NULL::uuid[] AS tied_client_ids INTO m;
    ELSE
      SELECT 'unmatched'::text AS match_status, NULL::uuid AS client_id, NULL::uuid[] AS tied_client_ids INTO m;
    END IF;

    -- Quem não casou com uma cliente só vira contato "só WhatsApp".
    IF m.match_status <> 'matched' THEN
      INSERT INTO whatsapp_contacts (
        party_key, phone, phone_key, jid, lid, push_name, match_status,
        ambiguous_client_ids, first_seen_at, last_seen_at
      ) VALUES (
        v_party, v_canonical, v_phone_key, p ->> 'partyJid', v_lid, nullif(p ->> 'pushName', ''),
        m.match_status, m.tied_client_ids, v_ts, v_ts
      )
      ON CONFLICT (party_key) DO UPDATE SET
        phone                = coalesce(EXCLUDED.phone, whatsapp_contacts.phone),
        jid                  = coalesce(EXCLUDED.jid, whatsapp_contacts.jid),
        lid                  = coalesce(EXCLUDED.lid, whatsapp_contacts.lid),
        push_name            = coalesce(EXCLUDED.push_name, whatsapp_contacts.push_name),
        match_status         = EXCLUDED.match_status,
        ambiguous_client_ids = EXCLUDED.ambiguous_client_ids,
        first_seen_at        = least(whatsapp_contacts.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at         = greatest(whatsapp_contacts.last_seen_at, EXCLUDED.last_seen_at),
        updated_at           = now()
      RETURNING id INTO v_contact_id;
    ELSE
      -- Cadastrada agora, mas já tinha aparecido como contato: aponta o
      -- contato para ela (conciliação imediata).
      UPDATE whatsapp_contacts
         SET client_id = m.client_id, match_status = 'matched', ambiguous_client_ids = NULL,
             reconciled_at = now(), last_seen_at = greatest(last_seen_at, v_ts), updated_at = now()
       WHERE party_key = v_party
      RETURNING id INTO v_contact_id;
    END IF;

    -- Serializa mensagens da mesma pessoa na mesma instância.
    PERFORM pg_advisory_xact_lock(hashtextextended(e.instance_id::text || '|' || v_party, 0));

    -- Conversa cuja janela cobre esta mensagem (aceita chegada fora de ordem).
    SELECT id INTO v_conv_id
      FROM whatsapp_conversations
     WHERE instance_id = e.instance_id AND party_key = v_party
       AND opened_at - v_gap <= v_ts AND last_message_at + v_gap >= v_ts
     ORDER BY last_message_at DESC
     LIMIT 1;

    IF v_conv_id IS NULL THEN
      -- A aberta anterior ficou para trás: fecha no instante em que expirou.
      UPDATE whatsapp_conversations
         SET status = 'fechada', closed_at = last_message_at + v_gap, updated_at = now()
       WHERE instance_id = e.instance_id AND party_key = v_party
         AND status = 'aberta' AND last_message_at + v_gap < v_ts;

      v_has_open := EXISTS (SELECT 1 FROM whatsapp_conversations
                             WHERE instance_id = e.instance_id AND party_key = v_party AND status = 'aberta');

      INSERT INTO whatsapp_conversations (
        instance_id, store_id, party_key, phone, client_id, contact_id, match_status,
        ambiguous_client_ids, status, opened_at, last_message_at, closed_at
      ) VALUES (
        e.instance_id, v_store_id, v_party, v_canonical, m.client_id, v_contact_id, m.match_status,
        m.tied_client_ids,
        CASE WHEN NOT v_has_open AND v_ts + v_gap > now() THEN 'aberta' ELSE 'fechada' END,
        v_ts, v_ts,
        CASE WHEN NOT v_has_open AND v_ts + v_gap > now() THEN NULL ELSE v_ts + v_gap END
      )
      RETURNING id INTO v_conv_id;
    END IF;

    INSERT INTO whatsapp_messages (
      instance_id, conversation_id, raw_event_id, provider_message_id,
      party_key, phone_key, phone_raw, client_id, contact_id, candidate_id, match_status,
      direction, was_sent_by_api, message_type, provider_type, body, media, sent_at
    ) VALUES (
      e.instance_id, v_conv_id, e.id, e.provider_message_id,
      v_party, v_phone_key, coalesce(v_phone_raw, p ->> 'partyJid'), m.client_id, v_contact_id, v_candidate, m.match_status,
      v_dir, coalesce((p ->> 'wasSentByApi')::boolean, false), v_type, nullif(p ->> 'providerType', ''),
      nullif(p ->> 'body', ''), CASE WHEN jsonb_typeof(p -> 'media') = 'object' THEN p -> 'media' END, v_ts
    );

    -- Recalcula a conversa a partir das mensagens: robusto a chegada fora de
    -- ordem e a reprocessamento.
    UPDATE whatsapp_conversations c
       SET opened_at            = a.opened_at,
           last_message_at      = a.last_message_at,
           closed_at            = CASE WHEN c.status = 'fechada' THEN a.last_message_at + v_gap END,
           first_inbound_at     = a.first_inbound_at,
           first_outbound_at    = a.first_outbound_at,
           first_human_reply_at = a.first_human_reply_at,
           inbound_count        = a.inbound_count,
           outbound_count       = a.outbound_count,
           last_direction       = a.last_direction,
           client_id            = CASE WHEN v_ts >= c.last_message_at THEN m.client_id ELSE c.client_id END,
           contact_id           = CASE WHEN v_ts >= c.last_message_at THEN v_contact_id ELSE c.contact_id END,
           match_status         = CASE WHEN v_ts >= c.last_message_at THEN m.match_status ELSE c.match_status END,
           ambiguous_client_ids = CASE WHEN v_ts >= c.last_message_at THEN m.tied_client_ids ELSE c.ambiguous_client_ids END,
           phone                = coalesce(c.phone, v_canonical),
           updated_at           = now()
      FROM (
        SELECT min(sent_at) AS opened_at,
               max(sent_at) AS last_message_at,
               min(sent_at) FILTER (WHERE direction = 'inbound'  AND message_type <> 'reaction') AS first_inbound_at,
               min(sent_at) FILTER (WHERE direction = 'outbound' AND message_type <> 'reaction') AS first_outbound_at,
               count(*)     FILTER (WHERE direction = 'inbound'  AND message_type <> 'reaction') AS inbound_count,
               count(*)     FILTER (WHERE direction = 'outbound' AND message_type <> 'reaction') AS outbound_count,
               (array_agg(direction ORDER BY sent_at DESC, created_at DESC)
                  FILTER (WHERE message_type <> 'reaction'))[1] AS last_direction,
               (SELECT min(o.sent_at) FROM whatsapp_messages o
                 WHERE o.conversation_id = v_conv_id AND o.direction = 'outbound'
                   AND NOT o.was_sent_by_api AND o.message_type <> 'reaction'
                   AND o.sent_at >= (SELECT min(i.sent_at) FROM whatsapp_messages i
                                      WHERE i.conversation_id = v_conv_id AND i.direction = 'inbound'
                                        AND i.message_type <> 'reaction')) AS first_human_reply_at
          FROM whatsapp_messages
         WHERE conversation_id = v_conv_id
      ) a
     WHERE c.id = v_conv_id;

    UPDATE whatsapp_raw_events
       SET status = 'processed', status_reason = NULL, processed_at = now(), attempts = attempts + 1
     WHERE id = e.id;
    RETURN 'ok';

  EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events
       SET status = 'error', status_reason = SQLERRM, processed_at = now(), attempts = attempts + 1
     WHERE id = p_id;
    RETURN 'erro: ' || SQLERRM;
  END;
END;
$$;

-- Fila: pendentes e erros com menos de 5 tentativas.
CREATE OR REPLACE FUNCTION public.whatsapp_process_pending(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  v_res text;
  v_ok int := 0;
  v_err int := 0;
BEGIN
  FOR r IN
    SELECT id FROM whatsapp_raw_events
     WHERE (status = 'pending' AND received_at < now() - interval '30 seconds')
        OR (status = 'error' AND attempts < 5)
     ORDER BY received_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    v_res := whatsapp_process_raw_event(r.id);
    IF v_res LIKE 'erro%' THEN v_err := v_err + 1; ELSE v_ok := v_ok + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', v_ok, 'error', v_err);
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. Fechamento por silêncio, reconciliação e limpeza
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_close_stale_conversations()
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_gap interval;
  v_rows int;
BEGIN
  SELECT make_interval(hours => conversation_gap_hours) INTO v_gap FROM whatsapp_listen_settings WHERE id = 1;
  v_gap := coalesce(v_gap, interval '12 hours');

  UPDATE whatsapp_conversations
     SET status = 'fechada', closed_at = last_message_at + v_gap, updated_at = now()
   WHERE status = 'aberta' AND last_message_at + v_gap < now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Refaz o casamento dos contatos ainda sem cliente (o CRM ganha cadastros com
-- o tempo). Contato que passou a ter cadastro único recebe client_id, e as
-- conversas dele também.
CREATE OR REPLACE FUNCTION public.whatsapp_reconcile_contacts()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  m record;
  v_store uuid;
  v_matched int := 0;
  v_checked int := 0;
BEGIN
  FOR r IN SELECT * FROM whatsapp_contacts WHERE client_id IS NULL AND phone_key IS NOT NULL LOOP
    v_checked := v_checked + 1;
    -- Unidade da conversa mais recente desse telefone, para o desempate.
    SELECT store_id INTO v_store FROM whatsapp_conversations
     WHERE party_key = r.party_key ORDER BY last_message_at DESC LIMIT 1;
    SELECT * INTO m FROM whatsapp_match_client(r.phone_key, v_store);

    IF m.match_status = 'matched' THEN
      UPDATE whatsapp_contacts
         SET client_id = m.client_id, match_status = 'matched', ambiguous_client_ids = NULL,
             reconciled_at = now(), updated_at = now()
       WHERE id = r.id;
      UPDATE whatsapp_conversations
         SET client_id = m.client_id, match_status = 'matched', ambiguous_client_ids = NULL, updated_at = now()
       WHERE party_key = r.party_key AND client_id IS NULL;
      v_matched := v_matched + 1;
    ELSIF m.match_status IS DISTINCT FROM r.match_status
       OR m.tied_client_ids IS DISTINCT FROM r.ambiguous_client_ids THEN
      UPDATE whatsapp_contacts
         SET match_status = m.match_status, ambiguous_client_ids = m.tied_client_ids, updated_at = now()
       WHERE id = r.id;
      UPDATE whatsapp_conversations
         SET match_status = m.match_status, ambiguous_client_ids = m.tied_client_ids, updated_at = now()
       WHERE party_key = r.party_key AND client_id IS NULL;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('checked', v_checked, 'matched', v_matched);
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_purge_raw_events()
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_rows int := 0;
BEGIN
  SELECT raw_retention_days INTO v_days FROM whatsapp_listen_settings WHERE id = 1;
  IF v_days IS NULL THEN RETURN 0; END IF;
  DELETE FROM whatsapp_raw_events
   WHERE status IN ('processed', 'ignored') AND received_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Funções de escrita: só service_role / cron (postgres).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'whatsapp_match_client(text, uuid)',
    'whatsapp_process_raw_event(uuid)',
    'whatsapp_process_pending(int)',
    'whatsapp_close_stale_conversations()',
    'whatsapp_reconcile_contacts()',
    'whatsapp_purge_raw_events()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 8. Leitura: taxa de conciliação, lista de conversas, telefones compartilhados
-- ----------------------------------------------------------------------------

-- Números únicos (party_key) com conversa, pela identificação mais recente.
CREATE OR REPLACE FUNCTION public.whatsapp_reconciliation_stats(p_store_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH last_conv AS (
    SELECT DISTINCT ON (party_key) party_key, match_status
      FROM whatsapp_conversations
     WHERE p_store_id IS NULL OR store_id = p_store_id
     ORDER BY party_key, last_message_at DESC
  )
  SELECT jsonb_build_object(
    'total',          count(*),
    'matched',        count(*) FILTER (WHERE match_status = 'matched'),
    'unmatched',      count(*) FILTER (WHERE match_status = 'unmatched'),
    'shared',         count(*) FILTER (WHERE match_status = 'shared'),
    'unresolved_lid', count(*) FILTER (WHERE match_status = 'unresolved_lid'),
    'match_rate',     CASE WHEN count(*) > 0
                           THEN round(100.0 * count(*) FILTER (WHERE match_status = 'matched') / count(*), 1) END
  )
  FROM last_conv
$$;

REVOKE EXECUTE ON FUNCTION public.whatsapp_reconciliation_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_reconciliation_stats(uuid) TO authenticated, service_role;

-- security_invoker: RLS das tabelas de baixo vale (só admin enxerga).
CREATE OR REPLACE VIEW public.whatsapp_conversations_v
WITH (security_invoker = true) AS
SELECT c.id, c.instance_id, i.name AS instance_name, i.role AS instance_role,
       c.store_id, s.name AS store_name,
       c.party_key, c.phone, c.match_status,
       c.client_id, tc.name AS client_name,
       c.contact_id, ct.push_name AS contact_name,
       coalesce(cardinality(c.ambiguous_client_ids), 0) AS shared_count,
       c.status, c.opened_at, c.last_message_at, c.closed_at,
       c.first_inbound_at, c.first_outbound_at, c.first_human_reply_at,
       CASE WHEN c.first_human_reply_at IS NOT NULL AND c.first_inbound_at IS NOT NULL
            THEN extract(epoch FROM c.first_human_reply_at - c.first_inbound_at)::int END AS first_reply_seconds,
       c.inbound_count, c.outbound_count, c.last_direction
  FROM whatsapp_conversations c
  JOIN whatsapp_instances i ON i.id = c.instance_id
  LEFT JOIN stores s ON s.id = c.store_id
  LEFT JOIN trinks_clients tc ON tc.id = c.client_id
  LEFT JOIN whatsapp_contacts ct ON ct.id = c.contact_id;

GRANT SELECT ON public.whatsapp_conversations_v TO authenticated, service_role;

-- Limpeza do CRM: telefones usados por mais de uma cliente. same_first_name
-- = provável cadastro duplicado (mesma pessoa duas vezes no Trinks).
CREATE OR REPLACE VIEW public.crm_shared_phone_groups_v
WITH (security_invoker = true) AS
WITH keys AS (
  SELECT id, store_id, name, phone_1 AS phone, phone_key AS k, trinks_client_id, registered_on, last_appointment_on
    FROM trinks_clients WHERE phone_key IS NOT NULL
  UNION
  SELECT id, store_id, name, phone_2, phone_2_key, trinks_client_id, registered_on, last_appointment_on
    FROM trinks_clients WHERE phone_2_key IS NOT NULL
)
SELECT k.k AS phone_key,
       count(DISTINCT k.id) AS clients_count,
       count(DISTINCT split_part(salon_norm_name(k.name), ' ', 1)) = 1 AS same_first_name,
       array_agg(DISTINCT s.name) AS stores,
       array_agg(k.name ORDER BY k.registered_on NULLS LAST, k.name) AS names,
       array_agg(k.phone ORDER BY k.registered_on NULLS LAST, k.name) AS phones,
       array_agg(k.trinks_client_id ORDER BY k.registered_on NULLS LAST, k.name) AS trinks_client_ids,
       array_agg(k.registered_on ORDER BY k.registered_on NULLS LAST, k.name) AS registered_on,
       array_agg(k.last_appointment_on ORDER BY k.registered_on NULLS LAST, k.name) AS last_appointment_on
  FROM keys k
  JOIN stores s ON s.id = k.store_id
 GROUP BY k.k
HAVING count(DISTINCT k.id) > 1;

GRANT SELECT ON public.crm_shared_phone_groups_v TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 9. RH — mesma assinatura, lendo do log novo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_candidate_conversation(p_candidate_id uuid)
RETURNS TABLE (
  id uuid,
  direction text,
  body text,
  message_type text,
  sent_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH';
  END IF;

  RETURN QUERY
  SELECT m.id, m.direction, m.body, m.message_type, m.sent_at
  FROM whatsapp_messages m
  WHERE m.candidate_id = p_candidate_id
  ORDER BY m.sent_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_candidate_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_candidate_conversation(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 10. Jobs
-- ----------------------------------------------------------------------------
SELECT cron.unschedule(jobname) FROM cron.job
 WHERE jobname IN ('whatsapp-process-pending', 'whatsapp-close-stale', 'whatsapp-reconcile');

-- Rede de segurança do processamento (o normal é o webhook processar na hora).
SELECT cron.schedule('whatsapp-process-pending', '* * * * *', 'SELECT public.whatsapp_process_pending()');
-- Fecha conversas que passaram do limite de silêncio.
SELECT cron.schedule('whatsapp-close-stale', '*/15 * * * *', 'SELECT public.whatsapp_close_stale_conversations()');
-- Reconciliação de contatos com o CRM + limpeza do bruto (se configurada).
-- Minuto 12: depois do salon-crm-refresh (minuto 7).
SELECT cron.schedule('whatsapp-reconcile', '12 * * * *',
  'SELECT public.whatsapp_reconcile_contacts(); SELECT public.whatsapp_purge_raw_events();');
