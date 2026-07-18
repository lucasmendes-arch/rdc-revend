-- Módulo de RH — Motor de Automações (Fase 3), etapa 1: schema.
-- Substitui as automações do ClickUp + a automação de WhatsApp do n8n por um
-- motor genérico embutido. Esta migration só cria a estrutura de dados —
-- o motor de disparo vem na migration seguinte (20260719000002).

-- ============================================================
-- 1. Extensão em candidates
-- ============================================================

ALTER TABLE candidates
  ADD COLUMN due_date date,
  ADD COLUMN assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Controle de disparo único do cron de due_date_reached (mesmo padrão de
  -- orders.partner_webhook_sent_at) — resetado pra NULL sempre que due_date
  -- muda de valor, pra permitir um novo prazo disparar de novo no futuro.
  ADD COLUMN due_date_reached_processed_at timestamptz;

CREATE INDEX idx_candidates_assignee_id ON candidates(assignee_id);
CREATE INDEX idx_candidates_due_date_pending ON candidates(due_date)
  WHERE due_date IS NOT NULL AND due_date_reached_processed_at IS NULL;

-- Preserva a lógica de stage_started_at já adicionada por
-- 20260718000002_rh_stage_sla_tracking.sql — só acrescenta o reset de
-- due_date_reached_processed_at, sem substituir o comportamento existente.
CREATE OR REPLACE FUNCTION trg_candidates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_started_at := now();
  END IF;
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    NEW.due_date_reached_processed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Tags genéricas (separado da tag de cargo/origem já existentes)
-- ============================================================

CREATE TABLE tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  color      text NOT NULL DEFAULT '#6B7280',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidate_tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automation')),
  assigned_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, tag_id)
);

CREATE INDEX idx_candidate_tags_candidate_id ON candidate_tags(candidate_id);
CREATE INDEX idx_candidate_tags_tag_id ON candidate_tags(tag_id);

-- ============================================================
-- 3. Templates de WhatsApp
-- ============================================================

CREATE TABLE whatsapp_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  -- Placeholders suportados (whitelist fixa, ver render_automation_template
  -- na migration 20260719000002): {candidate_name} {job_role_title}
  -- {store_name} {new_stage} {previous_stage}
  body       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION trg_whatsapp_templates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER whatsapp_templates_set_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION trg_whatsapp_templates_set_updated_at();

-- ============================================================
-- 4. automations / automation_actions
-- ============================================================

CREATE TABLE automations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  description        text,
  trigger_type       text NOT NULL CHECK (trigger_type IN (
                         'candidate_created', 'stage_changed', 'due_date_reached'
                       )),
  -- Obrigatório só quando trigger_type = 'stage_changed' — "dispara quando o
  -- candidato ENTRA nesta etapa". Condições extras (idade, cargo, loja) ficam
  -- em trigger_conditions.
  trigger_stage      text CHECK (trigger_stage IN (
                         'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
                         'decisao_necessaria', 'selecionado', 'em_formacao', 'em_contratacao',
                         'contratado', 'concluido_arquivado',
                         'descartado', 'banco_de_talentos', 'sem_contratacao'
                       )),
  -- Array AND-combinado: [{"field":"job_opening.role_title","op":"eq","value":"Vendedor"}]
  -- Whitelist de field/op validada em evaluate_automation_conditions (migration seguinte).
  trigger_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         int NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automations_trigger_stage_required CHECK (
    (trigger_type = 'stage_changed' AND trigger_stage IS NOT NULL) OR
    (trigger_type != 'stage_changed' AND trigger_stage IS NULL)
  )
);

CREATE INDEX idx_automations_trigger_lookup ON automations(trigger_type, trigger_stage) WHERE is_active;
CREATE INDEX idx_automations_sort_order ON automations(sort_order);

CREATE OR REPLACE FUNCTION trg_automations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER automations_set_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW
  EXECUTE FUNCTION trg_automations_set_updated_at();

