-- Distrato do Contrato de Parceria (contract_type 'distrato') — gerado ao
-- encerrar o vínculo de um profissional MEI na tela de Parceiros.
--
-- Template confirmado lendo o Google Doc em 2026-08-25:
-- "Distrato Contrato Parceria - COM CAMPOS {{destacados}}", que vive numa
-- pasta PRÓPRIA do Drive ("Modelo Distrato de Profissionais") — separada da
-- pasta do contrato de parceria. Isso já basta pro mecanismo de modelos base
-- (list-contract-templates descobre a pasta pelo parent do doc padrão de cada
-- tipo): novos modelos de distrato entram jogando o doc naquela pasta.
--
-- 13 placeholders, todos com origem no banco — nenhuma coluna nova é
-- necessária. Diferente do contrato de parceria, o distrato NÃO qualifica o
-- parceiro como pessoa física completa (sem nacionalidade/estado civil) nem
-- pede RG/e-mail do representante: só razão social + CNPJ + endereço + CPF
-- dos dois lados, a data do contrato que está sendo desfeito e a assinatura.

ALTER TABLE employee_contracts DROP CONSTRAINT IF EXISTS employee_contracts_contract_type_check;
ALTER TABLE employee_contracts ADD CONSTRAINT employee_contracts_contract_type_check
  CHECK (contract_type IN ('formacao', 'prestacao_servico', 'clt', 'desligamento_formacao', 'distrato'));

ALTER TABLE contract_templates DROP CONSTRAINT IF EXISTS contract_templates_contract_type_check;
ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_contract_type_check
  CHECK (contract_type IN ('formacao', 'prestacao_servico', 'clt', 'desligamento_formacao', 'distrato'));

INSERT INTO contract_templates (contract_type, google_doc_id, is_active)
VALUES ('distrato', '1t3rWTJNFfR9kKeimb6kctwTgeSNDkuaiuEd_N01_C94', true)
ON CONFLICT (contract_type) DO UPDATE
  SET google_doc_id = EXCLUDED.google_doc_id,
      is_active = true,
      updated_at = now();
