-- Inventory table for stock control
CREATE TABLE public.inventory (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.catalog_products(id) on delete cascade,
  sku text,
  quantity int not null default 0,
  min_quantity int not null default 5,
  last_synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_inventory_product ON public.inventory(product_id);
CREATE INDEX idx_inventory_sku ON public.inventory(sku);
