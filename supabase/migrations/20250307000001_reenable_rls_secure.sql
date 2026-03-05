-- ============================================================================
-- Re-enable RLS with SECURITY DEFINER helper to avoid recursion
-- ============================================================================

-- 1. Create helper function that bypasses RLS to check admin role
--    SECURITY DEFINER = runs as the function owner (postgres), not the caller
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================================
-- 2. PROFILES — re-enable RLS
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;

-- Users read their own profile
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Admins read all profiles (uses SECURITY DEFINER function — no recursion)
CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- ============================================================================
-- 3. CATALOG_PRODUCTS — fix policies to use is_admin()
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "read_all_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_insert_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_update_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_delete_products" ON public.catalog_products;
DROP POLICY IF EXISTS "users_read_active_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_read_all_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_write_products" ON public.catalog_products;

-- Authenticated users read active products only
CREATE POLICY "users_read_active_products" ON public.catalog_products
  FOR SELECT USING (is_active = true);

-- Admins read ALL products (active + inactive)
CREATE POLICY "admin_read_all_products" ON public.catalog_products
  FOR SELECT USING (public.is_admin());

-- Admins write
CREATE POLICY "admin_insert_products" ON public.catalog_products
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_products" ON public.catalog_products
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_products" ON public.catalog_products
  FOR DELETE USING (public.is_admin());

-- ============================================================================
-- 4. ORDERS — re-enable RLS
-- ============================================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop old policies (may not exist since RLS was disabled)
DROP POLICY IF EXISTS "users_select_own_orders" ON public.orders;
DROP POLICY IF EXISTS "users_insert_own_orders" ON public.orders;
DROP POLICY IF EXISTS "admin_select_all_orders" ON public.orders;
DROP POLICY IF EXISTS "admin_update_orders" ON public.orders;

-- Users read own orders
CREATE POLICY "users_select_own_orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

-- Users insert own orders
CREATE POLICY "users_insert_own_orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins read all orders
CREATE POLICY "admin_select_all_orders" ON public.orders
  FOR SELECT USING (public.is_admin());

-- Admins update any order (status changes)
CREATE POLICY "admin_update_orders" ON public.orders
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 5. ORDER_ITEMS — re-enable RLS
-- ============================================================================

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "users_select_own_order_items" ON public.order_items;
DROP POLICY IF EXISTS "users_insert_own_order_items" ON public.order_items;
DROP POLICY IF EXISTS "admin_select_all_order_items" ON public.order_items;
DROP POLICY IF EXISTS "admin_manage_order_items" ON public.order_items;

-- Users read items of their own orders
CREATE POLICY "users_select_own_order_items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- Users insert items to their own orders
CREATE POLICY "users_insert_own_order_items" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- Admins read all
CREATE POLICY "admin_select_all_order_items" ON public.order_items
  FOR SELECT USING (public.is_admin());

-- Admins manage all
CREATE POLICY "admin_manage_order_items" ON public.order_items
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 6. CATALOG_SYNC_RUNS — re-enable RLS
-- ============================================================================

ALTER TABLE public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_sync_runs" ON public.catalog_sync_runs;

-- Only admins
CREATE POLICY "admin_manage_sync_runs" ON public.catalog_sync_runs
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 7. INVENTORY — enable RLS (was never properly secured)
-- ============================================================================

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Only admins can see/manage inventory
CREATE POLICY "admin_manage_inventory" ON public.inventory
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 8. CLIENT_SESSIONS — enable RLS
-- ============================================================================

ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert sessions (tracking)
CREATE POLICY "auth_insert_session" ON public.client_sessions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can update sessions they own (upsert onConflict needs this)
CREATE POLICY "auth_update_own_session" ON public.client_sessions
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id IS NULL
  );

-- Users read their own session
CREATE POLICY "users_read_own_session" ON public.client_sessions
  FOR SELECT USING (user_id = auth.uid());

-- Admins read all sessions (kanban dashboard)
CREATE POLICY "admin_read_all_sessions" ON public.client_sessions
  FOR SELECT USING (public.is_admin());

-- Admins manage all sessions
CREATE POLICY "admin_manage_sessions" ON public.client_sessions
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "admin_delete_sessions" ON public.client_sessions
  FOR DELETE USING (public.is_admin());
