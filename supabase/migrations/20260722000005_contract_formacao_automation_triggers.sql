-- Gatilho automático de geração de contrato (Formação / Desligamento) —
-- Postgres → pg_net → edge function generate-contract-automation. Ver
-- contexto completo no plano da feature.
--
-- Gatilho DUPLO pro contrato de formação: dispara tanto quando o processo
-- entra em 'contrato_formacao' quanto quando os dados pessoais são
-- completados depois (employee_contract_data) — no momento da mudança de
-- etapa, CPF/endereço/e-mail normalmente ainda não foram preenchidos (isso
-- acontece só depois, na aba "Dados para contrato"). A edge function decide
-- se já tem tudo que precisa; os triggers só avisam, sem culpa, podendo
-- disparar mais de uma vez sem problema (idempotência é responsabilidade da
-- function, que confere se o contrato já foi gerado antes de fazer qualquer
-- chamada ao Google).

-- ============================================================
-- internal_config — segredo compartilhado entre o trigger e a edge function
-- (header x-automation-secret). RLS sem nenhuma policy: só service_role
-- (que sempre bypassa RLS) consegue ler/escrever — nem authenticated nem
-- anon têm acesso. Valor gerado aqui mesmo (gen_random_bytes), nunca
-- aparece em texto plano nesta migration.
-- ============================================================

CREATE TABLE internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_config ENABLE ROW LEVEL SECURITY;

-- gen_random_uuid() é nativo (sem depender de pgcrypto/gen_random_bytes,
-- que não está habilitado neste projeto) — 2 UUIDs concatenados sem hífen
-- dão 64 caracteres aleatórios, entropia de sobra pra um shared secret.
INSERT INTO internal_config (key, value)
VALUES ('contract_automation_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

COMMENT ON TABLE internal_config IS
  'Config interna sem exposição via API (RLS sem policies) — hoje só guarda o segredo compartilhado do trigger de automação de contratos.';

-- ============================================================
-- employee_processes → dispara geração automática na entrada em
-- 'contrato_formacao' e no desligamento durante a formação.
-- ============================================================

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
    url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', v_secret),
    body    := jsonb_build_object('process_id', NEW.id, 'intent', v_intent)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_processes_contract_automation
  AFTER INSERT OR UPDATE ON employee_processes
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_processes_contract_automation();

-- ============================================================
-- employee_contract_data → dispara geração do contrato de formação quando
-- os dados pessoais são salvos/completados DEPOIS que o processo já está
-- em 'contrato_formacao' (resolve o problema de timing).
-- ============================================================

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
      url     := 'https://sivbyjwhmeftmtlghmnz.supabase.co/functions/v1/generate-contract-automation',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', v_secret),
      body    := jsonb_build_object('process_id', NEW.process_id, 'intent', 'formacao')
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_contract_data_automation
  AFTER INSERT OR UPDATE ON employee_contract_data
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_contract_data_automation();
