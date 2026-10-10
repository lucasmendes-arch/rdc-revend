-- Teste de fumaça da escuta de WhatsApp (migration 20261010000001).
--
-- Roda tudo dentro de um único DO e termina SEMPRE com RAISE EXCEPTION, de
-- propósito: a transação inteira é desfeita, nada fica no banco (nem a
-- instância de teste, nem mensagens — whatsapp_messages é append-only).
-- Sucesso = erro com a mensagem 'SMOKE OK'. Qualquer outra mensagem = falha.
--
--   npm run test:whatsapp
--
-- Cobre: RH (candidato + get_candidate_conversation com a mesma assinatura),
-- conciliação (única, telefone compartilhado, sem cadastro, LID), primeira
-- resposta humana × envio por API, idempotência, regra de silêncio,
-- fechamento por job e append-only.
DO $$
DECLARE
  v_store     uuid;
  v_inst      uuid;
  v_admin     uuid;
  v_cand      uuid;
  v_cand_tel  text;
  v_cli       record;
  v_shared    text;
  v_res       text;
  v_raw       uuid;
  v_conv      record;
  v_n         int;
  -- 16h atrás: a 1ª conversa já nasce expirada (limite 12h) e a mensagem de
  -- "13h depois" ainda fica no passado.
  v_t0        timestamptz := date_trunc('second', now()) - interval '16 hours';
  v_log       text := '';
