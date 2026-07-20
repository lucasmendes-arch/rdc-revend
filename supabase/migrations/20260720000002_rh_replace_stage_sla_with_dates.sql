-- Remove stage_sla_days (config de dias por etapa, calculada a partir de
-- stage_started_at) — não refletia a realidade do processo seletivo. No
-- lugar, o candidato passa a ter datas próprias (início/fim) definidas
-- manualmente pelo operador no card, mesmo padrão já usado por due_date.

DROP TABLE IF EXISTS stage_sla_days;
DROP FUNCTION IF EXISTS trg_stage_sla_days_set_updated_at();

-- start_date = "data início" (informativo, sem automação atrelada).
-- due_date já existe e passa a ser tratado como "data fim" na UI — mantido
-- com esse nome de coluna porque o motor de automações (Fase 3) já referencia
-- due_date/change_due_date/due_date_reached; renomear quebraria isso.
ALTER TABLE candidates ADD COLUMN start_date date;
