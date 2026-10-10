-- ============================================================================
-- Escuta de WhatsApp — não transcrever/descrever mídia de disparo (2026-10-10)
--
-- Decisão do usuário: mídia de disparo em massa não passa pela IA, seja pelo
-- número de atendimento ou pelo de massa. Na prática:
--   * envio por API (was_sent_by_api: disparos e automações), de qualquer
--     instância;
--   * todo envio de instância com role = 'massa' (o que sai desse número é
--     disparo por definição, mesmo que não venha marcado como API).
-- A linha é criada como 'skipped' com o motivo — fica rastreável e custa zero.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skip text;
BEGIN
  IF NEW.message_type NOT IN ('audio', 'image') THEN RETURN NULL; END IF;

  IF NEW.direction = 'outbound' AND NEW.was_sent_by_api THEN
    v_skip := 'envio por API (disparo/automação)';
  ELSIF NEW.direction = 'outbound'
        AND EXISTS (SELECT 1 FROM whatsapp_instances i WHERE i.id = NEW.instance_id AND i.role = 'massa') THEN
    v_skip := 'envio de número de disparo em massa';
  END IF;

  INSERT INTO whatsapp_message_enrichments (message_id, kind, status, last_error, processed_at)
  VALUES (NEW.id,
          CASE NEW.message_type WHEN 'audio' THEN 'transcription' ELSE 'image_description' END,
          CASE WHEN v_skip IS NULL THEN 'pending' ELSE 'skipped' END,
          v_skip,
          CASE WHEN v_skip IS NULL THEN NULL ELSE now() END)
  ON CONFLICT (message_id) DO NOTHING;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.whatsapp_enqueue_enrichment() FROM PUBLIC, anon, authenticated;

-- O que já estiver na fila e se encaixar na regra sai dela.
UPDATE public.whatsapp_message_enrichments e
   SET status = 'skipped', processed_at = now(),
       last_error = CASE WHEN m.was_sent_by_api THEN 'envio por API (disparo/automação)'
                         ELSE 'envio de número de disparo em massa' END
  FROM public.whatsapp_messages m
  LEFT JOIN public.whatsapp_instances i ON i.id = m.instance_id
 WHERE e.message_id = m.id AND e.status = 'pending' AND m.direction = 'outbound'
   AND (m.was_sent_by_api OR i.role = 'massa');
