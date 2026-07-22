-- Geração automática de contratos (DP) — schema de suporte.
-- Traz pra dentro do app o que hoje é feito por uma automação externa (Make):
-- copiar um template do Google Docs, preencher com dados do colaborador e
-- exportar como PDF. RLS reaproveita has_rh_access()/is_admin() já existentes.

-- ============================================================
-- employee_contract_data — dados pessoais necessários pro corpo do contrato
-- (CPF, RG, endereço etc.) que não existem em `candidates` nem em
-- `employee_processes`. 1:1 com o processo, mesmo padrão de cascade de
-- employee_documents/employee_contracts. Campos são um ponto de partida —
-- sujeitos a ajuste assim que os templates reais forem revisados.
-- ============================================================

CREATE TABLE employee_contract_data (
  process_id uuid PRIMARY KEY REFERENCES employee_processes(id) ON DELETE CASCADE,
  cpf text,
  rg text,
  birth_date date,
  marital_status text,
  nationality text NOT NULL DEFAULT 'brasileira',
  address text,
  bank_name text,
  bank_agency text,
  bank_account text,
  pix_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION trg_employee_contract_data_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_contract_data_set_updated_at
  BEFORE UPDATE ON employee_contract_data
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_contract_data_set_updated_at();

ALTER TABLE employee_contract_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_contract_data_rh_access ON employee_contract_data
  FOR ALL TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_contract_data TO authenticated;

-- ============================================================
-- contract_templates — mapeia contract_type -> documento template no Drive.
-- Editável sem precisar de deploy da edge function. Escrita restrita a admin
-- (config sensível, mesmo padrão de store_whatsapp_credentials); leitura
-- liberada pra todo o RH via has_rh_access().
-- ============================================================

CREATE TABLE contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type text NOT NULL UNIQUE CHECK (contract_type IN ('formacao', 'prestacao_servico', 'clt')),
  google_doc_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER contract_templates_set_updated_at
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION trg_employee_contract_data_set_updated_at();

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_templates_rh_read ON contract_templates
  FOR SELECT TO authenticated
  USING (has_rh_access());

CREATE POLICY contract_templates_admin_write ON contract_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY contract_templates_admin_update ON contract_templates
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY contract_templates_admin_delete ON contract_templates
  FOR DELETE TO authenticated
  USING (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON contract_templates TO authenticated;

-- ============================================================
-- Bucket privado pro PDF final gerado. Sem policies extras em storage.objects
-- pra authenticated/anon: RLS do Storage já bloqueia tudo por padrão, só
-- service_role (edge functions) lê/escreve — mesmo efeito de "privado" que
-- o bucket commission-reports já tem hoje. Acesso de leitura pela UI é via
-- signed URL de curta duração, mintada sob demanda pela edge function
-- get-contract-url.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-contracts', 'employee-contracts', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- employee_contracts.file_url muda de semântica quando o contrato é gerado
-- automaticamente: passa a guardar o caminho do objeto no bucket
-- employee-contracts (ex: "<process_id>/<uuid>.pdf"), não uma URL final —
-- a URL assinada é mintada sob demanda. Contratos cadastrados manualmente
-- (fluxo antigo do modal) continuam sem file_url, sem mudança de schema.
-- ============================================================

COMMENT ON COLUMN employee_contracts.file_url IS
  'Quando gerado automaticamente (ver contract_templates/generate-contract): caminho do objeto no bucket privado employee-contracts, não uma URL final. Signed URL mintada sob demanda pela edge function get-contract-url.';