BEGIN
  SELECT id INTO v_store FROM stores WHERE slug = 'linhares';
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  IF v_store IS NULL OR v_admin IS NULL THEN RAISE EXCEPTION 'pré-condição: loja linhares e um admin'; END IF;

  INSERT INTO whatsapp_instances (name, uazapi_url, uazapi_token, store_id, role, listen_enabled)
  VALUES ('SMOKE TEST', 'https://example.invalid', 'smoke-token-' || gen_random_uuid(), v_store, 'atendimento', true)
  RETURNING id INTO v_inst;

  -- 1. RH: candidato com telefone válido ----------------------------------
  SELECT id, whatsapp INTO v_cand, v_cand_tel FROM candidates
   WHERE phone_br_key(whatsapp) IS NOT NULL
     AND phone_br_key(whatsapp) NOT IN (SELECT phone_key FROM trinks_clients WHERE phone_key IS NOT NULL)
   ORDER BY created_at DESC LIMIT 1;

  IF v_cand IS NOT NULL THEN
    INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload)
    VALUES (v_inst, 'messages', 'SMOKE-RH-1',
            jsonb_build_object('direction', 'inbound', 'partyJid', phone_br_canonical(v_cand_tel) || '@s.whatsapp.net',
                               'phoneRaw', phone_br_canonical(v_cand_tel) || '@s.whatsapp.net',
                               'messageType', 'text', 'body', 'Confirmo a entrevista', 'sentAt', v_t0),
            '{}') RETURNING id INTO v_raw;
    v_res := whatsapp_process_raw_event(v_raw);
    IF v_res <> 'ok' THEN RAISE EXCEPTION 'RH: processamento %', v_res; END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    SELECT count(*) INTO v_n FROM get_candidate_conversation(v_cand) WHERE body = 'Confirmo a entrevista';
    IF v_n <> 1 THEN RAISE EXCEPTION 'RH: get_candidate_conversation devolveu % linhas', v_n; END IF;
    v_log := v_log || 'rh ok; ';
  ELSE
    v_log := v_log || 'rh PULADO (sem candidato com telefone exclusivo); ';
  END IF;

  -- 2. Cliente com telefone único: matched -------------------------------
  SELECT c.id, c.phone_1, c.phone_key INTO v_cli FROM trinks_clients c
   WHERE c.phone_key IS NOT NULL
     AND (SELECT count(*) FROM trinks_clients x WHERE x.phone_key = c.phone_key OR x.phone_2_key = c.phone_key) = 1
   LIMIT 1;

  -- Envio por API primeiro (disparo), depois a cliente responde, depois a
  -- recepção responde pelo celular.
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload) VALUES
    (v_inst, 'messages', 'SMOKE-C-1', jsonb_build_object('direction', 'outbound', 'wasSentByApi', true,
       'partyJid', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net', 'phoneRaw', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net',
       'messageType', 'text', 'body', 'Promoção!', 'sentAt', v_t0), '{}'),
    (v_inst, 'messages', 'SMOKE-C-2', jsonb_build_object('direction', 'inbound',
       'partyJid', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net', 'phoneRaw', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net',
       'messageType', 'text', 'body', 'Quero agendar', 'sentAt', v_t0 + interval '10 minutes'), '{}'),
    (v_inst, 'messages', 'SMOKE-C-3', jsonb_build_object('direction', 'outbound', 'wasSentByApi', false,
       'partyJid', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net', 'phoneRaw', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net',
       'messageType', 'text', 'body', 'Claro! Que horas?', 'sentAt', v_t0 + interval '25 minutes'), '{}'),
    (v_inst, 'messages', 'SMOKE-C-4', jsonb_build_object('direction', 'inbound',
       'partyJid', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net', 'phoneRaw', phone_br_canonical(v_cli.phone_1) || '@s.whatsapp.net',
       'messageType', 'reaction', 'body', '👍', 'sentAt', v_t0 + interval '26 minutes'), '{}');

  PERFORM whatsapp_process_raw_event(id) FROM whatsapp_raw_events
   WHERE instance_id = v_inst AND provider_message_id LIKE 'SMOKE-C-%' ORDER BY provider_message_id;

  SELECT * INTO v_conv FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = v_cli.phone_key;
  IF v_conv.match_status <> 'matched' OR v_conv.client_id <> v_cli.id THEN
    RAISE EXCEPTION 'matched: status % client %', v_conv.match_status, v_conv.client_id;
  END IF;
  IF v_conv.first_outbound_at <> v_t0 THEN RAISE EXCEPTION 'first_outbound_at %', v_conv.first_outbound_at; END IF;
  IF v_conv.first_inbound_at <> v_t0 + interval '10 minutes' THEN RAISE EXCEPTION 'first_inbound_at %', v_conv.first_inbound_at; END IF;
  IF v_conv.first_human_reply_at <> v_t0 + interval '25 minutes' THEN RAISE EXCEPTION 'first_human_reply_at %', v_conv.first_human_reply_at; END IF;
  IF v_conv.inbound_count <> 1 OR v_conv.outbound_count <> 2 THEN
    RAISE EXCEPTION 'contagens % / % (reação não conta)', v_conv.inbound_count, v_conv.outbound_count;
  END IF;
  IF v_conv.last_direction <> 'outbound' THEN
    RAISE EXCEPTION 'last_direction %', v_conv.last_direction;
  END IF;
  -- Expirada na criação; closed_at acompanha a última mensagem que não é
  -- reação (a reação de +26min fica anexada mas não estende a janela).
  IF v_conv.status <> 'fechada' OR v_conv.closed_at <> v_t0 + interval '25 minutes' + interval '12 hours' THEN
    RAISE EXCEPTION 'status % closed_at %', v_conv.status, v_conv.closed_at;
  END IF;
  SELECT count(*) INTO v_n FROM whatsapp_contacts WHERE party_key = v_cli.phone_key;
  IF v_n <> 0 THEN RAISE EXCEPTION 'cliente casada não deveria virar contato'; END IF;
  v_log := v_log || 'matched + 1a resposta ok; ';

  -- Mesmo número sem o nono dígito cai na mesma conversa.
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload)
  VALUES (v_inst, 'messages', 'SMOKE-C-5', jsonb_build_object('direction', 'inbound',
          'phoneRaw', '55' || left(v_cli.phone_key, 2) || right(v_cli.phone_key, 8) || '@s.whatsapp.net',
          'messageType', 'text', 'body', 'Às 15h', 'sentAt', v_t0 + interval '30 minutes'), '{}')
  RETURNING id INTO v_raw;
  PERFORM whatsapp_process_raw_event(v_raw);
  SELECT count(*) INTO v_n FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = v_cli.phone_key;
  IF v_n <> 1 THEN RAISE EXCEPTION 'nono dígito: % conversas', v_n; END IF;
  v_log := v_log || 'nono digito ok; ';

  -- 3. Idempotência -----------------------------------------------------
  v_res := whatsapp_process_raw_event(v_raw);
  IF v_res <> 'ja processado' THEN RAISE EXCEPTION 'reprocessar: %', v_res; END IF;
  BEGIN
    INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload)
    VALUES (v_inst, 'messages', 'SMOKE-C-5', '{}', '{}');
    RAISE EXCEPTION 'bruto duplicado foi aceito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  v_log := v_log || 'idempotencia ok; ';

  -- 4. Append-only ------------------------------------------------------
  BEGIN
    UPDATE whatsapp_messages SET body = 'x' WHERE instance_id = v_inst;
    RAISE EXCEPTION 'UPDATE em whatsapp_messages foi aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM whatsapp_messages WHERE instance_id = v_inst;
    RAISE EXCEPTION 'DELETE em whatsapp_messages foi aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'append-only ok; ';

  -- 5. Regra de silêncio: 13h depois abre outra e fecha a anterior --------
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload)
  VALUES (v_inst, 'messages', 'SMOKE-C-6', jsonb_build_object('direction', 'inbound',
          'phoneRaw', phone_br_canonical(v_cli.phone_1), 'messageType', 'text', 'body', 'Oi de novo',
          'sentAt', v_t0 + interval '30 minutes' + interval '13 hours'), '{}')
  RETURNING id INTO v_raw;
  PERFORM whatsapp_process_raw_event(v_raw);
  SELECT count(*) INTO v_n FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = v_cli.phone_key;
  IF v_n <> 2 THEN RAISE EXCEPTION 'silencio: % conversas', v_n; END IF;
  SELECT count(*) INTO v_n FROM whatsapp_conversations
   WHERE instance_id = v_inst AND party_key = v_cli.phone_key AND status = 'aberta';
  IF v_n <> 1 THEN RAISE EXCEPTION 'silencio: nova conversa deveria estar aberta'; END IF;
  SELECT * INTO v_conv FROM whatsapp_conversations
   WHERE instance_id = v_inst AND party_key = v_cli.phone_key ORDER BY opened_at LIMIT 1;
  IF v_conv.status <> 'fechada' OR v_conv.closed_at <> v_t0 + interval '30 minutes' + interval '12 hours' THEN
    RAISE EXCEPTION 'silencio: anterior % fechada em %', v_conv.status, v_conv.closed_at;
  END IF;
  v_log := v_log || 'silencio ok; ';

  -- 6. Telefone compartilhado ------------------------------------------
  SELECT phone_key INTO v_shared FROM crm_shared_phone_groups_v ORDER BY clients_count DESC LIMIT 1;
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload)
  VALUES (v_inst, 'messages', 'SMOKE-S-1', jsonb_build_object('direction', 'inbound',
          'phoneRaw', '55' || v_shared, 'pushName', 'Mãe e filha', 'messageType', 'text', 'body', 'oi', 'sentAt', v_t0), '{}')
  RETURNING id INTO v_raw;
  PERFORM whatsapp_process_raw_event(v_raw);
  SELECT * INTO v_conv FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = v_shared;
  IF v_conv.match_status <> 'shared' OR v_conv.client_id IS NOT NULL OR cardinality(v_conv.ambiguous_client_ids) < 2 THEN
    RAISE EXCEPTION 'shared: % % %', v_conv.match_status, v_conv.client_id, v_conv.ambiguous_client_ids;
  END IF;
  SELECT count(*) INTO v_n FROM whatsapp_contacts WHERE party_key = v_shared AND match_status = 'shared';
  IF v_n <> 1 THEN RAISE EXCEPTION 'shared: contato não registrado'; END IF;
  v_log := v_log || 'shared ok; ';

  -- 7. Sem cadastro e LID ----------------------------------------------
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload) VALUES
    (v_inst, 'messages', 'SMOKE-U-1', jsonb_build_object('direction', 'inbound',
       'phoneRaw', '5599988776655@s.whatsapp.net', 'messageType', 'audio', 'media', jsonb_build_object('seconds', 7),
       'sentAt', v_t0), '{}'),
    (v_inst, 'messages', 'SMOKE-L-1', jsonb_build_object('direction', 'inbound',
       'partyJid', '999000111222333@lid', 'lid', '999000111222333@lid', 'phoneRaw', NULL,
       'messageType', 'text', 'body', 'oi', 'sentAt', v_t0), '{}');
  PERFORM whatsapp_process_raw_event(id) FROM whatsapp_raw_events
   WHERE instance_id = v_inst AND provider_message_id IN ('SMOKE-U-1', 'SMOKE-L-1');

  -- O número inventado pode existir na base; só valida se não existir.
  IF NOT EXISTS (SELECT 1 FROM trinks_clients WHERE phone_key = '9988776655' OR phone_2_key = '9988776655') THEN
    SELECT count(*) INTO v_n FROM whatsapp_contacts WHERE party_key = '9988776655' AND match_status = 'unmatched';
    IF v_n <> 1 THEN RAISE EXCEPTION 'unmatched: contato não criado'; END IF;
  END IF;
  SELECT count(*) INTO v_n FROM whatsapp_conversations
   WHERE instance_id = v_inst AND party_key = 'lid:999000111222333@lid' AND match_status = 'unresolved_lid';
  IF v_n <> 1 THEN RAISE EXCEPTION 'lid: conversa não registrada'; END IF;
  SELECT count(*) INTO v_n FROM whatsapp_messages WHERE instance_id = v_inst AND message_type = 'audio' AND media ->> 'seconds' = '7';
  IF v_n <> 1 THEN RAISE EXCEPTION 'midia: metadados não gravados'; END IF;
  v_log := v_log || 'unmatched + lid ok; ';

  -- 7b. Reação sem conversa em andamento: só log, sem conversa nem contato --
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload)
  VALUES (v_inst, 'messages', 'SMOKE-R-1', jsonb_build_object('direction', 'outbound',
          'phoneRaw', '5599977665544@s.whatsapp.net', 'messageType', 'reaction', 'body', '❤️',
          'sentAt', v_t0), '{}')
  RETURNING id INTO v_raw;
  v_res := whatsapp_process_raw_event(v_raw);
  IF v_res <> 'ok' THEN RAISE EXCEPTION 'reacao orfa: %', v_res; END IF;
  SELECT count(*) INTO v_n FROM whatsapp_messages WHERE raw_event_id = v_raw AND conversation_id IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'reacao orfa: mensagem não gravada sem conversa'; END IF;
  SELECT count(*) INTO v_n FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = '9977665544';
  IF v_n <> 0 THEN RAISE EXCEPTION 'reacao orfa abriu conversa'; END IF;
  SELECT count(*) INTO v_n FROM whatsapp_contacts WHERE party_key = '9977665544';
  IF v_n <> 0 THEN RAISE EXCEPTION 'reacao orfa criou contato'; END IF;
  v_log := v_log || 'reacao orfa ok; ';

  -- 7c. Texto automático cadastrado não conta como resposta humana --------
  INSERT INTO whatsapp_auto_reply_texts (instance_id, label, body)
  VALUES (v_inst, 'teste', 'Estamos   FORA do horário. Já retornamos!');
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload) VALUES
    (v_inst, 'messages', 'SMOKE-A-1', jsonb_build_object('direction', 'inbound',
       'phoneRaw', '5599966554433', 'messageType', 'text', 'body', 'oi', 'sentAt', v_t0), '{}'),
    (v_inst, 'messages', 'SMOKE-A-2', jsonb_build_object('direction', 'outbound', 'wasSentByApi', false,
       'phoneRaw', '5599966554433', 'messageType', 'text', 'body', 'estamos fora do horário. já retornamos!',
       'sentAt', v_t0 + interval '2 seconds'), '{}'),
    (v_inst, 'messages', 'SMOKE-A-3', jsonb_build_object('direction', 'outbound', 'wasSentByApi', false,
       'phoneRaw', '5599966554433', 'messageType', 'text', 'body', 'Bom dia! Como posso ajudar?',
       'sentAt', v_t0 + interval '40 minutes'), '{}');
  PERFORM whatsapp_process_raw_event(id) FROM whatsapp_raw_events
   WHERE instance_id = v_inst AND provider_message_id LIKE 'SMOKE-A-%' ORDER BY provider_message_id;
  SELECT * INTO v_conv FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = '9966554433';
  IF v_conv.first_outbound_at <> v_t0 + interval '2 seconds'
     OR v_conv.first_human_reply_at <> v_t0 + interval '40 minutes' THEN
    RAISE EXCEPTION 'auto-reply: outbound % humana %', v_conv.first_outbound_at, v_conv.first_human_reply_at;
  END IF;
  -- Removendo o texto, o envio automático volta a contar (recalculo pelo trigger).
  DELETE FROM whatsapp_auto_reply_texts WHERE instance_id = v_inst;
  SELECT * INTO v_conv FROM whatsapp_conversations WHERE instance_id = v_inst AND party_key = '9966554433';
  IF v_conv.first_human_reply_at <> v_t0 + interval '2 seconds' THEN
    RAISE EXCEPTION 'auto-reply: recálculo após remover texto deu %', v_conv.first_human_reply_at;
  END IF;
  v_log := v_log || 'texto automatico ok; ';

  -- 7d. Fila de transcrição: cliente e celular entram, disparo por API não ----
  INSERT INTO whatsapp_raw_events (instance_id, event_type, provider_message_id, parsed, payload) VALUES
    (v_inst, 'messages', 'SMOKE-M-1', jsonb_build_object('direction', 'inbound',
       'phoneRaw', '5599955443322', 'messageType', 'audio', 'media', jsonb_build_object('seconds', 5), 'sentAt', v_t0), '{}'),
    (v_inst, 'messages', 'SMOKE-M-2', jsonb_build_object('direction', 'outbound', 'wasSentByApi', false,
       'phoneRaw', '5599955443322', 'messageType', 'audio', 'sentAt', v_t0 + interval '1 minute'), '{}'),
    (v_inst, 'messages', 'SMOKE-M-3', jsonb_build_object('direction', 'outbound', 'wasSentByApi', true,
       'phoneRaw', '5599955443322', 'messageType', 'image', 'body', 'Promo!', 'sentAt', v_t0 + interval '2 minutes'), '{}');
  PERFORM whatsapp_process_raw_event(id) FROM whatsapp_raw_events
   WHERE instance_id = v_inst AND provider_message_id LIKE 'SMOKE-M-%' ORDER BY provider_message_id;
  SELECT string_agg(m.provider_message_id || '=' || e.status, ',' ORDER BY m.provider_message_id) INTO v_res
    FROM whatsapp_message_enrichments e JOIN whatsapp_messages m ON m.id = e.message_id
   WHERE m.instance_id = v_inst AND m.provider_message_id LIKE 'SMOKE-M-%';
  IF v_res IS DISTINCT FROM 'SMOKE-M-1=pending,SMOKE-M-2=pending,SMOKE-M-3=skipped' THEN
    RAISE EXCEPTION 'fila de midia: %', v_res;
  END IF;
  v_log := v_log || 'fila de midia ok; ';

  -- 8. Job de fechamento e estatística ---------------------------------
  UPDATE whatsapp_listen_settings SET conversation_gap_hours = 1 WHERE id = 1;
  PERFORM whatsapp_close_stale_conversations();
  SELECT count(*) INTO v_n FROM whatsapp_conversations WHERE instance_id = v_inst AND status = 'aberta';
  IF v_n <> 0 THEN RAISE EXCEPTION 'job: % conversas ainda abertas com limite 1h', v_n; END IF;
  v_log := v_log || 'job ok; stats=' || whatsapp_reconciliation_stats(v_store)::text;

  RAISE EXCEPTION 'SMOKE OK: %', v_log;
END $$;
