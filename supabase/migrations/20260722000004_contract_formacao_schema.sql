-- Contrato de Formação + Desligamento — schema real, a partir dos 2 Google
-- Docs efetivamente usados (não mais o chute inicial de 20260722000001).
-- Ver contexto completo no plano da feature.

-- ============================================================
-- stores: dados jurídicos da "INSTITUIDORA" no contrato — mudam por
-- unidade (confirmado com o usuário, não é um dado único da empresa).
-- Nullable: valores reais preenchidos depois, direto no banco.
-- ============================================================

ALTER TABLE stores ADD COLUMN legal_name text;
ALTER TABLE stores ADD COLUMN cnpj text;
ALTER TABLE stores ADD COLUMN legal_address text;

COMMENT ON COLUMN stores.legal_name IS 'Razão social da unidade — placeholder {{razao_social}} nos contratos gerados.';
COMMENT ON COLUMN stores.cnpj IS 'CNPJ da unidade — placeholder {{cnpj}} nos contratos gerados.';
COMMENT ON COLUMN stores.legal_address IS 'Endereço da unidade — placeholder {{endereco}} nos contratos gerados.';

-- ============================================================
-- profiles.whatsapp_number — número de WhatsApp de quem pode ser
-- "responsável" por um candidato (candidates.assignee_id), usado pra
-- notificar quando um contrato é gerado automaticamente. Distinto de
-- auth_phone (login de parceiros de rede) — semântica diferente.
-- ============================================================

ALTER TABLE profiles ADD COLUMN whatsapp_number text;

COMMENT ON COLUMN profiles.whatsapp_number IS
  'WhatsApp de contato interno (ex: notificação de contrato gerado quando o usuário é responsável por um candidato) — não confundir com auth_phone (login de parceiros).';

CREATE OR REPLACE FUNCTION public.admin_set_user_whatsapp(
  p_user_id uuid,
  p_whatsapp text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.profiles
     SET whatsapp_number = NULLIF(TRIM(p_whatsapp), '')
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado: %', p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_whatsapp(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_whatsapp(uuid, text) TO authenticated;

-- Mesma função de sempre (20260720000001_administrativo_role.sql), só
-- acrescentando whatsapp_number no retorno. Postgres não permite
-- CREATE OR REPLACE mudando o shape de RETURNS TABLE — precisa dropar antes.
DROP FUNCTION IF EXISTS public.get_system_users();

CREATE OR REPLACE FUNCTION public.get_system_users()
RETURNS TABLE (
  id              uuid,
  role            text,
  full_name       text,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  permissions     jsonb,
  store_id        uuid,
  store_name      text,
  whatsapp_number text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.role,
    p.full_name,
    u.email,
    p.created_at,
    u.last_sign_in_at,
    p.permissions,
    p.store_id,
    s.name,
    p.whatsapp_number
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.role IN ('admin', 'salao', 'administrativo')
  ORDER BY p.role ASC, p.created_at DESC;
$$;

-- ============================================================
-- employee_contract_data.email — exigido pelo Contrato de Formação
-- ({{email}}), não existia em lugar nenhum do sistema até agora.
-- ============================================================

ALTER TABLE employee_contract_data ADD COLUMN email text;

-- ============================================================
-- Novo contract_type: 'desligamento_formacao' — comunicação de
-- desligamento do curso, dispara quando o candidato sai durante a etapa
-- de formação (ver trigger em 20260722000005).
-- ============================================================

-- Nome real do constraint herdado de antes do rename pra inglês
-- (colaboradores_contratos → employee_contracts, 20260718000013) — RENAME
-- COLUMN/TABLE não renomeia constraints automaticamente.
ALTER TABLE employee_contracts DROP CONSTRAINT colaboradores_contratos_tipo_contrato_check;
ALTER TABLE employee_contracts ADD CONSTRAINT employee_contracts_contract_type_check
  CHECK (contract_type IN ('formacao', 'prestacao_servico', 'clt', 'desligamento_formacao'));

ALTER TABLE contract_templates DROP CONSTRAINT contract_templates_contract_type_check;
ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_contract_type_check
  CHECK (contract_type IN ('formacao', 'prestacao_servico', 'clt', 'desligamento_formacao'));

-- ============================================================
-- Templates reais confirmados nesta sessão (lidos direto do Google Drive) —
-- substituem a linha placeholder de 20260722000001.
-- ============================================================

INSERT INTO contract_templates (contract_type, google_doc_id)
VALUES
  ('formacao', '1AEyNSRJKT3-XakLcew5gj-1IYS2XggaInFPEOBj7ozY'),
  ('desligamento_formacao', '1aG1sn90RSFLOBzOU8lajvhs3EWx6OqFm63ALWlmfCo0')
ON CONFLICT (contract_type) DO UPDATE SET google_doc_id = EXCLUDED.google_doc_id, updated_at = now();
