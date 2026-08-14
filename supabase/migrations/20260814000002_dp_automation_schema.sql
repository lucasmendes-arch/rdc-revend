-- Automações do módulo DP (Contratação) — etapa 1: schema.
--
-- O motor de automações do RH (20260719000001/2) já resolve o problema
-- genérico: condições, templates, fila de WhatsApp, cron. O que falta pro DP é
-- poder apontar esse mesmo motor pra `employee_processes` em vez de
-- `candidates`. Esta migration prepara a estrutura; o disparo vem na migration
-- seguinte (20260814000003).
--
-- Restrição que domina o desenho: o motor do RH está EM PRODUÇÃO (4 regras, 3
-- ativas, 19 mensagens já enfileiradas). Nada aqui pode invalidar uma linha
-- existente — daí `entity` nascer com DEFAULT 'candidate' e todos os CHECKs
-- novos serem escritos como superconjunto dos antigos.

-- ============================================================
-- 1. automations: entidade-alvo + config do gatilho
-- ============================================================

ALTER TABLE automations ADD COLUMN entity text NOT NULL DEFAULT 'candidate';
ALTER TABLE automations ADD CONSTRAINT automations_entity_check
  CHECK (entity IN ('candidate', 'process'));

COMMENT ON COLUMN automations.entity IS
  'Sobre o que a regra age: ''candidate'' (funil de RH) ou ''process'' (kanban de Contratação do DP). Default ''candidate'' preserva as regras criadas antes desta coluna.';

-- Parâmetros dos gatilhos novos, que não cabem numa coluna dedicada:
--   process_date_reached  → {"date_source": "...", "offset_days": 0}
--   process_stage_timeout → {"days": 5}
ALTER TABLE automations ADD COLUMN trigger_config jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN automations.trigger_config IS
  'Config do gatilho. process_date_reached: {date_source: contract_term_end|experience_end|due_date, offset_days: int}. process_stage_timeout: {days: int}. Vazio para os demais.';

-- ============================================================
-- 2. trigger_type — 3 valores novos, validados POR ENTIDADE
--
-- Sem o CHECK composto uma regra de candidato poderia declarar um gatilho de
-- processo (e vice-versa), e o dispatcher simplesmente nunca a executaria —
-- falha silenciosa, o pior tipo pra quem configura pela tela.
-- ============================================================

ALTER TABLE automations DROP CONSTRAINT automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check CHECK (
  (entity = 'candidate' AND trigger_type IN ('candidate_created', 'stage_changed', 'due_date_reached'))
  OR
  (entity = 'process' AND trigger_type IN ('process_stage_changed', 'process_date_reached', 'process_stage_timeout'))
);

-- ============================================================
-- 3. trigger_stage — o CHECK antigo listava só as 11 etapas de
--    candidates.stage. Agora o conjunto válido depende da entidade: etapas de
--    employee_processes (união CLT + MEI, mesma lista de
--    STAGE_COLUMNS_BY_EMPLOYMENT_TYPE em src/lib/dpConstants.ts) pro DP.
-- ============================================================

ALTER TABLE automations DROP CONSTRAINT automations_trigger_stage_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_stage_check CHECK (
  trigger_stage IS NULL
  OR (entity = 'candidate' AND trigger_stage IN (
    'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
    'decisao_necessaria', 'selecionado', 'em_teste', 'contratado',
    'concluido_arquivado', 'descartado', 'banco_de_talentos'
  ))
  OR (entity = 'process' AND trigger_stage IN (
    'formacao', 'decisao_formacao', 'contratacao', 'experiencia', 'decisao',
    'efetivado', 'encerrado'
  ))
);

-- trigger_stage é obrigatório nos dois gatilhos de mudança de etapa e proibido
-- nos demais (mesma regra do CHECK original, estendida pro gatilho do DP).
ALTER TABLE automations DROP CONSTRAINT automations_trigger_stage_required;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_stage_required CHECK (
  (trigger_type IN ('stage_changed', 'process_stage_changed') AND trigger_stage IS NOT NULL)
  OR
  (trigger_type NOT IN ('stage_changed', 'process_stage_changed') AND trigger_stage IS NULL)
);

-- ============================================================
-- 4. action_type — duas ações novas, só usadas por regras de processo.
--    send_whatsapp é compartilhada sem alteração: a fila continua indexada por
--    candidate_id, e todo processo tem um candidato por trás (é dele o telefone).
-- ============================================================

