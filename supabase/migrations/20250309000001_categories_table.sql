-- ============================================================================
-- Categories table + relationship with catalog_products
-- ============================================================================

-- 1. Create categories table
CREATE TABLE public.categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- RLS: anyone authenticated can read categories
CREATE POLICY "authenticated_read_categories" ON public.categories
  FOR SELECT USING (auth.role() = 'authenticated');

-- RLS: admin write (insert/update/delete) — validated at app level
CREATE POLICY "admin_write_categories" ON public.categories
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 2. Add category_id FK to catalog_products
ALTER TABLE public.catalog_products
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX idx_catalog_products_category ON public.catalog_products(category_id);

-- 3. Seed initial categories
INSERT INTO public.categories (name, slug, sort_order) VALUES
  ('Kits',         'kits',         1),
  ('Ativador',     'ativador',     2),
  ('Mascara',      'mascara',      3),
  ('Shampoo',      'shampoo',      4),
  ('Finalizador',  'finalizador',  5),
  ('Tonalizante',  'tonalizante',  6);

-- 4. Auto-assign existing products to categories based on name keywords
UPDATE public.catalog_products SET category_id = (SELECT id FROM public.categories WHERE slug = 'kits')
WHERE LOWER(name) LIKE '%kit%' AND category_id IS NULL;

UPDATE public.catalog_products SET category_id = (SELECT id FROM public.categories WHERE slug = 'ativador')
WHERE (LOWER(name) LIKE '%ativador%' OR LOWER(name) LIKE '%ativa%') AND category_id IS NULL;

UPDATE public.catalog_products SET category_id = (SELECT id FROM public.categories WHERE slug = 'mascara')
WHERE (LOWER(name) LIKE '%máscara%' OR LOWER(name) LIKE '%mascara%' OR LOWER(name) LIKE '%hidratação%') AND category_id IS NULL;

UPDATE public.catalog_products SET category_id = (SELECT id FROM public.categories WHERE slug = 'shampoo')
WHERE (LOWER(name) LIKE '%shampoo%' OR LOWER(name) LIKE '%xampu%') AND category_id IS NULL;

UPDATE public.catalog_products SET category_id = (SELECT id FROM public.categories WHERE slug = 'finalizador')
WHERE (LOWER(name) LIKE '%finalizador%' OR LOWER(name) LIKE '%leave-in%' OR LOWER(name) LIKE '%sérum%' OR LOWER(name) LIKE '%óleo%') AND category_id IS NULL;

UPDATE public.catalog_products SET category_id = (SELECT id FROM public.categories WHERE slug = 'tonalizante')
WHERE (LOWER(name) LIKE '%tonalizante%' OR LOWER(name) LIKE '%tônico%' OR LOWER(name) LIKE '%matiz%') AND category_id IS NULL;
