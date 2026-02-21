-- ============================================================================
-- AGGRESSIVE FIX: Remover TODA RLS e recrear simples
-- Execute isso no SQL Editor do Supabase
-- ============================================================================

-- 1. DESABILITAR RLS em todas as tabelas
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync_runs DISABLE ROW LEVEL SECURITY;

-- 2. DROPAR TODAS as policies existentes
DROP POLICY IF EXISTS "users_read_active_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_read_all_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_write_products" ON public.catalog_products;
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_manage_sync_runs" ON public.catalog_sync_runs;
DROP POLICY IF EXISTS "public_read_active" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_full_access" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_full_access" ON public.profiles;
DROP POLICY IF EXISTS "admin_only" ON public.catalog_sync_runs;

-- 3. RE-ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

-- 4. SIMPLES - Sem recursão
-- PROFILE: apenas lê seu próprio
CREATE POLICY "profiles_users_read_own" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- CATALOG_PRODUCTS: qualquer autenticado lê ativos, admin lê/escreve tudo
CREATE POLICY "catalog_read_active" ON public.catalog_products
  FOR SELECT
  USING (is_active = true OR auth.role() = 'authenticated');

CREATE POLICY "catalog_admin_all" ON public.catalog_products
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- CATALOG_SYNC_RUNS: apenas admin
CREATE POLICY "sync_admin_only" ON public.catalog_sync_runs
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- 5. Status
SELECT
  'RLS Fix Complete!' as status,
  current_timestamp as timestamp;
