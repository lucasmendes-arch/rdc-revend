-- Add quantity field to upsell offers (e.g., "10 ampolas por R$10,90 cada")
ALTER TABLE public.upsell_offers
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1;
