-- Remove as etapas 'em_formacao' e 'em_contratacao' do funil de candidatos —
-- pedido do usuário pra simplificar o kanban, mantendo só 'contratado' como
-- saída (que já funciona como gatilho de promoção pro DP, não uma etapa
-- manual comum). Confirmado antes de aplicar: nenhuma linha em candidates
-- nem em automations.trigger_stage referencia essas duas etapas hoje
-- (verificado via supabase db query --linked em 2026-07-22).

ALTER TABLE candidates DROP CONSTRAINT candidates_stage_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_stage_check CHECK (stage IN (
  'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
  'decisao_necessaria', 'selecionado', 'contratado', 'concluido_arquivado',
  'descartado', 'banco_de_talentos'
));

ALTER TABLE automations DROP CONSTRAINT automations_trigger_stage_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_stage_check CHECK (trigger_stage IN (
  'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
  'decisao_necessaria', 'selecionado', 'contratado', 'concluido_arquivado',
  'descartado', 'banco_de_talentos'
));
