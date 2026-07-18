-- Módulo de RH — Motor de Automações (Fase 3), etapa 2: motor de disparo.
-- Estende o trigger já existente (log_candidate_stage_change) em vez de criar
-- um trigger concorrente — um único ponto reage a mudança de etapa/criação de
-- candidato. Guarda de recursão usa pg_trigger_depth() nativo do Postgres
-- (uma ação change_stage refaz UPDATE candidates, o que re-dispara este mesmo
-- trigger e incrementa a profundidade sozinho).
--
-- Descoberta ao aplicar: este projeto (recriado em 2026-06-20, sem alguns
-- itens de setup padrão — ver private-docs/memory.md) não tinha pg_cron nem
-- pg_net habilitados, apesar de migrations antigas (partner_order_webhook,
-- monthly_commission_cron) já assumirem cron.schedule/net.http_post — essas
-- ficaram inertes neste remoto até agora. Habilitando aqui de forma idempotente.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- 1. render_automation_template — substituição simples de placeholders,
--    sem SQL dinâmico, whitelist fixa.
-- ============================================================

CREATE OR REPLACE FUNCTION render_automation_template(p_template text, p_context jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(replace(replace(
    p_template,
    '{candidate_name}', coalesce(p_context->'candidate'->>'name', '')),
    '{job_role_title}', coalesce(p_context->'job_opening'->>'role_title', '')),
    '{store_name}', coalesce(p_context->'store'->>'name', '')),
    '{new_stage}', coalesce(p_context->>'new_stage', '')),
    '{previous_stage}', coalesce(p_context->>'previous_stage', ''));
$$;

-- ============================================================
-- 2. evaluate_automation_conditions — whitelist de 5 campos, AND-combinado,
--    campo fora da whitelist falha fechado (nunca casa).
-- ============================================================

