-- ============================================================================
-- Escuta de WhatsApp — ajustes depois do primeiro payload real (2026-10-10)
--
-- 1. Reação (ReactionMessage) sozinha não abre conversa. O primeiro evento real
--    de Linhares foi uma reação enviada pelo celular da unidade, e ela virou
--    uma conversa "vazia" (0 recebidas, 0 enviadas) que entrava na taxa de
--    conciliação. Agora:
--      * reação sem conversa em andamento fica só no log, conversation_id NULL,
--        sem criar contato;
--      * reação dentro de uma conversa é anexada, mas não estende a janela
--        (opened_at/last_message_at) nem conta em nada.
-- 2. conversation_id passa a aceitar NULL e vira ON DELETE SET NULL, pra
--    limpar as conversas que só têm reação (a mensagem continua no log).
-- ============================================================================

ALTER TABLE public.whatsapp_messages ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE public.whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_conversation_id_fkey;
ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL;

-- conversation_id entra na lista de FKs que o append-only deixa virar NULL.
CREATE OR REPLACE FUNCTION public.whatsapp_messages_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fks text[] := ARRAY['instance_id', 'conversation_id', 'raw_event_id', 'client_id', 'contact_id', 'candidate_id'];
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
  v_orphan     boolean;
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

    -- Serializa mensagens da mesma pessoa na mesma instância.
    PERFORM pg_advisory_xact_lock(hashtextextended(e.instance_id::text || '|' || v_party, 0));

    -- Conversa cuja janela cobre esta mensagem (aceita chegada fora de ordem).
    SELECT id INTO v_conv_id
      FROM whatsapp_conversations
     WHERE instance_id = e.instance_id AND party_key = v_party
       AND opened_at - v_gap <= v_ts AND last_message_at + v_gap >= v_ts
     ORDER BY last_message_at DESC
     LIMIT 1;

    -- Reação sem conversa em andamento não abre conversa nem cria contato:
    -- fica só no log (conversation_id nulo).
    v_orphan := v_conv_id IS NULL AND v_type = 'reaction';

    -- Quem não casou com uma cliente só vira contato "só WhatsApp".
    IF v_orphan THEN
      SELECT id INTO v_contact_id FROM whatsapp_contacts WHERE party_key = v_party;
    ELSIF m.match_status <> 'matched' THEN
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

    IF v_conv_id IS NULL AND NOT v_orphan THEN
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
    -- ordem e a reprocessamento. Reação não mexe em nada da conversa.
    IF v_conv_id IS NOT NULL AND v_type <> 'reaction' THEN
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
        SELECT min(sent_at) FILTER (WHERE message_type <> 'reaction') AS opened_at,
               max(sent_at) FILTER (WHERE message_type <> 'reaction') AS last_message_at,
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
    END IF;

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

-- Limpeza: conversas sem nenhuma mensagem que não seja reação.
DELETE FROM public.whatsapp_conversations c
 WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_messages m
                    WHERE m.conversation_id = c.id AND m.message_type <> 'reaction');
