-- ============================================================================
-- lead_status — enum canônico via CHECK constraint
--
-- Contexto: profiles.lead_status era text livre sem constraint.
-- Este enum representa a máquina de estados do lead para o n8n como
-- orquestrador. Ver docs/LEAD_STATUS_CANONICAL_MODEL.md.
--
-- Estados:
--   novo        → registrou, sem contato ainda
--   em_contato  → sequência ativa no n8n ou contato humano em andamento
--   qualificado → demonstrou interesse explícito
--   convertido  → primeira compra confirmada
--   recorrente  → segunda compra ou mais
--   inativo     → sem interação após período configurável
--   opt_out     → solicitou não receber comunicações (irreversível)
--
-- Plano seguro:
--   1. Migrar NULL → 'novo' (todos os registros terão valor antes do CHECK)
--   2. Verificar ausência de valores fora do enum
--   3. Adicionar CHECK constraint
--   4. Adicionar DEFAULT 'novo' e INDEX para queries do n8n/admin
-- ============================================================================

-- PASSO 1: Migrar NULL → 'novo'
UPDATE public.profiles
SET lead_status = 'novo'
WHERE lead_status IS NULL;

-- PASSO 2: Normalizar qualquer alias que possa existir (precaução)
UPDATE public.profiles
SET lead_status = 'em_contato'
WHERE lead_status IN ('em-contato', 'em contato', 'emcontato');

-- PASSO 3: CHECK constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_lead_status_check
  CHECK (lead_status IN (
    'novo',
    'em_contato',
    'qualificado',
    'convertido',
    'recorrente',
    'inativo',
    'opt_out'
  ));

-- PASSO 4: DEFAULT explícito (evita NULL em novos registros)
ALTER TABLE public.profiles
  ALTER COLUMN lead_status SET DEFAULT 'novo';

-- PASSO 5: INDEX para queries frequentes do n8n e do admin
CREATE INDEX IF NOT EXISTS idx_profiles_lead_status
  ON public.profiles (lead_status);

-- PASSO 6: INDEX composto para fila de trabalho do admin (status + seller)
CREATE INDEX IF NOT EXISTS idx_profiles_lead_status_seller
  ON public.profiles (lead_status, assigned_seller_id)
  WHERE lead_status IN ('novo', 'em_contato', 'qualificado');
