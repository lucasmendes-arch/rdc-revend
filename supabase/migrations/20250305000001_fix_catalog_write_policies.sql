-- Fix: Recriar políticas de escrita para admins em catalog_products
-- A migration 003 removeu todas as policies de escrita, deixando apenas SELECT.
-- Isso causava que update, delete e insert falhavam silenciosamente.

CREATE POLICY "admin_insert_products" ON public.catalog_products
  FOR INSERT WITH CHECK (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

CREATE POLICY "admin_update_products" ON public.catalog_products
  FOR UPDATE USING (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  ) WITH CHECK (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

CREATE POLICY "admin_delete_products" ON public.catalog_products
  FOR DELETE USING (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Garantir que o admin tem role='admin' na tabela profiles
UPDATE public.profiles SET role = 'admin' WHERE id = (
  SELECT id FROM auth.users WHERE email = 'lmendescapelini@gmail.com'
);
