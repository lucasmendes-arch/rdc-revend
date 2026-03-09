-- ============================================================================
-- CRM Etapa 3 P3 — Setup do Dispatcher
--
-- 1. Corrige phone_field nas automacoes (seeds usavam 'customer_whatsapp'
--    que nao existe em profiles; campo correto e 'phone')
-- 2. Adiciona automacao de exemplo com trigger_type='tag_added' para
--    validar o fluxo completo: tag atribuida → dispatcher → UAZAPI
-- ============================================================================


-- ============================================================================
-- 1. Corrigir phone_field nas automacoes existentes
-- ============================================================================

UPDATE public.crm_automations
SET action_config = action_config || '{"phone_field": "phone"}'::jsonb
WHERE action_config->>'phone_field' = 'customer_whatsapp'
   OR action_config->>'phone_field' IS NULL;


-- ============================================================================
-- 2. Automacao de exemplo: tag_added → abandonou-carrinho
--    is_active = false: admin ativa manualmente apos validar o dispatcher.
--    Serve como template para novas automacoes tag-based.
-- ============================================================================

INSERT INTO public.crm_automations (
  name,
  trigger_type,
  trigger_conditions,
  action_type,
  action_config,
  channel,
  is_active
)
VALUES (
  'CRM: Recuperacao Carrinho (tag)',
  'tag_added',
  '{"tag_slug": "abandonou-carrinho"}'::jsonb,
  'send_whatsapp',
  '{
    "template": "Oi {nome}! Vimos que voce deixou produtos no carrinho da Rei dos Cachos. Posso te ajudar a finalizar o pedido? 😊",
    "phone_field": "phone",
    "delay_minutes": 0
  }'::jsonb,
  'whatsapp',
  false
)
ON CONFLICT DO NOTHING;
