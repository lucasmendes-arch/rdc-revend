-- ============================================================================
-- Migration: 20260324000012_partner_pricing.sql
-- Description: Adiciona coluna partner_price (base tarifária atacado/parceiro)
-- ============================================================================

ALTER TABLE public.catalog_products
ADD COLUMN partner_price numeric(10,2) DEFAULT NULL;

ALTER TABLE public.profiles
ADD COLUMN is_partner boolean DEFAULT false;

COMMENT ON COLUMN public.catalog_products.partner_price IS 'Preço especial para clientes com tag de parceiros/profissionais';
COMMENT ON COLUMN public.profiles.is_partner IS 'Flag para identificar clientes/contas com precificação de parceiro B2B';
