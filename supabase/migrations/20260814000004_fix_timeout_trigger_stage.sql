-- Corrige automations_trigger_stage_required, que 20260814000002 deixou
-- restritivo demais: o CHECK só admitia trigger_stage nos dois gatilhos de
-- mudança de etapa, e proibia em todo o resto. Mas process_stage_timeout
-- ("parado há N dias na etapa X") precisa dizer QUAL etapa — criar uma regra
-- desse tipo falhava com violação de constraint.
--
-- Ali o campo é opcional, não obrigatório: dispatch_process_timeout_automations
-- já trata trigger_stage NULL como "qualquer etapa" (a regra vale pro processo
-- parado em qualquer lugar do kanban).

ALTER TABLE automations DROP CONSTRAINT automations_trigger_stage_required;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_stage_required CHECK (
  -- Obrigatório: a regra é "entrou NA etapa X".
  (trigger_type IN ('stage_changed', 'process_stage_changed') AND trigger_stage IS NOT NULL)
  OR
  -- Opcional: NULL = parado em qualquer etapa.
  (trigger_type = 'process_stage_timeout')
  OR
  -- Proibido: gatilhos que não têm etapa nenhuma como referência.
  (trigger_type IN ('candidate_created', 'due_date_reached', 'process_date_reached')
   AND trigger_stage IS NULL)
);