CREATE TABLE automation_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  sort_order    int NOT NULL DEFAULT 0,
  action_type   text NOT NULL CHECK (action_type IN (
                    'change_stage', 'add_tag', 'remove_tag', 'change_due_date',
                    'change_assignee', 'send_whatsapp', 'add_comment'
                  )),
  -- Shape por action_type (validado na UI/RPC, não em CHECK):
  --  change_stage:     {"stage": "entrevista_marcada"}
  --  add_tag/remove_tag: {"tag_id": "<uuid>"}
  --  change_due_date:  {"mode": "relative_days", "days": 3} | {"mode": "clear"}
  --  change_assignee:  {"assignee_id": "<uuid>"} | {"clear": true}
  --  send_whatsapp:    {"template_id": "<uuid>"}
  --  add_comment:      {"text": "Candidato avançou para {new_stage}"}
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_actions_automation_id ON automation_actions(automation_id, sort_order);

-- ============================================================
-- 5. candidate_stage_history generalizado em log de atividade
--    (NÃO renomeado — promote_candidate_to_dp e o trigger existente
--    referenciam pelo nome atual; ver patch no final desta migration)
-- ============================================================

ALTER TABLE candidate_stage_history
  ALTER COLUMN new_stage DROP NOT NULL,
  ADD COLUMN event_type   text NOT NULL DEFAULT 'stage_change' CHECK (event_type IN (
                             'stage_change', 'tag_added', 'tag_removed',
                             'due_date_changed', 'assignee_changed',
                             'whatsapp_sent', 'comment_added', 'automation_error'
                           )),
  ADD COLUMN automation_id uuid REFERENCES automations(id) ON DELETE SET NULL,
  ADD COLUMN metadata      jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE candidate_stage_history
  ADD CONSTRAINT candidate_stage_history_new_stage_required CHECK (
    (event_type = 'stage_change' AND new_stage IS NOT NULL) OR
    (event_type != 'stage_change')
  );

CREATE INDEX idx_candidate_stage_history_event_type ON candidate_stage_history(candidate_id, event_type);

-- ============================================================
-- 6. Credenciais Uazapi por unidade (fallback pra instância global até
--    serem populadas com dados reais — ver docs/SCHEMA.md e memória)
-- ============================================================

CREATE TABLE store_whatsapp_credentials (
  store_id     uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  uazapi_url   text,
  uazapi_token text, -- SECRET — nunca concedido via SELECT pra `authenticated`, só RPC/service_role tocam
  is_active    boolean NOT NULL DEFAULT true,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE store_whatsapp_credentials ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy pra `authenticated` — a tabela fica invisível via
-- PostgREST pra qualquer role exceto service_role; as duas RPCs
-- SECURITY DEFINER (migration 20260719000003) controlam exatamente o que sai.
REVOKE ALL ON store_whatsapp_credentials FROM authenticated, PUBLIC;

-- ============================================================
-- 7. Fila de envio de WhatsApp (desacopla o envio da transação que disparou)
-- ============================================================

CREATE TABLE automation_whatsapp_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  store_id              uuid NOT NULL REFERENCES stores(id),
  automation_id         uuid REFERENCES automations(id) ON DELETE SET NULL,
  automation_action_id  uuid REFERENCES automation_actions(id) ON DELETE SET NULL,
  template_id           uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  phone_number          text NOT NULL,
  rendered_message      text NOT NULL,
  idempotency_key       text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'processing', 'sent', 'failed'
                          )),
  attempt_count         int NOT NULL DEFAULT 0,
  last_error            text,
  processed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_whatsapp_queue_status ON automation_whatsapp_queue(status, created_at);

-- ============================================================
-- 8. RLS + GRANTs
-- ============================================================

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_whatsapp_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY automations_rh_access ON automations
  FOR ALL TO authenticated USING (has_rh_access()) WITH CHECK (has_rh_access());
CREATE POLICY automation_actions_rh_access ON automation_actions
  FOR ALL TO authenticated USING (has_rh_access()) WITH CHECK (has_rh_access());
CREATE POLICY tags_rh_access ON tags
  FOR ALL TO authenticated USING (has_rh_access()) WITH CHECK (has_rh_access());
