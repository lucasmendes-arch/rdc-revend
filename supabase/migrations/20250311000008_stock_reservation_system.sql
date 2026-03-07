-- 1. Function to restore stock for a single order (resolves kit components)
CREATE OR REPLACE FUNCTION restore_order_stock(p_order_id uuid)
RETURNS void AS $$
BEGIN
  -- For kit items: increment component stock
  UPDATE inventory
  SET quantity = inventory.quantity + (oi.qty * kc.quantity)
  FROM order_items oi
  JOIN kit_components kc ON kc.kit_product_id = oi.product_id
  WHERE inventory.product_id = kc.component_product_id
    AND oi.order_id = p_order_id;

  -- For non-kit items: increment directly
  UPDATE inventory
  SET quantity = inventory.quantity + oi.qty
  FROM order_items oi
  WHERE inventory.product_id = oi.product_id
    AND oi.order_id = p_order_id
    AND NOT EXISTS (
      SELECT 1 FROM kit_components WHERE kit_product_id = oi.product_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to release expired orders (aguardando_pagamento > 1 hour)
CREATE OR REPLACE FUNCTION release_expired_orders()
RETURNS integer AS $$
DECLARE
  expired_order RECORD;
  released_count integer := 0;
BEGIN
  FOR expired_order IN
    SELECT id FROM orders
    WHERE status = 'aguardando_pagamento'
      AND created_at < NOW() - INTERVAL '1 hour'
  LOOP
    PERFORM restore_order_stock(expired_order.id);
    UPDATE orders SET status = 'expirado' WHERE id = expired_order.id;
    released_count := released_count + 1;
  END LOOP;

  IF released_count > 0 THEN
    RAISE NOTICE 'Released % expired orders', released_count;
  END IF;

  RETURN released_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Enable pg_cron and schedule every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'release-expired-orders',
  '*/5 * * * *',
  'SELECT release_expired_orders()'
);
