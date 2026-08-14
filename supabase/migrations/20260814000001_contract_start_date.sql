-- Data de início do contrato de formação, informada por quem contrata.
--
-- Até agora a geração automática assumia `hoje` como início do curso
-- (generate-contract-automation calculava todayISO() internamente, +10 dias
-- pro fim). Contrato feito com atraso — o caso real que motivou isto — saía
-- com a vigência errada, sem nenhuma forma de corrigir pelo fluxo automático:
-- só o caminho manual (/admin/dp/contratos) aceitava datas.
--
-- Nullable de propósito: quando não informada, a edge function continua caindo
-- no comportamento antigo (hoje + 10 dias), então processos criados antes desta
-- coluna e o caminho manual seguem funcionando sem mudança.

ALTER TABLE employee_contract_data ADD COLUMN contract_start_date date;

COMMENT ON COLUMN employee_contract_data.contract_start_date IS
  'Início da vigência do contrato de formação, informado na contratação. Também vira a data de assinatura no documento ({{dia/mes/ano_assinatura}}) — contrato retroativo é assinado na data de início, não na data em que o sistema gerou o arquivo. NULL = edge function usa hoje.';
