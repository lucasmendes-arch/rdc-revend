-- Módulo de RH — Motor de Automações (Fase 4): confirmação humana, variáveis
-- de sessão e instância Uazapi por automação.
--
-- Contexto: migra pra cá a automação que rodava no n8n/ClickUp — mover o card
-- de "Pendente" pra "Conversa Iniciada" dispara a mensagem de convite pra
-- entrevista. Três lacunas em relação ao que o motor já fazia (Fase 3,
-- migrations 20260719000001/2/3):
--
--   1. Variáveis que mudam a cada lote de entrevistas (data e horários). No
--      n8n era um nó "Set" editado à mão antes de mover os candidatos. Aqui
--      viram `automation_variables` — globais e não por loja, porque o fluxo
--      real é: edita os dois campos, move o lote daquela data, edita de novo,
--      move o próximo lote.
--
--   2. Confirmação humana antes do envio. O motor da Fase 3 dispara direto
--      dentro do trigger, sem ninguém no meio. Agora uma automação pode
--      exigir confirmação: o frontend pré-visualiza a mensagem renderizada
--      (preview_candidate_stage_automations) e só então move o candidato via
--      move_candidate_stage_confirmed, que marca a transação como confirmada.
--      Sem essa marca a automação é PULADA e o motivo fica no histórico —
--      isso é o que impede que mudar a etapa por outro caminho (ação
--      change_stage de outra automação, SQL manual, script) dispare mensagem
--      pras costas de alguém.
--
--   3. Instância Uazapi escolhida por automação (`whatsapp_instances`), com a
--      credencial por loja virando fallback. Mesmo tratamento de segredo já
--      usado em store_whatsapp_credentials: tabela invisível via PostgREST,
--      token só entra/sai por RPC, e nunca cru.
--
-- Retrocompatibilidade: todas as colunas novas têm DEFAULT, automações
-- existentes seguem com requires_confirmation = false (comportamento atual,
-- disparo direto) e whatsapp_instance_id nulo (resolve por loja, como hoje).

-- ============================================================
-- 1. Link do Google Maps por loja — o {{linkMaps}} do fluxo antigo.
--    Editável no modal "Dados das lojas" (src/components/dp/LojasDadosModal),
--    junto de razão social/CNPJ/endereço.
-- ============================================================

ALTER TABLE stores ADD COLUMN IF NOT EXISTS maps_link text;

COMMENT ON COLUMN stores.maps_link IS
  'Link do Google Maps da unidade, usado no placeholder {store_maps_link} das '
  'mensagens de automação do RH.';

