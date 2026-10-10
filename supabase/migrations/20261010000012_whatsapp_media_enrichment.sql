-- ============================================================================
-- Escuta de WhatsApp — transcrição de áudio e descrição de imagem (2026-10-10)
--
-- Áudio e imagem chegam no log só com metadados. Esta etapa:
--   1. enfileira toda mensagem de áudio/imagem (trigger em whatsapp_messages);
--   2. a edge function whatsapp-enrich-media (cron de 1 min) baixa a mídia pela
--      Uazapi (POST /message/download — só leitura: não envia, não marca como
--      lido), manda ao modelo via OpenRouter e grava SÓ o texto. O arquivo é
--      descartado (decisão do usuário: transcrever e descartar).
--
-- O log de mensagens continua append-only: o texto gerado vive aqui, numa
-- tabela à parte, 1:1 com a mensagem.
-- ============================================================================

ALTER TABLE public.whatsapp_listen_settings
  ADD COLUMN IF NOT EXISTS enrichment_enabled boolean NOT NULL DEFAULT true,
  -- Áudio e imagem no mesmo modelo. Menor custo com áudio+imagem no
  -- OpenRouter em 2026-10-10 (~US$ 0,0006/min de áudio).
  ADD COLUMN IF NOT EXISTS enrichment_model text NOT NULL DEFAULT 'google/gemini-2.5-flash-lite',
  -- Áudio mais longo que isso não é transcrito (status 'skipped').
  ADD COLUMN IF NOT EXISTS enrichment_max_audio_seconds int NOT NULL DEFAULT 600;

CREATE TABLE public.whatsapp_message_enrichments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    uuid NOT NULL UNIQUE REFERENCES public.whatsapp_messages(id),
  kind          text NOT NULL CHECK (kind IN ('transcription', 'image_description')),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  text          text,
  model         text,
  cost_usd      numeric(12,6),
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  claimed_at    timestamptz,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_enrichments_queue
  ON public.whatsapp_message_enrichments (created_at) WHERE status IN ('pending', 'processing');

COMMENT ON TABLE public.whatsapp_message_enrichments IS
  'Transcrição de áudio / descrição de imagem das mensagens de WhatsApp. Só o texto; o arquivo é descartado.';

ALTER TABLE public.whatsapp_message_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_whatsapp_enrichments ON public.whatsapp_message_enrichments
  FOR SELECT USING (public.is_admin());
GRANT SELECT ON public.whatsapp_message_enrichments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_message_enrichments TO service_role;


-- Enfileiramento -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.message_type IN ('audio', 'image') THEN
    INSERT INTO whatsapp_message_enrichments (message_id, kind)
    VALUES (NEW.id, CASE NEW.message_type WHEN 'audio' THEN 'transcription' ELSE 'image_description' END)
    ON CONFLICT (message_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_whatsapp_messages_enqueue_enrichment
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_enqueue_enrichment();

REVOKE EXECUTE ON FUNCTION public.whatsapp_enqueue_enrichment() FROM PUBLIC, anon, authenticated;


-- Reivindicação em lote pela edge function -----------------------------------
-- Pega pendentes e 'processing' presos há mais de 10 min (função morreu no
-- meio). Até 3 tentativas; depois disso fica 'failed'.
CREATE OR REPLACE FUNCTION public.whatsapp_claim_enrichments(p_limit int DEFAULT 10)
RETURNS TABLE (
  enrichment_id        uuid,
  kind                 text,
  message_id           uuid,
  instance_id          uuid,
  provider_message_id  text,
  owner                text,
  media                jsonb,
  body                 text,
  model                text,
  max_audio_seconds    int
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s whatsapp_listen_settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM whatsapp_listen_settings WHERE id = 1;
  IF NOT coalesce(s.enrichment_enabled, false) THEN RETURN; END IF;

  -- Esgotou tentativas: falha definitiva.
  UPDATE whatsapp_message_enrichments
     SET status = 'failed', processed_at = now()
   WHERE status IN ('pending', 'processing') AND attempts >= 3
     AND (status = 'pending' OR claimed_at < now() - interval '10 minutes');

  RETURN QUERY
  WITH picked AS (
    SELECT e.id
      FROM whatsapp_message_enrichments e
     WHERE (e.status = 'pending' OR (e.status = 'processing' AND e.claimed_at < now() - interval '10 minutes'))
       AND e.attempts < 3
     ORDER BY e.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE whatsapp_message_enrichments e
       SET status = 'processing', claimed_at = now(), attempts = e.attempts + 1
      FROM picked WHERE e.id = picked.id
    RETURNING e.id, e.kind, e.message_id
  )
  SELECT upd.id, upd.kind, m.id, m.instance_id, m.provider_message_id,
         i.phone_number, m.media, m.body, s.enrichment_model, s.enrichment_max_audio_seconds
    FROM upd
    JOIN whatsapp_messages m ON m.id = upd.message_id
    LEFT JOIN whatsapp_instances i ON i.id = m.instance_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.whatsapp_claim_enrichments(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_claim_enrichments(int) TO service_role;


-- Cron -----------------------------------------------------------------------
-- O segredo da chamada fica no Vault (whatsapp_enrich_cron_secret), não no
-- código: a função recusa chamada sem ele (fail-closed). O mesmo valor fica no
-- secret WHATSAPP_ENRICH_CRON_SECRET das edge functions.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'whatsapp-enrich-media';
SELECT cron.schedule('whatsapp-enrich-media', '* * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/whatsapp-enrich-media',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                         WHERE name = 'whatsapp_enrich_cron_secret' LIMIT 1)),
    body    := '{}'::jsonb
  )
  WHERE EXISTS (SELECT 1 FROM public.whatsapp_message_enrichments
                 WHERE status IN ('pending', 'processing'));
$cron$);
