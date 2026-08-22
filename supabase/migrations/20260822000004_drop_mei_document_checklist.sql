-- Remove o checklist de documentos dos processos MEI.
--
-- `20260724000004` transformou os 4 itens de checklist do MEI (`rg_cpf`,
-- `comprovante_residencia`, `cnpj_ccmei`, `dados_bancarios`) em campos de
-- texto de `employee_contract_data` — mas só parou de criar itens novos: as
-- linhas já existentes ficaram no banco. Resultado prático: a aba Documentos
-- do card MEI mostra um "Checklist de documentos" pedindo exatamente o dado
-- que aparece preenchido logo acima, como campo.
--
-- Aqui elas somem de vez. O checklist do CLT (ctps, pis_pasep,
-- titulo_eleitor, comprovante_escolaridade, aso_admissional) continua
-- intacto — lá os itens seguem valendo.
--
-- Um item tinha anexo (CNPJ/CCMEI de um processo, PDF no R2): apagado junto,
-- por decisão explícita do usuário em 2026-08-22. O arquivo continua no R2,
-- só perde a referência no banco; o dado que ele comprovava (o CNPJ) já está
-- em employee_contract_data.cnpj.

DELETE FROM employee_documents d
USING employee_processes p
WHERE p.id = d.process_id
  AND p.employment_type = 'mei';
