-- O projeto Supabase novo não recebeu os grants de escrita que o Supabase
-- normalmente provisiona no setup. As RLS policies de admin existem, mas
-- PostgreSQL exige o GRANT de tabela E a policy — sem o GRANT, retorna 403
-- antes mesmo de avaliar o RLS.

GRANT INSERT, UPDATE, DELETE ON public.catalog_products  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.orders            TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.order_items       TO authenticated;

-- Garante que tabelas futuras criadas neste schema também herdem os grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