CREATE OR REPLACE FUNCTION evaluate_automation_conditions(p_conditions jsonb, p_context jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cond jsonb;
  v_field text;
  v_op text;
  v_actual text;
  v_expected text;
BEGIN
  IF p_conditions IS NULL OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN true;
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    v_field := v_cond->>'field';
    v_op := v_cond->>'op';

    IF v_field NOT IN ('candidate.age', 'candidate.stage', 'job_opening.role_title', 'store.name', 'store.slug') THEN
      RETURN false;
    END IF;

    v_actual := CASE v_field
      WHEN 'candidate.age'          THEN p_context->'candidate'->>'age'
      WHEN 'candidate.stage'        THEN p_context->'candidate'->>'stage'
      WHEN 'job_opening.role_title' THEN p_context->'job_opening'->>'role_title'
      WHEN 'store.name'             THEN p_context->'store'->>'name'
      WHEN 'store.slug'             THEN p_context->'store'->>'slug'
    END;

    IF v_op = 'in' THEN
      IF NOT (v_actual = ANY (SELECT jsonb_array_elements_text(v_cond->'value'))) THEN RETURN false; END IF;
      CONTINUE;
    END IF;

    v_expected := v_cond->>'value';

    IF v_field = 'candidate.age' THEN
      CASE v_op
        WHEN 'eq'  THEN IF NOT (v_actual::numeric = v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'neq' THEN IF NOT (v_actual::numeric != v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'gt'  THEN IF NOT (v_actual::numeric > v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'gte' THEN IF NOT (v_actual::numeric >= v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'lt'  THEN IF NOT (v_actual::numeric < v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'lte' THEN IF NOT (v_actual::numeric <= v_expected::numeric) THEN RETURN false; END IF;
        ELSE RETURN false;
      END CASE;
    ELSE
      CASE v_op
        WHEN 'eq'       THEN IF NOT (v_actual = v_expected) THEN RETURN false; END IF;
        WHEN 'neq'      THEN IF NOT (v_actual IS DISTINCT FROM v_expected) THEN RETURN false; END IF;
        WHEN 'contains' THEN IF NOT (v_actual ILIKE '%' || v_expected || '%') THEN RETURN false; END IF;
        ELSE RETURN false;
      END CASE;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- ============================================================
-- 3. execute_automation_action — 7 tipos, cada um grava sua própria linha
--    de atividade. change_stage seta um GUC transaction-local só pra
--    provenance (qual automação causou a mudança) — pg_trigger_depth() é
--    quem garante o limite de recursão, não esse GUC.
-- ============================================================

CREATE OR REPLACE FUNCTION execute_automation_action(
  p_candidate_id uuid, p_automation_id uuid, p_action_id uuid,
  p_action_type text, p_action_config jsonb, p_context jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_name text;
  v_old_due date;
  v_old_assignee uuid;
  v_store_id uuid;
  v_message text;
BEGIN
  IF p_action_type = 'change_stage' THEN
    PERFORM set_config('rh_automation.dispatching_id', p_automation_id::text, true);
    UPDATE candidates SET stage = (p_action_config->>'stage') WHERE id = p_candidate_id;
    PERFORM set_config('rh_automation.dispatching_id', '', true);

  ELSIF p_action_type = 'add_tag' THEN
    SELECT name INTO v_tag_name FROM tags WHERE id = (p_action_config->>'tag_id')::uuid;
    INSERT INTO candidate_tags (candidate_id, tag_id, source)
    VALUES (p_candidate_id, (p_action_config->>'tag_id')::uuid, 'automation')
    ON CONFLICT (candidate_id, tag_id) DO NOTHING;
    INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
    VALUES (p_candidate_id, 'tag_added', p_automation_id,
      jsonb_build_object('tag_id', p_action_config->>'tag_id', 'tag_name', v_tag_name));

  ELSIF p_action_type = 'remove_tag' THEN
    SELECT name INTO v_tag_name FROM tags WHERE id = (p_action_config->>'tag_id')::uuid;
    DELETE FROM candidate_tags WHERE candidate_id = p_candidate_id AND tag_id = (p_action_config->>'tag_id')::uuid;
    INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
    VALUES (p_candidate_id, 'tag_removed', p_automation_id,
      jsonb_build_object('tag_id', p_action_config->>'tag_id', 'tag_name', v_tag_name));

  ELSIF p_action_type = 'change_due_date' THEN
    SELECT due_date INTO v_old_due FROM candidates WHERE id = p_candidate_id;
    IF p_action_config->>'mode' = 'clear' THEN
      UPDATE candidates SET due_date = NULL WHERE id = p_candidate_id;
    ELSE
      UPDATE candidates SET due_date = CURRENT_DATE + ((p_action_config->>'days')::int) WHERE id = p_candidate_id;
    END IF;
    INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
    VALUES (p_candidate_id, 'due_date_changed', p_automation_id,
      jsonb_build_object('previous_due_date', v_old_due, 'new_due_date',
        (SELECT due_date FROM candidates WHERE id = p_candidate_id)));

  ELSIF p_action_type = 'change_assignee' THEN
    SELECT assignee_id INTO v_old_assignee FROM candidates WHERE id = p_candidate_id;
    IF (p_action_config->>'clear')::boolean IS TRUE THEN
      UPDATE candidates SET assignee_id = NULL WHERE id = p_candidate_id;
    ELSE
      UPDATE candidates SET assignee_id = (p_action_config->>'assignee_id')::uuid WHERE id = p_candidate_id;
    END IF;
    INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
    VALUES (p_candidate_id, 'assignee_changed', p_automation_id,
      jsonb_build_object('previous_assignee_id', v_old_assignee, 'new_assignee_id', p_action_config->>'assignee_id'));

  ELSIF p_action_type = 'send_whatsapp' THEN
    v_store_id := (p_context->'store'->>'id')::uuid;
    SELECT render_automation_template(body, p_context) INTO v_message
    FROM whatsapp_templates WHERE id = (p_action_config->>'template_id')::uuid AND is_active;
    IF v_message IS NOT NULL THEN
      INSERT INTO automation_whatsapp_queue (
        candidate_id, store_id, automation_id, automation_action_id, template_id,
        phone_number, rendered_message, idempotency_key
      ) VALUES (
        p_candidate_id, v_store_id, p_automation_id, p_action_id, (p_action_config->>'template_id')::uuid,
        p_context->'candidate'->>'whatsapp', v_message,
        p_action_id::text || ':' || p_candidate_id::text || ':' || clock_timestamp()::text
      );
    END IF;
    -- 'whatsapp_sent' é gravado depois pela edge function (service_role),
    -- quando o envio de fato resolve (migration 20260719000003).

  ELSIF p_action_type = 'add_comment' THEN
    INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
    VALUES (p_candidate_id, 'comment_added', p_automation_id,
      jsonb_build_object('text', render_automation_template(p_action_config->>'text', p_context)));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION execute_automation_action(uuid, uuid, uuid, text, jsonb, jsonb) FROM PUBLIC;

-- ============================================================
-- 4. dispatch_candidate_automations — casa trigger_type/trigger_stage,
--    avalia condições, roda as ações em ordem. Falha numa ação nunca reverte
--    a transição que a disparou nem impede as demais ações.
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_candidate_automations(
  p_candidate_id uuid,
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
  SELECT jsonb_build_object(
    'trigger_type', p_trigger_type,
    'previous_stage', p_previous_stage,
    'new_stage', p_new_stage,
    'candidate', jsonb_build_object(
      'id', c.id, 'name', c.name, 'age', c.age, 'stage', c.stage, 'whatsapp', c.whatsapp
    ),
    'job_opening', jsonb_build_object('id', jo.id, 'role_title', jo.role_title),
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug)
  ) INTO v_context
  FROM candidates c
  JOIN job_openings jo ON jo.id = c.job_opening_id
  JOIN stores s ON s.id = jo.store_id
  WHERE c.id = p_candidate_id;

  IF v_context IS NULL THEN RETURN; END IF;

  FOR v_automation IN
    SELECT * FROM automations
    WHERE is_active
      AND trigger_type = p_trigger_type
      AND (trigger_type != 'stage_changed' OR trigger_stage = p_new_stage)
      AND evaluate_automation_conditions(trigger_conditions, v_context)
    ORDER BY sort_order
  LOOP
    FOR v_action IN
      SELECT * FROM automation_actions WHERE automation_id = v_automation.id ORDER BY sort_order
    LOOP
      BEGIN
        PERFORM execute_automation_action(p_candidate_id, v_automation.id, v_action.id, v_action.action_type, v_action.action_config, v_context);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
        VALUES (p_candidate_id, 'automation_error', v_automation.id,
          jsonb_build_object('action_type', v_action.action_type, 'error', SQLERRM));
      END;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_candidate_automations(uuid, text, text, text) FROM PUBLIC;

-- ============================================================
-- 5. Estende log_candidate_stage_change() — mesma função, mesmos triggers já
--    existentes (candidates_log_stage_insert/update), só acrescenta o
--    disparo do motor depois de gravar a linha de histórico.
-- ============================================================

CREATE OR REPLACE FUNCTION log_candidate_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
BEGIN
  v_automation_id := NULLIF(current_setting('rh_automation.dispatching_id', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO candidate_stage_history (candidate_id, previous_stage, new_stage, changed_by, event_type, automation_id)
    VALUES (NEW.id, NULL, NEW.stage, auth.uid(), 'stage_change', v_automation_id);

    IF pg_trigger_depth() <= 10 THEN
      PERFORM dispatch_candidate_automations(NEW.id, 'candidate_created', NULL, NEW.stage);
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO candidate_stage_history (candidate_id, previous_stage, new_stage, changed_by, event_type, automation_id)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid(), 'stage_change', v_automation_id);

    IF pg_trigger_depth() <= 10 THEN
      PERFORM dispatch_candidate_automations(NEW.id, 'stage_changed', OLD.stage, NEW.stage);
    ELSE
      INSERT INTO candidate_stage_history (candidate_id, event_type, metadata)
      VALUES (NEW.id, 'automation_error',
        jsonb_build_object('reason', 'max_chain_depth_reached', 'depth', pg_trigger_depth()));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 6. due_date_reached — scan periódico, idempotente (mesmo padrão de
--    send_pending_partner_order_webhooks: marca processado ANTES de disparar,
--    FOR UPDATE SKIP LOCKED evita corrida entre execuções concorrentes).
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_due_date_reached_automations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate candidates%ROWTYPE;
  v_count int := 0;
BEGIN
  FOR v_candidate IN
    SELECT * FROM candidates
    WHERE due_date IS NOT NULL
      AND due_date <= CURRENT_DATE
      AND due_date_reached_processed_at IS NULL
    ORDER BY due_date
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE candidates SET due_date_reached_processed_at = now() WHERE id = v_candidate.id;
    PERFORM dispatch_candidate_automations(v_candidate.id, 'due_date_reached', v_candidate.stage, v_candidate.stage);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_due_date_reached_automations() FROM PUBLIC;

SELECT cron.schedule('rh-due-date-automations', '*/15 * * * *', $$SELECT dispatch_due_date_reached_automations()$$);
