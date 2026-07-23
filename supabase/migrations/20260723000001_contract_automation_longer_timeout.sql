-- generate-contract-automation encadeia várias chamadas externas (OAuth
-- token exchange + Drive find-or-create de 2 pastas + copy + Docs
-- batchUpdate + getWebViewLink + WhatsApp) — o timeout padrão de
-- net.http_post (5000ms) estourava antes da function terminar (confirmado
-- testando com um processo real em 2026-07-22: net._http_response.error_msg
-- = "Timeout of 5000 ms reached"). Sobe pra 30s.

CREATE OR REPLACE FUNCTION trg_employee_processes_contract_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_intent text;
BEGIN
  IF NEW.employment_type <> 'mei' THEN
    RETURN NEW;
  END IF;

  IF NEW.current_stage = 'contrato_formacao'
     AND (TG_OP = 'INSERT' OR OLD.current_stage IS DISTINCT FROM NEW.current_stage) THEN
    v_intent := 'formacao';
  ELSIF TG_OP = 'UPDATE' AND NEW.current_stage = 'encerrado'
        AND OLD.current_stage IN ('contrato_formacao', 'formacao', 'decisao_formacao') THEN
    v_intent := 'desligamento_formacao';
  ELSE
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM internal_config WHERE key = 'contract_automation_secret';

  PERFORM net.http_post(
    url                 := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation',
    headers             := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', v_secret),
    body                := jsonb_build_object('process_id', NEW.id, 'intent', v_intent),
    timeout_milliseconds := 30000
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_employee_contract_data_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_process record;
  v_secret text;
BEGIN
  SELECT employment_type, current_stage INTO v_process
  FROM employee_processes
  WHERE id = NEW.process_id;

  IF v_process.employment_type = 'mei' AND v_process.current_stage = 'contrato_formacao' THEN
    SELECT value INTO v_secret FROM internal_config WHERE key = 'contract_automation_secret';

    PERFORM net.http_post(
      url                 := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation',
      headers             := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', v_secret),
      body                := jsonb_build_object('process_id', NEW.process_id, 'intent', 'formacao'),
      timeout_milliseconds := 30000
    );
  END IF;

  RETURN NEW;
END;
$$;
