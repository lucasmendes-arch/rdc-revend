-- Migration: 20260418000001_partner_order_webhook.sql
-- Dispara POST no webhook n8n sempre que um pedido de network_partner é criado.
-- Estratégia: pg_cron a cada minuto, garantindo que order_items já existem no momento do disparo.

-- 1. Coluna de controle para evitar disparo duplicado
ALTER TABLE orders ADD COLUMN IF NOT EXISTS partner_webhook_sent_at timestamptz DEFAULT NULL;

-- 2. Função que monta o payload com expansão de kits
CREATE OR REPLACE FUNCTION build_partner_order_payload(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_items  jsonb;
  v_sep    jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  -- Itens com flag is_kit e componentes expandidos
  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id',   oi.product_id,
      'product_name', oi.product_name_snapshot,
      'qty',          oi.qty,
      'unit_price',   oi.unit_price_snapshot,
      'line_total',   oi.line_total,
      'is_kit',       (EXISTS(SELECT 1 FROM kit_components kc WHERE kc.kit_product_id = oi.product_id)),
      'components',   COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'product_id',   kc.component_product_id,
          'product_name', cp2.name,
          'qty_per_kit',  kc.quantity,
          'total_qty',    kc.quantity * oi.qty
        ))
        FROM kit_components kc
        JOIN catalog_products cp2 ON cp2.id = kc.component_product_id
        WHERE kc.kit_product_id = oi.product_id),
        '[]'::jsonb
      )
    )
  ) INTO v_items
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  -- Lista de separação: kits desmembrados e consolidados por produto
  SELECT jsonb_agg(
    jsonb_build_object('product_name', product_name, 'qty', total_qty)
    ORDER BY product_name
  ) INTO v_sep
  FROM (
    SELECT product_name, SUM(total_qty) AS total_qty
    FROM (
      -- Produtos simples (não-kit)
      SELECT oi.product_name_snapshot AS product_name,
             oi.qty::numeric          AS total_qty
      FROM order_items oi
      WHERE oi.order_id = p_order_id
        AND NOT EXISTS (
          SELECT 1 FROM kit_components kc WHERE kc.kit_product_id = oi.product_id
        )
      UNION ALL
      -- Componentes de kit (qty multiplicada pelo pedido)
      SELECT cp2.name                          AS product_name,
             (kc.quantity * oi.qty)::numeric   AS total_qty
      FROM order_items oi
      JOIN kit_components kc  ON kc.kit_product_id = oi.product_id
      JOIN catalog_products cp2 ON cp2.id = kc.component_product_id
      WHERE oi.order_id = p_order_id
    ) raw
    GROUP BY product_name
  ) consolidated;

  RETURN jsonb_build_object(
    'event', 'partner_order_created',
    'order', jsonb_build_object(
      'id',              v_order.id,
      'created_at',      v_order.created_at,
      'status',          v_order.status,
      'total',           v_order.total,
      'subtotal',        v_order.subtotal,
      'discount_amount', v_order.discount_amount,
      'payment_method',  v_order.payment_method,
      'origin',          v_order.origin,
      'notes',           v_order.notes,
      'delivery_method', v_order.delivery_method,
      'customer', jsonb_build_object(
        'name',     v_order.customer_name,
        'whatsapp', v_order.customer_whatsapp,
        'email',    v_order.customer_email
      )
    ),
    'items',           COALESCE(v_items, '[]'::jsonb),
    'separation_list', COALESCE(v_sep,   '[]'::jsonb)
  );
END;
$$;

-- 3. Função processada pelo pg_cron: busca pedidos pendentes e dispara o webhook
CREATE OR REPLACE FUNCTION send_pending_partner_order_webhooks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_count  int := 0;
BEGIN
  FOR v_order IN
    SELECT o.*
    FROM orders o
    WHERE o.customer_segment_snapshot = 'network_partner'
      AND o.partner_webhook_sent_at IS NULL
      AND o.created_at > now() - interval '24 hours'
      AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
    ORDER BY o.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Marca como enviado antes do disparo para evitar duplicata em run concorrente
    UPDATE orders SET partner_webhook_sent_at = now() WHERE id = v_order.id;

    PERFORM net.http_post(
      url     := 'https://n8n.srv1476439.hstgr.cloud/webhook/0a95acc2-c149-43a5-88bb-56801f707e44',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := build_partner_order_payload(v_order.id)::text
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4. Agendamento pg_cron: a cada minuto
SELECT cron.schedule(
  'partner-order-webhook-notifier',
  '* * * * *',
  $$SELECT send_pending_partner_order_webhooks()$$
);
