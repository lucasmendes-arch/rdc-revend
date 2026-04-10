-- Add sort_order to catalog_products for manual ordering within categories
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Index for fast ordering queries
CREATE INDEX IF NOT EXISTS idx_catalog_products_sort_order
  ON catalog_products (category_id, sort_order);

-- Seed: assign sort_order based on current updated_at DESC per category
-- so existing products get a stable initial order
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY category_id
           ORDER BY updated_at DESC
         ) - 1 AS rn
  FROM catalog_products
)
UPDATE catalog_products cp
SET sort_order = ranked.rn
FROM ranked
WHERE cp.id = ranked.id;
