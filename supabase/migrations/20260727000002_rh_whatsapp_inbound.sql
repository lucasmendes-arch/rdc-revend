-- Módulo de RH — Triagem de entrevistas, Fase 1: ENTRADA de mensagens.
--
-- Até aqui o sistema só falava: as 6 edge functions de WhatsApp do projeto
-- são todas de saída. Não havia webhook de entrada, tabela de conversa, nem
-- vínculo telefone→candidato. Esta migration abre esse caminho — e só isso.
-- Nada aqui responde, classifica ou move card: é captura e exibição.
--
-- Decisão de escopo (conversado com o usuário): fazer a entrada sozinha
-- primeiro e medir. Quantos candidatos respondem, o que respondem, se dá pra
-- interpretar. As fases de classificação/follow-up/autonomia dependem desses
-- números, não de suposição.

-- ============================================================
-- 1. normalize_phone_br — chave canônica de telefone brasileiro.
--
--    O problema concreto: candidates.whatsapp guarda '27996602331' (DDD + 9 +
--    8 dígitos, sem código de país) e a Uazapi devolve
--    '5527996602331@s.whatsapp.net'. Além disso, número antigo pode não ter o
--    nono dígito. Casar string crua não funciona em nenhuma dessas
--    combinações.
--
--    A chave é DDD + os 8 últimos dígitos (10 caracteres), que é estável com
--    ou sem o 9 e com ou sem o 55. Perde-se a distinção entre um fixo e um
--    celular de mesmo final no mesmo DDD — irrelevante aqui, candidato
--    informa celular.
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_phone_br(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;

  -- Descarta sufixo de JID da Uazapi ('@s.whatsapp.net', '@c.us') e tudo que
  -- não for dígito.
  v_digits := regexp_replace(split_part(p_phone, '@', 1), '[^0-9]', '', 'g');

  -- Código de país: só remove quando o tamanho indica que ele está lá
  -- (13 = 55 + DDD + 9 + 8, 12 = 55 + DDD + 8). Um número de 11 dígitos que
  -- começa com 55 é DDD 55 (RS), não código de país — por isso o teste é de
  -- comprimento, não de prefixo.
  IF length(v_digits) IN (12, 13) AND left(v_digits, 2) = '55' THEN
    v_digits := substr(v_digits, 3);
  END IF;

  -- Nono dígito: 11 dígitos (DDD + 9 + 8) vira DDD + 8.
  IF length(v_digits) = 11 THEN
    v_digits := left(v_digits, 2) || right(v_digits, 8);
  END IF;

  -- Qualquer coisa fora de 10 dígitos não é telefone BR reconhecível —
  -- devolve NULL em vez de uma chave que casaria errado.
  IF length(v_digits) <> 10 THEN RETURN NULL; END IF;

  RETURN v_digits;
END;
$$;

COMMENT ON FUNCTION normalize_phone_br(text) IS
  'Chave canônica de telefone BR (DDD + 8 últimos dígitos). Tolera código de '
  'país, nono dígito e sufixo de JID da Uazapi. NULL quando não reconhece.';

-- Índice de expressão em vez de coluna gerada: a chave é derivada e não
-- precisa ser materializada, e assim uma correção futura em
-- normalize_phone_br passa a valer na hora, sem backfill.
CREATE INDEX IF NOT EXISTS idx_candidates_phone_key
  ON candidates (normalize_phone_br(whatsapp));

-- ============================================================
-- 2. whatsapp_messages — a conversa, nos dois sentidos.
--
--    O webhook é o ÚNICO escritor desta tabela, de propósito. A alternativa
--    (gravar a saída em send-automation-whatsapp e a entrada no webhook)
--    duplicaria toda mensagem enviada, porque a Uazapi também devolve os
--    próprios envios como evento fromMe. Um escritor só, deduplicado por
--    external_id, não tem esse problema.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = mensagem de número que não casou com nenhum candidato. Fica
  -- gravada de propósito: é o material pra diagnosticar normalização errada
  -- ou candidato cadastrado com telefone trocado.
  candidate_id  uuid REFERENCES candidates(id) ON DELETE SET NULL,
  direction     text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_key     text NOT NULL,
  phone_raw     text NOT NULL,
  body          text,
  message_type  text NOT NULL DEFAULT 'text',
  -- ID da mensagem na Uazapi. UNIQUE é o que torna o webhook idempotente:
  -- reentrega (retry da Uazapi, timeout nosso) não duplica linha.
  external_id   text UNIQUE,
  instance_id   uuid REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  -- Payload cru: o formato exato do webhook da Uazapi não está documentado de
  -- forma estável, então a extração é defensiva e isto aqui é o que permite
  -- ajustar o parser depois sem perder as mensagens já recebidas.
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE whatsapp_messages IS
  'Conversa de WhatsApp com candidatos, entrada e saída. Escrita apenas pela '
  'edge function webhook-uazapi (service_role); leitura pelo RH.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_candidate
  ON whatsapp_messages (candidate_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone
  ON whatsapp_messages (phone_key, sent_at DESC);
-- Parcial: a fila de "chegou mensagem de número desconhecido" é pequena e
-- consultada à parte.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unmatched
  ON whatsapp_messages (sent_at DESC) WHERE candidate_id IS NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_messages_rh_read ON whatsapp_messages;
CREATE POLICY whatsapp_messages_rh_read ON whatsapp_messages
  FOR SELECT TO authenticated USING (has_rh_access());

GRANT SELECT ON whatsapp_messages TO authenticated;
-- Projeto recriado em 2026-06-20 não veio com grants padrão pro service_role
-- (ver private-docs/memory.md) — o webhook escreve aqui, então é explícito.
GRANT SELECT, INSERT ON whatsapp_messages TO service_role;

-- ============================================================
-- 3. resolve_candidate_by_phone — de quem é esta mensagem?
--
--    candidates.whatsapp NÃO é único: o mesmo número pode aparecer em duas
--    candidaturas (a pessoa se candidatou duas vezes, ou o número foi
--    reaproveitado). Sem desempate explícito a mensagem cairia num card
--    arbitrário. A regra: quem recebeu mensagem nossa mais recentemente
--    ganha; se ninguém recebeu, o candidato mais recente com aquele número.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_candidate_by_phone(p_phone_key text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id uuid;
BEGIN
  IF p_phone_key IS NULL THEN RETURN NULL; END IF;

  -- 1. Candidato com envio nosso mais recente pra este número (30 dias).
  --    É o sinal mais forte de "esta conversa está acontecendo com ele".
  SELECT q.candidate_id INTO v_candidate_id
  FROM automation_whatsapp_queue q
  JOIN candidates c ON c.id = q.candidate_id
  WHERE normalize_phone_br(q.phone_number) = p_phone_key
    AND q.status = 'sent'
    AND q.processed_at > now() - interval '30 days'
  ORDER BY q.processed_at DESC
  LIMIT 1;

  IF v_candidate_id IS NOT NULL THEN RETURN v_candidate_id; END IF;

  -- 2. Senão, o candidato mais recente com este número.
  SELECT c.id INTO v_candidate_id
  FROM candidates c
  WHERE normalize_phone_br(c.whatsapp) = p_phone_key
  ORDER BY c.created_at DESC
  LIMIT 1;

  RETURN v_candidate_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_candidate_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_candidate_by_phone(text) TO service_role;

-- ============================================================
-- 4. record_whatsapp_message — inserção idempotente, chamada pelo webhook.
--
--    Resolve candidato e instância, e engole reentrega via ON CONFLICT. Fica
--    no banco (e não na edge function) pra que a resolução de candidato seja
--    a mesma independentemente de quem chame.
-- ============================================================

CREATE OR REPLACE FUNCTION record_whatsapp_message(
  p_direction    text,
  p_phone_raw    text,
  p_body         text,
  p_message_type text,
  p_external_id  text,
  p_sent_at      timestamptz,
  p_raw          jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_key text;
  v_candidate_id uuid;
  v_id uuid;
BEGIN
  IF p_direction NOT IN ('inbound', 'outbound') THEN
    RAISE EXCEPTION 'direction inválida: %', p_direction;
  END IF;

  v_phone_key := normalize_phone_br(p_phone_raw);
  IF v_phone_key IS NULL THEN
    -- Número irreconhecível (grupo, internacional, curto). Não grava: viraria
    -- lixo sem candidato possível.
    RETURN NULL;
  END IF;

  v_candidate_id := resolve_candidate_by_phone(v_phone_key);

  INSERT INTO whatsapp_messages (
    candidate_id, direction, phone_key, phone_raw,
    body, message_type, external_id, sent_at, raw
  ) VALUES (
    v_candidate_id, p_direction, v_phone_key, p_phone_raw,
    p_body, coalesce(nullif(p_message_type, ''), 'text'), nullif(p_external_id, ''),
    coalesce(p_sent_at, now()), coalesce(p_raw, '{}'::jsonb)
  )
  ON CONFLICT (external_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id; -- NULL quando foi reentrega já gravada
END;
$$;

REVOKE EXECUTE ON FUNCTION record_whatsapp_message(text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_whatsapp_message(text, text, text, text, text, timestamptz, jsonb) TO service_role;

-- ============================================================
-- 5. get_candidate_conversation — o que o card mostra.
--    Via RPC (e não SELECT direto) só pra manter a checagem de acesso num
--    lugar só e evitar que a tela precise conhecer o esquema da tabela.
-- ============================================================

CREATE OR REPLACE FUNCTION get_candidate_conversation(p_candidate_id uuid)
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

REVOKE EXECUTE ON FUNCTION get_candidate_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_candidate_conversation(uuid) TO authenticated;
