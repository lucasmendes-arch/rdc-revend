-- ============================================================================
-- integration_outbox — campo de ack para rastreabilidade ponta a ponta
--
-- acked_at: preenchido pelo n8n-sync-back quando o n8n devolve outbox_id.
-- Permite distinguir:
--   delivered                       → n8n aceitou o POST (HTTP 2xx)
--   delivered + acked_at NOT NULL   → n8n processou e retornou ao CRM
-- ============================================================================

ALTER TABLE public.integration_outbox
  ADD COLUMN IF NOT EXISTS acked_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.integration_outbox.acked_at
  IS 'Timestamp em que o n8n confirmou o processamento via n8n-sync-back (outbox_id devolvido no callback).';
