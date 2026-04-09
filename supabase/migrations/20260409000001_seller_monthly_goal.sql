-- Add individual monthly sales goal per seller
ALTER TABLE public.sellers
ADD COLUMN IF NOT EXISTS monthly_goal numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sellers.monthly_goal IS 'Meta mensal individual do vendedor (0 = sem meta definida).';