CREATE POLICY candidate_tags_rh_access ON candidate_tags
  FOR ALL TO authenticated USING (has_rh_access()) WITH CHECK (has_rh_access());
CREATE POLICY whatsapp_templates_rh_access ON whatsapp_templates
  FOR ALL TO authenticated USING (has_rh_access()) WITH CHECK (has_rh_access());
-- Fila é só leitura pra authenticated (auditoria) — escrita só via função/service_role.
CREATE POLICY automation_whatsapp_queue_rh_read ON automation_whatsapp_queue
  FOR SELECT TO authenticated USING (has_rh_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON automations, automation_actions, tags, candidate_tags, whatsapp_templates TO authenticated;
GRANT SELECT ON automation_whatsapp_queue TO authenticated;

-- ============================================================
-- 9. Patch em promote_candidate_to_dp (módulo DP, sessão paralela) — a cópia
--    de histórico pra employee_timeline precisa filtrar só stage_change,
--    senão vai copiar linha de tag/comentário/whatsapp como se fosse
--    mudança de etapa ("Etapa RH: NULL → NULL"). Mesma assinatura, aditivo.
-- ============================================================

CREATE OR REPLACE FUNCTION promote_candidate_to_dp(p_candidate_id uuid, p_employment_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_role_title text;
  v_initial_stage text;
  v_process_id uuid;
BEGIN
  IF NOT has_rh_access() THEN
    RAISE EXCEPTION 'Sem permissão para o módulo de RH/DP';
  END IF;

  IF p_employment_type NOT IN ('clt', 'mei_sem_experiencia', 'mei_com_experiencia') THEN
    RAISE EXCEPTION 'employment_type inválido: %', p_employment_type;
  END IF;

  SELECT jo.store_id, jo.role_title
  INTO v_store_id, v_role_title
  FROM candidates c
  JOIN job_openings jo ON jo.id = c.job_opening_id
  WHERE c.id = p_candidate_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Candidato não encontrado ou sem vaga associada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM employee_processes
    WHERE candidate_id = p_candidate_id AND status IN ('em_andamento', 'ativo')
  ) THEN
    RAISE EXCEPTION 'Candidato já possui um processo de DP em andamento';
  END IF;

  UPDATE candidates SET stage = 'contratado' WHERE id = p_candidate_id;

  v_initial_stage := CASE
    WHEN p_employment_type = 'mei_sem_experiencia' THEN 'contrato_formacao'
    ELSE 'contratacao'
  END;

  INSERT INTO employee_processes (candidate_id, employment_type, store_id, role_title, current_stage)
  VALUES (p_candidate_id, p_employment_type, v_store_id, v_role_title, v_initial_stage)
  RETURNING id INTO v_process_id;

  IF p_employment_type = 'clt' THEN
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'ctps', 'pis_pasep', 'titulo_eleitor',
      'comprovante_escolaridade', 'foto_3x4', 'aso_admissional', 'dados_bancarios'
    ]::text[]) AS doc;
  ELSE
    INSERT INTO employee_documents (process_id, document_type)
    SELECT v_process_id, doc FROM unnest(ARRAY[
      'rg_cpf', 'comprovante_residencia', 'cnpj_ccmei', 'dados_bancarios', 'foto_3x4'
    ]::text[]) AS doc;
  END IF;

  -- Só copia mudanças de etapa — event_type novo (tag/comentário/whatsapp)
  -- não faz sentido virar linha de timeline "Etapa RH: X → Y".
  INSERT INTO employee_timeline (process_id, author_id, occurred_at, note, source)
  SELECT
    v_process_id,
    h.changed_by,
    h.changed_at,
    'Etapa RH: ' || COALESCE(h.previous_stage, 'criação do candidato') || ' → ' || h.new_stage,
    'rh'
  FROM candidate_stage_history h
  WHERE h.candidate_id = p_candidate_id AND h.event_type = 'stage_change'
  ORDER BY h.changed_at;

  RETURN v_process_id;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_candidate_to_dp(uuid, text) TO authenticated;
