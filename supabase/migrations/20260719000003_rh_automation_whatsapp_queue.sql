-- Módulo de RH — Motor de Automações (Fase 3), etapa 3: fila de WhatsApp +
-- credenciais por unidade. A ação send_whatsapp (migration anterior) já
-- enfileira em automation_whatsapp_queue — aqui entram a função que o cron
-- usa pra reivindicar lotes (mesmo padrão de claim_crm_queue_items, dormente
-- em 20250313000007) e as duas RPCs de credencial (masked read + write-only).

-- ============================================================
-- 1. claim_automation_whatsapp_queue_items — reivindica lote pra
--    processamento, evita corrida entre execuções concorrentes do cron.
-- ============================================================

CREATE OR REPLACE FUNCTION claim_automation_whatsapp_queue_items(p_batch_size int DEFAULT 20)
RETURNS SETOF automation_whatsapp_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE automation_whatsapp_queue
  SET status = 'processing', attempt_count = attempt_count + 1
  WHERE id IN (
    SELECT id FROM automation_whatsapp_queue
    WHERE status = 'pending' AND attempt_count < 3
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_automation_whatsapp_queue_items(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_automation_whatsapp_queue_items(int) TO service_role;

-- ============================================================
-- 2. RPCs de credencial Uazapi por loja — nunca devolvem o token cru.
--    Escrita restrita a is_admin() (mais estrita que has_rh_access(), única
--    exceção deliberada no módulo: gerenciar secret de canal de envio é mais
--    sensível que operar o funil de RH).
-- ============================================================

CREATE OR REPLACE FUNCTION get_store_whatsapp_credential_status(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row store_whatsapp_credentials%ROWTYPE;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_row FROM store_whatsapp_credentials WHERE store_id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('configured', false, 'is_active', false);
  END IF;

  RETURN jsonb_build_object(
    'configured', v_row.uazapi_url IS NOT NULL AND v_row.uazapi_token IS NOT NULL,
    'is_active', v_row.is_active,
    'uazapi_url', v_row.uazapi_url,
    'token_last4', CASE WHEN v_row.uazapi_token IS NOT NULL THEN right(v_row.uazapi_token, 4) ELSE NULL END,
    'updated_at', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_store_whatsapp_credential_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_store_whatsapp_credential(p_store_id uuid, p_uazapi_url text, p_uazapi_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO store_whatsapp_credentials (store_id, uazapi_url, uazapi_token, updated_by, updated_at)
  VALUES (p_store_id, p_uazapi_url, p_uazapi_token, auth.uid(), now())
  ON CONFLICT (store_id) DO UPDATE SET
    uazapi_url = EXCLUDED.uazapi_url,
    uazapi_token = EXCLUDED.uazapi_token,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_store_whatsapp_credential(uuid, text, text) TO authenticated;

-- ============================================================
-- 3. Agendamento: drena a fila a cada minuto, chamando a edge function
--    (migration seguinte cria o arquivo; o agendamento já pode ser criado).
-- ============================================================

-- Ref do projeto conferido via `supabase projects list` (sivbyjwhmeftmtlghmnz,
-- linked=true) — NÃO usar o ref de 20260508000002_monthly_commission_cron.sql
-- (kjfsmwtwbreapipifjtu), que é de antes do projeto ser recriado em
-- 2026-06-20 e está desatualizado (aquele cron está quebrado silenciosamente).
SELECT cron.schedule(
  'rh-automation-whatsapp-sender',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/send-automation-whatsapp',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
