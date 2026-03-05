-- Add registration fields to profiles for B2B signup
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS document_type text, -- 'CPF' or 'CNPJ'
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS business_type text, -- 'salao', 'revenda', 'loja'
  ADD COLUMN IF NOT EXISTS employees text,
  ADD COLUMN IF NOT EXISTS revenue text;
