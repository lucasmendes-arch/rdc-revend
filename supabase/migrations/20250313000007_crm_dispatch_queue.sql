-- ============================================================================
-- CRM Etapa 4 P4 — Fila de Disparo com Delay
--
-- 1. Tabela crm_dispatch_queue
-- 2. Funcao claim_crm_queue_items() — claim atomico, safe para concorrencia
-- 3. Funcao reset_stuck_crm_queue_items() — recupera itens travados
-- 4. pg_cron: chama crm-queue-processor a cada minuto via net.http_post
-- ============================================================================


-- ============================================================================
-- 1. crm_dispatch_queue
-- ============================================================================

CREATE TABLE public.crm_dispatch_queue (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id    uuid        NOT NULL REFERENCES public.crm_automations ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  trigger_event    jsonb       NOT NULL DEFAULT '{}',
  idempotency_key  text        NOT NULL UNIQUE,
  scheduled_at     timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN (
                                 'pending', 'processing', 'sent', 'failed', 'cancelled'
                               )),
  attempt_count    int         NOT NULL DEFAULT 0,
  last_error       text,
  processed_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_crm_dispatch_queue_status       ON public.crm_dispatch_queue(status);
CREATE INDEX idx_crm_dispatch_queue_scheduled_at ON public.crm_dispatch_queue(scheduled_at ASC);
CREATE INDEX idx_crm_dispatch_queue_user_id      ON public.crm_dispatch_queue(user_id);

-- updated_at auto-update
CREATE OR REPLACE FUNCTION public.update_crm_dispatch_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$;

CREATE TRIGGER crm_dispatch_queue_updated_at
  BEFORE UPDATE ON public.crm_dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_crm_dispatch_queue_updated_at();

ALTER TABLE public.crm_dispatch_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_crm_dispatch_queue" ON public.crm_dispatch_queue
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================================
-- 2. claim_crm_queue_items(batch_size)
--    Marca itens como 'processing' atomicamente usando FOR UPDATE SKIP LOCKED.
--    Seguro para execucoes concorrentes (dois cron jobs nao pegam o mesmo item).
--    Limite de 3 tentativas: itens com attempt_count >= 3 sao ignorados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_crm_queue_items(batch_size int DEFAULT 10)
RETURNS SETOF public.crm_dispatch_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  RETURN QUERY
  UPDATE public.crm_dispatch_queue
  SET
    status        = 'processing',
    attempt_count = attempt_count + 1,
    updated_at    = now()
  WHERE id IN (
    SELECT id
    FROM public.crm_dispatch_queue
    WHERE status      = 'pending'
      AND scheduled_at <= now()
      AND attempt_count < 3
    ORDER BY scheduled_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.claim_crm_queue_items(int) TO service_role;


-- ============================================================================
-- 3. reset_stuck_crm_queue_items()
--    Recupera itens presos em 'processing' ha mais de 5 minutos
--    (caso o queue-processor tenha falhado apos o claim).
--    Executar periodicamente via cron ou manualmente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_stuck_crm_queue_items()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_count int;
BEGIN
  UPDATE public.crm_dispatch_queue
  SET
    status     = 'pending',
    updated_at = now()
  WHERE status     = 'processing'
    AND updated_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.reset_stuck_crm_queue_items() TO service_role;


-- ============================================================================
-- 4. pg_cron: chamar crm-queue-processor a cada minuto
--
-- INSTRUCAO: execute este bloco SEPARADAMENTE no SQL Editor apos aplicar
-- a migration acima. Substitua {PROJECT_REF} pelo ref do seu projeto Supabase.
--
-- SELECT cron.schedule(
--   'crm-queue-processor',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://{PROJECT_REF}.supabase.co/functions/v1/crm-queue-processor',
--     headers := '{"Content-Type": "application/json"}'::jsonb,
--     body    := 'null'::jsonb
--   )
--   $$
-- );
--
-- Para verificar o job:
--   SELECT * FROM cron.job WHERE jobname = 'crm-queue-processor';
--
-- Para remover:
--   SELECT cron.unschedule('crm-queue-processor');
-- ============================================================================
