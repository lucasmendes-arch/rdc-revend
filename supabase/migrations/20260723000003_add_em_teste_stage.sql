-- Adiciona a etapa 'em_teste' ao funil de candidatos, logo depois de
-- 'selecionado' — candidato aprovado que está no período de teste antes da
-- contratação efetiva. Não substitui nenhuma etapa existente.
--
-- Constraints atuais conferidas antes de aplicar (pg_get_constraintdef em
-- 2026-07-23): ambas com os mesmos 10 valores listados abaixo, sem
-- 'em_formacao'/'em_contratacao'/'sem_contratacao' (removidos em
-- 20260722000002/20260722000003). Como só estamos ampliando a lista, nenhuma
-- linha existente de candidates/automations pode violar o novo CHECK.

ALTER TABLE candidates DROP CONSTRAINT candidates_stage_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_stage_check CHECK (stage IN (
  'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
  'decisao_necessaria', 'selecionado', 'em_teste', 'contratado',
  'concluido_arquivado', 'descartado', 'banco_de_talentos'
));

ALTER TABLE automations DROP CONSTRAINT automations_trigger_stage_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_stage_check CHECK (trigger_stage IN (
  'pendente', 'conversa_iniciada', 'entrevista_marcada', 'no_show',
  'decisao_necessaria', 'selecionado', 'em_teste', 'contratado',
  'concluido_arquivado', 'descartado', 'banco_de_talentos'
));
