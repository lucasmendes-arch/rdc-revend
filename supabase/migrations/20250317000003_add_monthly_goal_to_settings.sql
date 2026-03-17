-- Add monthly_revenue_goal to store_settings
ALTER TABLE public.store_settings 
ADD COLUMN IF NOT EXISTS monthly_revenue_goal numeric(10,2) NOT NULL DEFAULT 50000.00;

COMMENT ON COLUMN public.store_settings.monthly_revenue_goal IS 'Meta de faturamento mensal exibida no dashboard financeiro.';
