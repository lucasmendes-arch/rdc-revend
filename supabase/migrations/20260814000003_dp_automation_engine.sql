-- Automações do módulo DP (Contratação) — etapa 2: o motor.
--
-- Funções irmãs das do RH (20260719000002), não substitutas: aquelas estão em
-- produção com 4 regras e não são tocadas aqui. O que é genérico
-- (render_automation_template, evaluate_automation_conditions) é reaproveitado
-- como está; o que é específico da entidade (montagem de contexto e execução
-- das ações) ganha versão própria pra `employee_processes`.

-- ============================================================
-- 1. execute_process_automation_action — 3 tipos.
--
-- send_whatsapp reaproveita a fila do RH sem alteração de contrato: a fila é
-- indexada por candidate_id, e todo processo tem um candidato por trás (é dele
-- o telefone). process_id vai junto só pra rastreio.
-- ============================================================

CREATE OR REPLACE FUNCTION execute_process_automation_action(
  p_process_id uuid, p_automation_id uuid, p_action_id uuid,
  p_action_type text, p_action_config jsonb, p_context jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message text;
  v_candidate_id uuid;
  v_store_id uuid;
BEGIN
  v_candidate_id := (p_context->'candidate'->>'id')::uuid;
  v_store_id := (p_context->'store'->>'id')::uuid;

  IF p_action_type = 'change_process_stage' THEN
    -- GUC transaction-local só pra proveniência (qual automação causou a
    -- mudança); quem corta recursão de verdade é pg_trigger_depth(), no
    -- trigger. Mesmo desenho de execute_automation_action.
    PERFORM set_config('dp_automation.dispatching_id', p_automation_id::text, true);
    UPDATE employee_processes SET current_stage = (p_action_config->>'stage') WHERE id = p_process_id;
    PERFORM set_config('dp_automation.dispatching_id', '', true);

    INSERT INTO employee_timeline (process_id, author_id, note, source)
    VALUES (p_process_id, NULL,
      'Automação: etapa alterada para ' || (p_action_config->>'stage'), 'dp');

  ELSIF p_action_type = 'add_timeline_note' THEN
    INSERT INTO employee_timeline (process_id, author_id, note, source)
    VALUES (p_process_id, NULL,
      render_automation_template(p_action_config->>'text', p_context), 'dp');

  ELSIF p_action_type = 'send_whatsapp' THEN
    SELECT render_automation_template(body, p_context) INTO v_message
    FROM whatsapp_templates WHERE id = (p_action_config->>'template_id')::uuid AND is_active;

    IF v_message IS NOT NULL THEN
      INSERT INTO automation_whatsapp_queue (
        candidate_id, process_id, store_id, automation_id, automation_action_id,
        template_id, whatsapp_instance_id, phone_number, rendered_message, idempotency_key
      ) VALUES (
        v_candidate_id, p_process_id, v_store_id, p_automation_id, p_action_id,
        (p_action_config->>'template_id')::uuid,
        NULLIF(p_action_config->>'whatsapp_instance_id', '')::uuid,
        p_context->'candidate'->>'whatsapp', v_message,
        p_action_id::text || ':' || p_process_id::text || ':' || clock_timestamp()::text
      );
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION execute_process_automation_action(uuid, uuid, uuid, text, jsonb, jsonb) FROM PUBLIC;

-- ============================================================
-- 2. dispatch_process_automations — casa gatilho/etapa, avalia condições e
--    roda as ações em ordem. Falha numa ação não reverte a transição que a
--    disparou nem impede as ações seguintes (mesma garantia do RH).
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_process_automations(
  p_process_id uuid,
  p_trigger_type text,
  p_previous_stage text,
  p_new_stage text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context jsonb;
  v_automation record;
  v_action record;
BEGIN
  -- Contexto do processo. `candidate`/`store` mantêm os mesmos nomes de campo
  -- usados no contexto do RH, então os placeholders ({candidate_name},
  -- {store_name}, ...) e a whitelist de condições valem nas duas entidades.
  SELECT jsonb_build_object(
    'trigger_type', p_trigger_type,
    'previous_stage', p_previous_stage,
    'new_stage', p_new_stage,
    'process', jsonb_build_object(
      'id', p.id, 'stage', p.current_stage, 'status', p.status,
      'employment_type', p.employment_type, 'role_title', p.role_title,
      'started_at', p.started_at, 'due_date', p.due_date
    ),
    'candidate', jsonb_build_object(
      'id', c.id, 'name', c.name, 'age', c.age, 'stage', c.stage, 'whatsapp', c.whatsapp
    ),
    'job_opening', jsonb_build_object('id', jo.id, 'role_title', p.role_title),
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug)
  ) INTO v_context
  FROM employee_processes p
  JOIN candidates c ON c.id = p.candidate_id
  JOIN stores s ON s.id = p.store_id
  LEFT JOIN job_openings jo ON jo.id = c.job_opening_id
  WHERE p.id = p_process_id;

  IF v_context IS NULL THEN RETURN; END IF;

  FOR v_automation IN
    SELECT * FROM automations
    WHERE is_active
      AND entity = 'process'
      AND trigger_type = p_trigger_type
      AND (trigger_type <> 'process_stage_changed' OR trigger_stage = p_new_stage)
      AND evaluate_automation_conditions(trigger_conditions, v_context)
    ORDER BY sort_order
  LOOP
    FOR v_action IN
      SELECT * FROM automation_actions WHERE automation_id = v_automation.id ORDER BY sort_order
    LOOP
      BEGIN
        PERFORM execute_process_automation_action(
          p_process_id, v_automation.id, v_action.id,
          v_action.action_type, v_action.action_config, v_context);
      EXCEPTION WHEN OTHERS THEN
        -- Erro vira linha na timeline do processo: é o que o card já exibe,
        -- então a falha aparece sem precisar de tela de log.
        INSERT INTO employee_timeline (process_id, author_id, note, source)
        VALUES (p_process_id, NULL,
          'Falha na automação "' || v_automation.name || '" (' || v_action.action_type || '): ' || SQLERRM, 'dp');
      END;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_process_automations(uuid, text, text, text) FROM PUBLIC;

-- ============================================================
-- 3. Gatilho de mudança de etapa.
--
-- Trigger próprio, AFTER UPDATE: não estendo trg_employee_processes_sync_status
-- (BEFORE, e compartilhado com o fluxo de contrato) pra não recriar função que
-- outra sessão pode estar mexendo — ver project_concurrent_sessions.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_employee_processes_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
    IF pg_trigger_depth() <= 10 THEN
      PERFORM dispatch_process_automations(NEW.id, 'process_stage_changed', OLD.current_stage, NEW.current_stage);
    ELSE
      INSERT INTO employee_timeline (process_id, author_id, note, source)
      VALUES (NEW.id, NULL,
        'Automação interrompida: limite de encadeamento atingido (' || pg_trigger_depth() || ')', 'dp');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_processes_automation
  AFTER UPDATE ON employee_processes
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_processes_automation();

-- ============================================================
-- 4. process_date_reached — scan periódico.
--
-- A data observada depende de trigger_config.date_source:
--   contract_term_end → fim do curso (employee_contracts.term_end, tipo 'formacao')
--   experience_end    → fim da experiência (activated_at + 45d CLT / 90d MEI,
--                       mesma regra de getExperienceInfo em dpConstants.ts)
--   due_date          → prazo manual do processo
-- offset_days desloca o disparo (negativo antecipa).
--
-- Idempotência: grava em automation_process_runs ANTES de disparar, com o
-- UNIQUE segurando corridas entre execuções concorrentes.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_process_automation_date(p_process_id uuid, p_date_source text)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_date_source
    WHEN 'contract_term_end' THEN (
      SELECT ec.term_end FROM employee_contracts ec
      WHERE ec.process_id = p.id AND ec.contract_type = 'formacao'
      ORDER BY ec.created_at DESC LIMIT 1
    )
    WHEN 'experience_end' THEN (
      CASE WHEN p.activated_at IS NULL THEN NULL
           WHEN p.employment_type = 'clt' AND p.experience_renewed_at IS NULL
             THEN (p.activated_at + interval '45 days')::date
           ELSE (p.activated_at + interval '90 days')::date
      END
    )
    WHEN 'due_date' THEN p.due_date
    ELSE NULL
  END
  FROM employee_processes p WHERE p.id = p_process_id;
$$;

REVOKE EXECUTE ON FUNCTION resolve_process_automation_date(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION dispatch_process_date_automations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation record;
  v_process record;
  v_target date;
  v_count int := 0;
BEGIN
  FOR v_automation IN
    SELECT * FROM automations
    WHERE is_active AND entity = 'process' AND trigger_type = 'process_date_reached'
    ORDER BY sort_order
  LOOP
    -- Processo encerrado não recebe automação de data: a data-alvo continua no
    -- passado pra sempre e o disparo não teria efeito útil.
    FOR v_process IN
      SELECT * FROM employee_processes WHERE status <> 'encerrado'
      FOR UPDATE SKIP LOCKED
    LOOP
      v_target := resolve_process_automation_date(
        v_process.id, v_automation.trigger_config->>'date_source');
      CONTINUE WHEN v_target IS NULL;

      v_target := v_target + COALESCE((v_automation.trigger_config->>'offset_days')::int, 0);
      CONTINUE WHEN v_target > CURRENT_DATE;

      BEGIN
        INSERT INTO automation_process_runs (automation_id, process_id, fired_for)
        VALUES (v_automation.id, v_process.id, v_target);
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;  -- já disparou pra esta data
      END;

      PERFORM dispatch_process_automations(
        v_process.id, 'process_date_reached', v_process.current_stage, v_process.current_stage);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_process_date_automations() FROM PUBLIC;

-- ============================================================
-- 5. process_stage_timeout — parado há N dias na etapa.
--
-- fired_for = o dia em que o timeout venceu (stage_started_at + N), então
-- reentrar na mesma etapa depois gera um fired_for novo e a regra volta a
-- valer — sem isso, uma volta atrás no kanban nunca mais dispararia.
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_process_timeout_automations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation record;
  v_process record;
  v_days int;
  v_due date;
  v_count int := 0;
BEGIN
  FOR v_automation IN
    SELECT * FROM automations
    WHERE is_active AND entity = 'process' AND trigger_type = 'process_stage_timeout'
    ORDER BY sort_order
  LOOP
    v_days := COALESCE((v_automation.trigger_config->>'days')::int, 0);
    CONTINUE WHEN v_days <= 0;

    FOR v_process IN
      SELECT * FROM employee_processes
      WHERE status <> 'encerrado'
        AND (v_automation.trigger_stage IS NULL OR current_stage = v_automation.trigger_stage)
        AND stage_started_at + (v_days || ' days')::interval <= now()
      FOR UPDATE SKIP LOCKED
    LOOP
      v_due := (v_process.stage_started_at + (v_days || ' days')::interval)::date;

      BEGIN
        INSERT INTO automation_process_runs (automation_id, process_id, fired_for)
        VALUES (v_automation.id, v_process.id, v_due);
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;

      PERFORM dispatch_process_automations(
        v_process.id, 'process_stage_timeout', v_process.current_stage, v_process.current_stage);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_process_timeout_automations() FROM PUBLIC;

-- ============================================================
-- 6. Cron — mesma cadência do gatilho de prazo do RH (15 min).
-- ============================================================

SELECT cron.schedule('dp-process-date-automations', '*/15 * * * *',
  $$SELECT dispatch_process_date_automations()$$);
SELECT cron.schedule('dp-process-timeout-automations', '*/15 * * * *',
  $$SELECT dispatch_process_timeout_automations()$$);
