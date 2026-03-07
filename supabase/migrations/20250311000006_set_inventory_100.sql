-- Create inventory records for all active products that don't have one
INSERT INTO inventory (product_id, quantity, min_quantity)
SELECT id, 100, 5
FROM catalog_products
WHERE is_active = true
  AND id NOT IN (SELECT product_id FROM inventory)
ON CONFLICT (product_id) DO NOTHING;

-- Set all existing inventory to 100
UPDATE inventory SET quantity = 100, updated_at = now()
WHERE product_id IN (SELECT id FROM catalog_products WHERE is_active = true);
