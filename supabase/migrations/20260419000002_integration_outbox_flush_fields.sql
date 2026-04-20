-- ============================================================================
-- Etapa: integration_outbox — campos de retry e observabilidade
--
-- Adiciona campos necessários para o worker integration-outbox-flush:
--   - next_retry_at   → quando o item pode ser tentado novamente (backoff)
--   - last_http_status → HTTP status da última tentativa de envio ao n8n
--
-- Retrocompatível: ambos nullable com DEFAULT NULL — itens existentes não quebram.
-- ============================================================================

ALTER TABLE public.integration_outbox
  ADD COLUMN IF NOT EXISTS next_retry_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_http_status int         DEFAULT NULL;

-- Índice para o worker: busca pending com next_retry_at elegível
CREATE INDEX IF NOT EXISTS idx_outbox_pending_retry
  ON public.integration_outbox (status, next_retry_at, created_at)
  WHERE status = 'pending';

-- Atualizar RPC claim_outbox_items para respeitar next_retry_at
CREATE OR REPLACE FUNCTION public.claim_outbox_items(p_batch_size int DEFAULT 10)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.integration_outbox o
    WHERE o.status = 'pending'
      AND o.attempt_count < o.max_attempts
      AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
    ORDER BY o.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.integration_outbox o
  SET
    status        = 'processing',
    attempt_count = attempt_count + 1,
    processed_at  = now()
  FROM claimed c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

COMMENT ON COLUMN public.integration_outbox.next_retry_at    IS 'Earliest time this item can be retried. NULL = eligible immediately.';
COMMENT ON COLUMN public.integration_outbox.last_http_status IS 'HTTP status code returned by the n8n webhook on the last attempt.';
