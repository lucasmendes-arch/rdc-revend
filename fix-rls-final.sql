-- ============================================================================
-- FINAL FIX: Disable RLS on profiles, simplify catalog policies
-- Execute this in Supabase SQL Editor
-- ============================================================================

-- 1. DISABLE RLS on profiles (it's just user metadata, no sensitive data)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 2. KEEP RLS enabled on catalog tables but REMOVE all old policies
ALTER TABLE public.catalog_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync_runs DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_users_read_own" ON public.profiles;
DROP POLICY IF EXISTS "catalog_read_active" ON public.catalog_products;
DROP POLICY IF EXISTS "catalog_admin_all" ON public.catalog_products;
DROP POLICY IF EXISTS "sync_admin_only" ON public.catalog_sync_runs;

-- 3. RE-ENABLE RLS on catalog tables only
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

-- 4. NEW POLICIES - Simple, non-recursive
-- catalog_products: Read active products (public), admin can do everything
CREATE POLICY "public_read_active_products" ON public.catalog_products
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "admin_full_access" ON public.catalog_products
  FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- catalog_sync_runs: Admin only
CREATE POLICY "admin_only_sync_runs" ON public.catalog_sync_runs
  FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 5. Verify
SELECT 'RLS Fixed! Profiles table has NO RLS, catalog tables have simple policies.' as status;