ALTER TABLE automation_actions DROP CONSTRAINT automation_actions_action_type_check;
ALTER TABLE automation_actions ADD CONSTRAINT automation_actions_action_type_check CHECK (
  action_type IN (
    'change_stage', 'add_tag', 'remove_tag', 'change_due_date', 'change_assignee',
    'send_whatsapp', 'add_comment',
    'change_process_stage', 'add_timeline_note'
  )
);

-- ============================================================
-- 5. employee_processes: as duas colunas que os gatilhos periódicos exigem
-- ============================================================

-- Quando o processo entrou na etapa atual — sem isso não há como medir "parado
-- há X dias". Espelha candidates.stage_started_at (20260718000002).
-- Backfill com started_at: é a melhor aproximação disponível pro histórico, e
-- deixar NULL exigiria tratar o caso em toda consulta.
ALTER TABLE employee_processes ADD COLUMN stage_started_at timestamptz NOT NULL DEFAULT now();
UPDATE employee_processes SET stage_started_at = started_at;

-- Prazo manual do processo, equivalente a candidates.due_date.
ALTER TABLE employee_processes ADD COLUMN due_date date;

COMMENT ON COLUMN employee_processes.stage_started_at IS
  'Quando o processo entrou na etapa atual — base do gatilho process_stage_timeout. Mantida pelo trigger trg_employee_processes_stage_started_at.';
COMMENT ON COLUMN employee_processes.due_date IS
  'Prazo manual do processo, opcional. Uma das fontes de data do gatilho process_date_reached.';

CREATE OR REPLACE FUNCTION trg_employee_processes_stage_started_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
    NEW.stage_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_processes_stage_started_at
  BEFORE UPDATE ON employee_processes
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_processes_stage_started_at();

CREATE INDEX idx_employee_processes_stage_started_at ON employee_processes(stage_started_at);
CREATE INDEX idx_employee_processes_due_date ON employee_processes(due_date)
  WHERE due_date IS NOT NULL;

-- ============================================================
-- 6. automation_process_runs — idempotência dos gatilhos periódicos.
--
-- O RH resolve isso com uma coluna em candidates (due_date_reached_processed_at),
-- que só funciona porque lá existe um único gatilho por data. No DP várias
-- regras podem observar datas diferentes do mesmo processo, então a marcação
-- precisa ser por (regra, processo, data de referência).
-- ============================================================

CREATE TABLE automation_process_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  process_id    uuid NOT NULL REFERENCES employee_processes(id) ON DELETE CASCADE,
  -- Data que motivou o disparo (a data-alvo, ou o dia em que o timeout venceu).
  -- Junto do UNIQUE, é o que garante "uma vez por regra, por processo, por data".
  fired_for     date NOT NULL,
  fired_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, process_id, fired_for)
);

CREATE INDEX idx_automation_process_runs_process ON automation_process_runs(process_id);

COMMENT ON TABLE automation_process_runs IS
  'Marca que uma automação de processo já disparou pra um processo numa data de referência — evita repetição a cada rodada do cron.';

-- ============================================================
-- 7. Fila de WhatsApp: rastreio de qual processo originou a mensagem.
--    candidate_id continua NOT NULL e continua sendo a chave do envio.
-- ============================================================

ALTER TABLE automation_whatsapp_queue
  ADD COLUMN process_id uuid REFERENCES employee_processes(id) ON DELETE SET NULL;

COMMENT ON COLUMN automation_whatsapp_queue.process_id IS
  'Processo de DP que originou a mensagem, quando veio de uma automação de entity=''process''. Só rastreio — o envio usa candidate_id/phone_number.';

-- ============================================================
-- 8. RLS + GRANTs — mesmo gate do resto do motor (has_rh_access cobre admin,
--    can_manage_rh e o role administrativo).
-- ============================================================

ALTER TABLE automation_process_runs ENABLE ROW LEVEL SECURITY;

-- Só leitura pra authenticated (auditoria na tela); a escrita é feita pelas
-- funções SECURITY DEFINER do motor, mesmo padrão de automation_whatsapp_queue.
CREATE POLICY automation_process_runs_rh_read ON automation_process_runs
  FOR SELECT TO authenticated USING (has_rh_access());

GRANT SELECT ON automation_process_runs TO authenticated;
