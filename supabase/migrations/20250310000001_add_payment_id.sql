-- Add payment_id column for AbacatePay billing ID matching
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id text;

-- Index for webhook lookups by payment_id
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders (payment_id) WHERE payment_id IS NOT NULL;
