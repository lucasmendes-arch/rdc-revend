-- Fix: corrige schema pg_net → net (correto no Supabase hosted)

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
