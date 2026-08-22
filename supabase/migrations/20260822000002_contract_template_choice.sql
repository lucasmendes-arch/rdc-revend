-- Escolha do modelo base na geração do contrato.
--
-- Até aqui cada contract_type tinha exatamente um template (UNIQUE em
-- contract_templates.contract_type). O usuário vai precisar de vários
-- modelos base do contrato de parceria — outros salões, outras
-- especificidades — escolhidos na hora de contratar.
--
-- A lista de modelos NÃO vira cadastro no banco: são os Google Docs que
-- estiverem na mesma pasta do Drive onde já mora o template atual
-- (`list-contract-templates` descobre a pasta pelo parent do doc padrão, sem
-- secret novo). Jogar um doc na pasta basta pra ele aparecer no dropdown.
-- `contract_templates` continua como está, guardando qual é o **padrão** de
-- cada tipo — o que vem pré-selecionado.
--
-- O que falta é só o rastro: qual modelo gerou cada contrato assinado.
-- Sem isso, um template editado depois apaga a evidência de sob quais termos
-- a pessoa assinou.

ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS template_doc_id text,
  ADD COLUMN IF NOT EXISTS template_name text;

COMMENT ON COLUMN employee_contracts.template_doc_id IS
  'ID do Google Doc do modelo base usado nesta geração. NULL em contrato cadastrado à mão ou gerado antes de 20260822000002.';
COMMENT ON COLUMN employee_contracts.template_name IS
  'Nome do arquivo do modelo no momento da geração — snapshot legível, já que o arquivo pode ser renomeado ou removido do Drive depois.';
