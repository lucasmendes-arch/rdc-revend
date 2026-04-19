-- ============================================================
-- Teste: partner_order_webhook
-- Função testada: build_partner_order_payload, send_pending_partner_order_webhooks
-- Migration: 20260418000001 → 20260418000004
--
-- Pré-condições:
--   - Deve existir ao menos um pedido com customer_segment_snapshot = 'network_partner'
--   - pg_net ativo (extensão net)
--   - Webhook n8n acessível
--
-- Como executar:
--   Supabase Dashboard > SQL Editor
--   Rode cada bloco separadamente (selecione e execute)
--
-- Caminho feliz:
--   Bloco 1 → inspeciona payload (itens + separation_list com categoria)
--   Bloco 2 → reseta flag para permitir re-disparo
--   Bloco 3 → dispara webhook (se pedido dentro de 24h) ou direto (Bloco 3b)
--   Bloco 4 → confirma partner_webhook_sent_at preenchido
--   Bloco 5 → confirma HTTP 200 no pg_net
-- ============================================================


-- ── BLOCO 1: Inspecionar payload do pedido parceiro mais recente ─────────────
-- Verifica: campos order.customer, order.total, items com is_kit, separation_list com category_name

SELECT
  o.id,
  o.customer_name,
  o.created_at,
  o.partner_webhook_sent_at,
  jsonb_pretty(build_partner_order_payload(o.id)) AS payload
FROM orders o
WHERE o.customer_segment_snapshot = 'network_partner'
ORDER BY o.created_at DESC
LIMIT 1;


-- ── BLOCO 2: Resetar flag para permitir re-disparo ───────────────────────────
-- Necessário antes de rodar Bloco 3 ou 3b

UPDATE orders
SET partner_webhook_sent_at = NULL
WHERE id = (
  SELECT id FROM orders
  WHERE customer_segment_snapshot = 'network_partner'
  ORDER BY created_at DESC
  LIMIT 1
);


-- ── BLOCO 3: Disparar via função do pg_cron (pedidos das últimas 24h) ─────────
-- Retorna 0 se o pedido for mais antigo que 24h → use Bloco 3b

SELECT send_pending_partner_order_webhooks() AS pedidos_processados;


-- ── BLOCO 3b: Disparo direto por ID (bypassa janela de 24h) ──────────────────
-- Use quando Bloco 3 retornar 0. Substitua o UUID pelo id do Bloco 1.

/*
SELECT net.http_post(
  url     := 'https://n8n.srv1476439.hstgr.cloud/webhook/0a95acc2-c149-43a5-88bb-56801f707e44',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body    := build_partner_order_payload('cole-o-uuid-aqui')
);
*/


-- ── BLOCO 4: Verificar que partner_webhook_sent_at foi gravado ────────────────
-- Esperado: partner_webhook_sent_at NOT NULL no pedido disparado

SELECT id, customer_name, created_at, partner_webhook_sent_at
FROM orders
WHERE customer_segment_snapshot = 'network_partner'
ORDER BY created_at DESC
LIMIT 5;


-- ── BLOCO 5: Verificar HTTP response no pg_net ────────────────────────────────
-- Esperado: status_code = 200, error_msg = null

SELECT id, status_code, content_type, error_msg, created
FROM net._http_response
ORDER BY created DESC
LIMIT 5;


-- ── BLOCO 6: Verificar separation_list com categorias ────────────────────────
-- Esperado: todos os itens com category_name preenchido (não null)

SELECT
  item->>'category_name' AS categoria,
  item->>'product_name'  AS produto,
  item->>'qty'           AS qty
FROM (
  SELECT jsonb_array_elements(
    build_partner_order_payload(
      (SELECT id FROM orders WHERE customer_segment_snapshot = 'network_partner' ORDER BY created_at DESC LIMIT 1)
    )->'separation_list'
  ) AS item
) t
ORDER BY categoria, produto;
