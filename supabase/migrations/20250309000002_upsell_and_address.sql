-- ============================================================================
-- 1. Upsell offers table
-- ============================================================================

CREATE TABLE public.upsell_offers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  discounted_price numeric(10,2) NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.upsell_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_active_upsell" ON public.upsell_offers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_write_upsell" ON public.upsell_offers
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 2. Add address fields to profiles for checkout pre-fill
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_cep text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text;
