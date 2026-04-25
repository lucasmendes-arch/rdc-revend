-- Adiciona flag de lançamento em catalog_products
-- Usado no Portal do Parceiro para exibir a seção "Lançamentos"

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS is_new_arrival boolean NOT NULL DEFAULT false;
