-- Contrato de Profissional Parceiro (contract_type 'prestacao_servico') —
-- liga o template real, confirmado lendo o Google Doc em 2026-08-22:
-- "Contrato Profissional Parceiro COM CAMPOS {{destacados}}".
--
-- O slot 'prestacao_servico' já existia no CHECK de employee_contracts e
-- contract_templates desde 20260722000004, mas sem template e com uma lista
-- de campos obrigatórios chutada (dados bancários, estado civil). O template
-- real desmente o chute: pede CNPJ e razão social do MEI, e não menciona
-- conta bancária em lugar nenhum (pagamento é fora do contrato).
--
-- 24 placeholders no total. Os que ainda não tinham casa no banco entram
-- aqui: os 6 do SALÃO (representante legal + contato) e a razão social do
-- profissional; os 2 percentuais comerciais vão pro cargo/vaga, seguindo o
-- padrão de snapshot que job_openings já usa pros outros campos descritivos.

-- ============================================================
-- 1. stores — representante legal + contato da unidade
--    {{representante_salao}}, {{cpf_representante_salao}},
--    {{rg_representante_salao}}, {{endereco_representante_salao}},
--    {{email_salao}}, {{telefone_salao}}
-- ============================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS representative_name text,
  ADD COLUMN IF NOT EXISTS representative_cpf text,
  ADD COLUMN IF NOT EXISTS representative_rg text,
  ADD COLUMN IF NOT EXISTS representative_address text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN stores.representative_name IS
  'Nome de quem assina pelo salão nos contratos gerados (placeholder {{representante_salao}}). Editável no modal "Dados das lojas".';
COMMENT ON COLUMN stores.representative_cpf IS
  'CPF do representante legal da unidade — só dígitos, formatado na geração do contrato.';
COMMENT ON COLUMN stores.representative_rg IS
  'RG do representante legal da unidade, como sai na cédula (não normalizado).';
COMMENT ON COLUMN stores.representative_address IS
  'Endereço residencial completo do representante legal (texto livre).';
COMMENT ON COLUMN stores.email IS
  'E-mail de contato da unidade usado no contrato de parceria ({{email_salao}}).';
COMMENT ON COLUMN stores.phone IS
  'Telefone/WhatsApp de contato da unidade ({{telefone_salao}}) — só dígitos, formatado na geração.';

-- ============================================================
-- 2. job_roles + job_openings — percentuais do contrato de parceria
--    {{percentual_retencao_salao}}, {{percentual_comissao_produtos}}
--
--    Colunas próprias, e não reaproveitamento de variable_percentage: essa
--    coluna é a remuneração variável mostrada na descrição pública da vaga
--    ("Até X% — base"), outro número e outro significado. Sem CHECK contra
--    compensation_type — os percentuais da parceria são independentes do
--    tipo de remuneração cadastrado no cargo.
-- ============================================================

ALTER TABLE job_roles
  ADD COLUMN IF NOT EXISTS partner_retention_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS product_commission_percentage numeric(5,2);

ALTER TABLE job_openings
  ADD COLUMN IF NOT EXISTS partner_retention_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS product_commission_percentage numeric(5,2);

ALTER TABLE job_roles DROP CONSTRAINT IF EXISTS job_roles_partner_percentages_range;
ALTER TABLE job_roles
  ADD CONSTRAINT job_roles_partner_percentages_range CHECK (
    (partner_retention_percentage IS NULL OR partner_retention_percentage BETWEEN 0 AND 100)
    AND (product_commission_percentage IS NULL OR product_commission_percentage BETWEEN 0 AND 100)
  );

ALTER TABLE job_openings DROP CONSTRAINT IF EXISTS job_openings_partner_percentages_range;
ALTER TABLE job_openings
  ADD CONSTRAINT job_openings_partner_percentages_range CHECK (
    (partner_retention_percentage IS NULL OR partner_retention_percentage BETWEEN 0 AND 100)
    AND (product_commission_percentage IS NULL OR product_commission_percentage BETWEEN 0 AND 100)
  );

COMMENT ON COLUMN job_roles.partner_retention_percentage IS
  'Percentual que o salão retém de cada serviço prestado pelo profissional parceiro (contrato de parceria, Lei 13.352/2016). Só relevante pra cargo MEI.';
COMMENT ON COLUMN job_roles.product_commission_percentage IS
  'Percentual de comissão do profissional parceiro sobre venda de produtos. Só relevante pra cargo MEI.';
COMMENT ON COLUMN job_openings.partner_retention_percentage IS
  'Snapshot de job_roles.partner_retention_percentage no momento da criação da vaga — é este valor que vai pro contrato gerado.';
COMMENT ON COLUMN job_openings.product_commission_percentage IS
  'Snapshot de job_roles.product_commission_percentage no momento da criação da vaga — é este valor que vai pro contrato gerado.';

-- ============================================================
-- 3. employee_contract_data — razão social do MEI
--    {{razao_social_profissional}}
--
--    Nullable com fallback pro nome do candidato na geração: no MEI a razão
--    social normalmente é o próprio nome civil, então exigir digitação
--    seria atrito puro na maioria dos casos.
-- ============================================================

ALTER TABLE employee_contract_data
  ADD COLUMN IF NOT EXISTS legal_name text;

COMMENT ON COLUMN employee_contract_data.legal_name IS
  'Razão social do MEI do profissional ({{razao_social_profissional}}). Vazio = usa o nome do candidato na geração do contrato.';

-- ============================================================
-- 4. contract_templates — liga o template de parceria
-- ============================================================

INSERT INTO contract_templates (contract_type, google_doc_id, is_active)
VALUES ('prestacao_servico', '1B2KQEG7BFI75tkrC4VhUkOV-dDu58kEn4KAT7y1MLcM', true)
ON CONFLICT (contract_type) DO UPDATE
  SET google_doc_id = EXCLUDED.google_doc_id,
      is_active = true,
      updated_at = now();
