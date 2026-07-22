-- Remove a etapa 'sem_contratacao' do funil de candidatos — pedido do
-- usuário pra simplificar o kanban (etapa raramente usada, redundante com
-- 'descartado'). Confirmado antes de aplicar: nenhuma linha em candidates
-- nem em automations.trigger_stage referencia 'sem_contratacao' hoje
-- (verificado via supabase db query --linked em 2026-07-22), então não há
-- necessidade de migrar dado nenhum.
--
-- 'contratado' continua existindo no banco (candidates.stage,
-- automations.trigger_stage) — só deixou de ser uma coluna/opção manual no
-- kanban do frontend (Candidatos.tsx). É a promoção pro DP
-- (promote_candidate_to_dp) que grava esse valor, nunca uma escolha manual
-- de etapa.

ALTER TABLE candidates DROP CONSTRAINT candidates_stage_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_stage_check CHECK (stage IN (
  'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
  'decisao_necessaria', 'selecionado', 'em_formacao', 'em_contratacao',
  'contratado', 'concluido_arquivado', 'descartado', 'banco_de_talentos'
));

ALTER TABLE automations DROP CONSTRAINT automations_trigger_stage_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_stage_check CHECK (trigger_stage IN (
  'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
  'decisao_necessaria', 'selecionado', 'em_formacao', 'em_contratacao',
  'contratado', 'concluido_arquivado', 'descartado', 'banco_de_talentos'
));