-- ============================================================
-- 2. Variáveis de sessão — globais, editadas direto no kanban de Candidatos
--    antes de mover o lote.
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_variables (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- key entra no template como {var.<key>} — restrita a snake_case pra não
  -- gerar placeholder impossível de escrever no editor de modelo.
  key        text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label      text NOT NULL,
  value      text,
  help_text  text,
  sort_order int NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE automation_variables IS
  'Variáveis livres de mensagem do motor de automações do RH. Globais (não '
  'por loja): o fluxo real é editar os valores e mover o lote de candidatos '
  'daquela rodada de entrevistas. Usadas como {var.<key>} nos modelos.';

ALTER TABLE automation_variables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_variables_rh_access ON automation_variables;
CREATE POLICY automation_variables_rh_access ON automation_variables
  FOR ALL TO authenticated USING (has_rh_access()) WITH CHECK (has_rh_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON automation_variables TO authenticated;

INSERT INTO automation_variables (key, label, value, help_text, sort_order) VALUES
  ('data_entrevista', 'Data da entrevista', NULL, 'Ex: Hoje (16/07)', 0),
  ('horarios',        'Horários',           NULL, 'Ex: Entre as 14h às 16h', 1)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. Instâncias Uazapi nomeadas — escolhidas por automação.
--    Mesmo regime de segredo de store_whatsapp_credentials: sem policy pra
--    `authenticated`, tabela invisível via PostgREST, token só via RPC.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  uazapi_url   text NOT NULL,
  uazapi_token text NOT NULL, -- SECRET — nunca sai por SELECT, só right(...,4) via RPC
  is_active    boolean NOT NULL DEFAULT true,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE whatsapp_instances IS
  'Instâncias Uazapi nomeadas, selecionáveis na ação send_whatsapp de uma '
  'automação. Ordem de resolução no envio: instância da ação > credencial da '
  'loja (store_whatsapp_credentials) > instância global (env UAZAPI_URL/TOKEN).';

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_instances FROM authenticated, PUBLIC;
-- Projeto recriado em 2026-06-20 não veio com grants padrão pro service_role
-- (ver private-docs/memory.md) — a edge function send-automation-whatsapp lê
-- esta tabela, então o GRANT é explícito e obrigatório.
GRANT SELECT ON whatsapp_instances TO service_role;

-- ============================================================
-- 4. Colunas novas em automations / fila
-- ============================================================

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS requires_confirmation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN automations.requires_confirmation IS
  'Quando true, a automação só roda se a transação tiver sido marcada como '
  'confirmada por move_candidate_stage_confirmed(). Qualquer outro caminho '
  'que mude a etapa pula a automação e registra whatsapp_blocked.';

ALTER TABLE automation_whatsapp_queue
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE SET NULL;

-- Novo event_type pra automação pulada por falta de confirmação. O CHECK veio
-- de um ADD COLUMN ... CHECK em 20260719000001, então tem o nome automático.
ALTER TABLE candidate_stage_history
  DROP CONSTRAINT IF EXISTS candidate_stage_history_event_type_check;
ALTER TABLE candidate_stage_history
  ADD CONSTRAINT candidate_stage_history_event_type_check CHECK (event_type IN (
    'stage_change', 'tag_added', 'tag_removed',
    'due_date_changed', 'assignee_changed',
    'whatsapp_sent', 'comment_added', 'automation_error',
    'whatsapp_blocked'
  ));

-- ============================================================
-- 5. render_automation_template — passa a aceitar variáveis livres.
--    CREATE OR REPLACE (mesma assinatura, sem DROP) porque DROP FUNCTION
--    apaga os grants e o CREATE devolve EXECUTE pra PUBLIC — foi assim que
--    get_system_users vazou e-mail da equipe no checkup de 2026-07-23.
-- ============================================================

CREATE OR REPLACE FUNCTION render_automation_template(p_template text, p_context jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out text := coalesce(p_template, '');
  v_key text;
  v_val text;
BEGIN
  v_out := replace(v_out, '{candidate_name}',       coalesce(p_context->'candidate'->>'name', ''));
  v_out := replace(v_out, '{candidate_first_name}', coalesce(p_context->'candidate'->>'first_name', ''));
  v_out := replace(v_out, '{job_role_title}',       coalesce(p_context->'job_opening'->>'role_title', ''));
  v_out := replace(v_out, '{store_name}',           coalesce(p_context->'store'->>'name', ''));
  v_out := replace(v_out, '{store_maps_link}',      coalesce(p_context->'store'->>'maps_link', ''));
  v_out := replace(v_out, '{new_stage}',            coalesce(p_context->>'new_stage', ''));
  v_out := replace(v_out, '{previous_stage}',       coalesce(p_context->>'previous_stage', ''));

  IF p_context ? 'variables' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_context->'variables') LOOP
      v_out := replace(v_out, '{var.' || v_key || '}', coalesce(v_val, ''));
    END LOOP;
  END IF;

  RETURN v_out;
END;
$$;

-- ============================================================
-- 6. build_candidate_automation_context — extraído de
--    dispatch_candidate_automations pra que o preview e o disparo real
--    montem EXATAMENTE o mesmo contexto. Se divergirem, o usuário confirma
--    uma mensagem e o candidato recebe outra.
-- ============================================================

CREATE OR REPLACE FUNCTION build_candidate_automation_context(
  p_candidate_id uuid,
  p_trigger_type text,
  p_previous_stage text,
  p_new_stage text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context jsonb;
BEGIN
  SELECT jsonb_build_object(
    'trigger_type', p_trigger_type,
    'previous_stage', p_previous_stage,
    'new_stage', p_new_stage,
    'candidate', jsonb_build_object(
      'id', c.id, 'name', c.name, 'age', c.age, 'stage', c.stage, 'whatsapp', c.whatsapp,
      -- firstName do Code node do n8n
      'first_name', split_part(btrim(c.name), ' ', 1)
    ),
    'job_opening', jsonb_build_object('id', jo.id, 'role_title', jo.role_title),
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'maps_link', s.maps_link),
    'variables', coalesce(
      (SELECT jsonb_object_agg(key, coalesce(value, '')) FROM automation_variables),
      '{}'::jsonb
    )
  ) INTO v_context
  FROM candidates c
  JOIN job_openings jo ON jo.id = c.job_opening_id
  JOIN stores s ON s.id = jo.store_id
  WHERE c.id = p_candidate_id;

  RETURN v_context;
END;
$$;

REVOKE EXECUTE ON FUNCTION build_candidate_automation_context(uuid, text, text, text) FROM PUBLIC;

-- ============================================================
-- 7. execute_automation_action — send_whatsapp passa a gravar a instância
--    escolhida na ação. Resto idêntico à Fase 3.
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
  v_instance_id uuid;
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
    v_instance_id := nullif(p_action_config->>'whatsapp_instance_id', '')::uuid;
    SELECT render_automation_template(body, p_context) INTO v_message
    FROM whatsapp_templates WHERE id = (p_action_config->>'template_id')::uuid AND is_active;
    IF v_message IS NOT NULL THEN
      INSERT INTO automation_whatsapp_queue (
        candidate_id, store_id, automation_id, automation_action_id, template_id,
        whatsapp_instance_id, phone_number, rendered_message, idempotency_key
      ) VALUES (
        p_candidate_id, v_store_id, p_automation_id, p_action_id, (p_action_config->>'template_id')::uuid,
        v_instance_id, p_context->'candidate'->>'whatsapp', v_message,
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
-- 8. dispatch_candidate_automations — usa o contexto extraído e pula
--    automações que exigem confirmação quando a transação não foi marcada.
--
--    A marca é o GUC transaction-local rh_automation.confirmed_candidate_id,
--    setado só por move_candidate_stage_confirmed(). Guarda o ID do candidato
--    (não um booleano) porque uma ação change_stage pode mover um SEGUNDO
--    candidato dentro da mesma transação — um booleano deixaria a confirmação
--    de um valer pro outro.
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
  v_confirmed_for text;
BEGIN
  v_context := build_candidate_automation_context(p_candidate_id, p_trigger_type, p_previous_stage, p_new_stage);
  IF v_context IS NULL THEN RETURN; END IF;

  v_confirmed_for := nullif(current_setting('rh_automation.confirmed_candidate_id', true), '');

  FOR v_automation IN
    SELECT * FROM automations
    WHERE is_active
      AND trigger_type = p_trigger_type
      AND (trigger_type != 'stage_changed' OR trigger_stage = p_new_stage)
      AND evaluate_automation_conditions(trigger_conditions, v_context)
    ORDER BY sort_order
  LOOP
    IF v_automation.requires_confirmation AND v_confirmed_for IS DISTINCT FROM p_candidate_id::text THEN
      INSERT INTO candidate_stage_history (candidate_id, event_type, automation_id, metadata)
      VALUES (p_candidate_id, 'whatsapp_blocked', v_automation.id,
        jsonb_build_object(
          'reason', 'requires_confirmation',
          'trigger_type', p_trigger_type,
          'new_stage', p_new_stage
        ));
      CONTINUE;
    END IF;

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
-- 9. preview_candidate_stage_automations — o que o popup mostra ANTES de
--    mover o card. Só lê: não enfileira, não grava histórico, não muda etapa.
-- ============================================================

CREATE OR REPLACE FUNCTION preview_candidate_stage_automations(
  p_candidate_id uuid,
  p_new_stage text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context jsonb;
  v_current_stage text;
  v_result jsonb := '[]'::jsonb;
  v_automation record;
  v_action record;
  v_message text;
  v_template_name text;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH';
  END IF;

  SELECT stage INTO v_current_stage FROM candidates WHERE id = p_candidate_id;
  IF v_current_stage IS NULL THEN RETURN v_result; END IF;

  v_context := build_candidate_automation_context(p_candidate_id, 'stage_changed', v_current_stage, p_new_stage);
  IF v_context IS NULL THEN RETURN v_result; END IF;

  FOR v_automation IN
    SELECT * FROM automations
    WHERE is_active
      AND requires_confirmation
      AND trigger_type = 'stage_changed'
      AND trigger_stage = p_new_stage
      AND evaluate_automation_conditions(trigger_conditions, v_context)
    ORDER BY sort_order
  LOOP
    FOR v_action IN
      SELECT * FROM automation_actions
      WHERE automation_id = v_automation.id AND action_type = 'send_whatsapp'
      ORDER BY sort_order
    LOOP
      SELECT render_automation_template(body, v_context), name
      INTO v_message, v_template_name
      FROM whatsapp_templates
      WHERE id = (v_action.action_config->>'template_id')::uuid AND is_active;

      IF v_message IS NOT NULL THEN
        v_result := v_result || jsonb_build_object(
          'automation_id', v_automation.id,
          'automation_name', v_automation.name,
          'template_name', v_template_name,
          'phone_number', v_context->'candidate'->>'whatsapp',
          'message', v_message,
          'instance_name', (
            SELECT name FROM whatsapp_instances
            WHERE id = nullif(v_action.action_config->>'whatsapp_instance_id', '')::uuid
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION preview_candidate_stage_automations(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION preview_candidate_stage_automations(uuid, text) TO authenticated;

-- ============================================================
-- 10. move_candidate_stage_confirmed — o "Confirmar" do popup. Marca a
--     transação e faz o UPDATE; o trigger de sempre cuida do resto.
-- ============================================================

CREATE OR REPLACE FUNCTION move_candidate_stage_confirmed(
  p_candidate_id uuid,
  p_new_stage text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH';
  END IF;

  PERFORM set_config('rh_automation.confirmed_candidate_id', p_candidate_id::text, true);
  UPDATE candidates SET stage = p_new_stage WHERE id = p_candidate_id;
  PERFORM set_config('rh_automation.confirmed_candidate_id', '', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION move_candidate_stage_confirmed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION move_candidate_stage_confirmed(uuid, text) TO authenticated;

-- ============================================================
-- 11. RPCs de instância Uazapi — mesmo contrato das credenciais por loja:
--     leitura mascarada pra quem tem RH, escrita só pra admin.
-- ============================================================

CREATE OR REPLACE FUNCTION list_whatsapp_instances()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'uazapi_url', uazapi_url,
      'token_last4', right(uazapi_token, 4),
      'is_active', is_active,
      'updated_at', updated_at
    ) ORDER BY name)
    FROM whatsapp_instances
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION list_whatsapp_instances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_whatsapp_instances() TO authenticated;

-- Token opcional no update: string vazia/NULL mantém o token atual, pra que
-- editar só o nome da instância não exija redigitar o segredo.
CREATE OR REPLACE FUNCTION admin_upsert_whatsapp_instance(
  p_id uuid,
  p_name text,
  p_uazapi_url text,
  p_uazapi_token text,
  p_is_active boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF btrim(coalesce(p_name, '')) = '' OR btrim(coalesce(p_uazapi_url, '')) = '' THEN
    RAISE EXCEPTION 'Nome e URL da instância são obrigatórios';
  END IF;

  IF p_id IS NULL THEN
    IF btrim(coalesce(p_uazapi_token, '')) = '' THEN
      RAISE EXCEPTION 'Token é obrigatório ao criar uma instância';
    END IF;
    INSERT INTO whatsapp_instances (name, uazapi_url, uazapi_token, is_active, updated_by)
    VALUES (btrim(p_name), btrim(p_uazapi_url), btrim(p_uazapi_token), p_is_active, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE whatsapp_instances SET
      name         = btrim(p_name),
      uazapi_url   = btrim(p_uazapi_url),
      uazapi_token = CASE WHEN btrim(coalesce(p_uazapi_token, '')) = '' THEN uazapi_token ELSE btrim(p_uazapi_token) END,
      is_active    = p_is_active,
      updated_by   = auth.uid(),
      updated_at   = now()
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Instância não encontrada';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_upsert_whatsapp_instance(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_upsert_whatsapp_instance(uuid, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION admin_delete_whatsapp_instance(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  DELETE FROM whatsapp_instances WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_whatsapp_instance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_whatsapp_instance(uuid) TO authenticated;
