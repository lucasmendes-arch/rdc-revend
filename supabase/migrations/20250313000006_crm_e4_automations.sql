-- ============================================================================
-- CRM Etapa 4 P1 — Automacoes Operacionais
--
-- 1. Atualiza template de recuperacao de carrinho (mais natural, B2B)
-- 2. Adiciona automacao: Boas-vindas ao novo cliente (apos 1a compra)
-- 3. Adiciona automacao: Fidelizacao cliente recorrente (2a+ compra)
-- ============================================================================


-- ============================================================================
-- 1. Atualizar template de recuperacao de carrinho
-- ============================================================================

UPDATE public.crm_automations
SET action_config = jsonb_set(
  action_config,
  '{template}',
  '"Oi {nome}! 🛒 Notamos que você deixou produtos no carrinho da Rei dos Cachos. Posso te ajudar a finalizar o pedido? Temos ótimas condições para atacado!"'::jsonb
)
WHERE name = 'CRM: Recuperacao Carrinho (tag)';


-- ============================================================================
-- 2. Automacao: Boas-vindas ao novo cliente (apos 1a compra confirmada)
--    Trigger: tag 'novo-cliente' atribuida (via motor de tags no purchase_completed)
--    is_active = false: ativar apos validar template com a equipe
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
  'CRM: Boas-vindas Novo Cliente',
  'tag_added',
  '{"tag_slug": "novo-cliente"}'::jsonb,
  'send_whatsapp',
  jsonb_build_object(
    'template', 'Oi {nome}! 🎉 Seja bem-vindo à família Rei dos Cachos! Seu primeiro pedido foi confirmado com sucesso. Qualquer dúvida sobre os produtos ou próximos pedidos, pode contar comigo!',
    'phone_field', 'phone',
    'delay_minutes', 0
  ),
  'whatsapp',
  false
)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 3. Automacao: Fidelizacao cliente recorrente (2a+ compra)
--    Trigger: tag 'recorrente' atribuida
--    is_active = false: ativar apos validar template com a equipe
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
  'CRM: Fidelizacao Cliente Recorrente',
  'tag_added',
  '{"tag_slug": "recorrente"}'::jsonb,
  'send_whatsapp',
  jsonb_build_object(
    'template', 'Oi {nome}! 🌟 Que bom ter você de volta na Rei dos Cachos! Como cliente fiel, você tem acesso prioritário às nossas novidades. Quer ver as últimas chegadas?',
    'phone_field', 'phone',
    'delay_minutes', 0
  ),
  'whatsapp',
  false
)
ON CONFLICT DO NOTHING;
