-- Add is_highlight column to catalog_products table
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS is_highlight BOOLEAN NOT NULL DEFAULT false;

-- Ensure the column exists before doing anything else
COMMENT ON COLUMN catalog_products.is_highlight IS 'Feature flag to mark product as highlighted on the Highlights section';
