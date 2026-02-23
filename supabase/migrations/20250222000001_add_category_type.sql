-- Add category_type field to catalog_products table
-- This categorizes products for the home page featured section

ALTER TABLE catalog_products
ADD COLUMN category_type TEXT CHECK (category_type IN ('alto_giro', 'maior_margem', 'recompra_alta')) DEFAULT NULL;

-- Create index for faster queries
CREATE INDEX idx_catalog_products_category_type ON catalog_products(category_type) WHERE category_type IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN catalog_products.category_type IS 'Product classification for home page featured products: alto_giro (high sales volume), maior_margem (highest profit margin), recompra_alta (high repeat purchases)';
