-- Desabilitar RLS em profiles (é a raiz do problema de recursão infinita)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Remover TODAS as policies problemáticas de catalog_products
DROP POLICY IF EXISTS "read_all_products" ON public.catalog_products;
DROP POLICY IF EXISTS "write_authenticated_products" ON public.catalog_products;
DROP POLICY IF EXISTS "update_authenticated_products" ON public.catalog_products;
DROP POLICY IF EXISTS "delete_authenticated_products" ON public.catalog_products;
DROP POLICY IF EXISTS "public_read" ON public.catalog_products;
DROP POLICY IF EXISTS "authenticated_insert" ON public.catalog_products;
DROP POLICY IF EXISTS "authenticated_update" ON public.catalog_products;
DROP POLICY IF EXISTS "authenticated_delete" ON public.catalog_products;
DROP POLICY IF EXISTS "users_read_active_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_read_all_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_write_products" ON public.catalog_products;

-- Recriar apenas a política de leitura pública em catalog_products
CREATE POLICY "read_all_products" ON public.catalog_products
  FOR SELECT
  USING (true);

-- Desabilitar RLS em outras tabelas (será ativado com policies corretas depois)
ALTER TABLE public.catalog_sync_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
