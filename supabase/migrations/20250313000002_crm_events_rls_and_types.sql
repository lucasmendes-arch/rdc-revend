-- ============================================================================
-- CRM Etapa 2 — Fix RLS + Expand event_type constraint
--
-- Problema 1: crm_events só tinha policy admin → frontend não conseguia inserir
-- Problema 2: constraint não incluía event_types usados no TypeScript
-- ============================================================================

-- ============================================================================
-- 1. Expandir o CHECK constraint de event_type
--    O nome auto-gerado pelo PostgreSQL é crm_events_event_type_check
-- ============================================================================

ALTER TABLE public.crm_events
  DROP CONSTRAINT IF EXISTS crm_events_event_type_check;

ALTER TABLE public.crm_events
  ADD CONSTRAINT crm_events_event_type_check CHECK (event_type IN (
    -- Funnel status (alinhado com client_sessions)
    'visitou',
    'visualizou_produto',
    'adicionou_carrinho',
    'iniciou_checkout',
    'comprou',
    'abandonou',
    -- Lifecycle events (usados no TypeScript + webhook)
    'user_registered',
    'purchase_completed',
    'cart_abandoned',
    'checkout_abandoned',
    'order_created',
    'tag_added',
    'inactivity_detected'
  ));

-- ============================================================================
-- 2. Policy INSERT para usuários autenticados
--    Usuário só pode inserir eventos com seu próprio user_id
-- ============================================================================

CREATE POLICY "auth_insert_own_crm_event" ON public.crm_events
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Nota: leitura dos próprios eventos não é necessária no frontend desta etapa.
-- Admin lê tudo via policy existente "admin_manage_crm_events" (FOR ALL).
