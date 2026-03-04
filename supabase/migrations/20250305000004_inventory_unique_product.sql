-- Add unique constraint on product_id for upsert support
ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_id_unique UNIQUE (product_id);
