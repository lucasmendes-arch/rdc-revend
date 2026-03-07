-- Kit components: maps a kit product to its individual component products
CREATE TABLE IF NOT EXISTS public.kit_components (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_product_id uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(kit_product_id, component_product_id)
);

CREATE INDEX idx_kit_components_kit ON public.kit_components(kit_product_id);

-- RLS: authenticated users can read, write handled by app/edge functions
ALTER TABLE public.kit_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_kit_components" ON public.kit_components
  FOR ALL USING (auth.role() = 'authenticated');
