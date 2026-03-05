-- NUCLEAR FIX: Remove all is_admin() usage from RLS policies
-- SECURITY DEFINER doesn't bypass RLS in Supabase hosted environment
-- Solution: use auth.uid() checks only, admin access via SECURITY DEFINER functions

-- ============================================================================
-- PROFILES — simple self-read only
-- ============================================================================
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- CATALOG_PRODUCTS — anyone authenticated can read active, admin via function
-- ============================================================================
DROP POLICY IF EXISTS "users_read_active_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_read_all_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_insert_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_update_products" ON public.catalog_products;
DROP POLICY IF EXISTS "admin_delete_products" ON public.catalog_products;

-- Public read for active products (any authenticated user)
CREATE POLICY "read_active_products" ON public.catalog_products
  FOR SELECT USING (is_active = true);

-- Admin write via direct role check (no function call to avoid recursion)
CREATE POLICY "admin_insert_products" ON public.catalog_products
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_update_products" ON public.catalog_products
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_delete_products" ON public.catalog_products
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ============================================================================
-- ORDERS — users own, admin via subquery
-- ============================================================================
DROP POLICY IF EXISTS "users_select_own_orders" ON public.orders;
DROP POLICY IF EXISTS "users_insert_own_orders" ON public.orders;
DROP POLICY IF EXISTS "admin_select_all_orders" ON public.orders;
DROP POLICY IF EXISTS "admin_update_orders" ON public.orders;

CREATE POLICY "users_read_own_orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_read_all_orders" ON public.orders
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_update_orders" ON public.orders
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ============================================================================
-- ORDER_ITEMS — users own orders, admin via subquery
-- ============================================================================
DROP POLICY IF EXISTS "users_select_own_order_items" ON public.order_items;
DROP POLICY IF EXISTS "users_insert_own_order_items" ON public.order_items;
DROP POLICY IF EXISTS "admin_select_all_order_items" ON public.order_items;
DROP POLICY IF EXISTS "admin_manage_order_items" ON public.order_items;

CREATE POLICY "users_read_own_order_items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "users_insert_own_order_items" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "admin_manage_order_items" ON public.order_items
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ============================================================================
-- CATALOG_SYNC_RUNS — admin only
-- ============================================================================
DROP POLICY IF EXISTS "admin_manage_sync_runs" ON public.catalog_sync_runs;

CREATE POLICY "admin_manage_sync_runs" ON public.catalog_sync_runs
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ============================================================================
-- INVENTORY — admin only
-- ============================================================================
DROP POLICY IF EXISTS "admin_manage_inventory" ON public.inventory;

CREATE POLICY "admin_manage_inventory" ON public.inventory
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ============================================================================
-- CLIENT_SESSIONS — keep existing simple policies (no is_admin usage)
-- ============================================================================
DROP POLICY IF EXISTS "admin_read_all_sessions" ON public.client_sessions;
DROP POLICY IF EXISTS "admin_manage_sessions" ON public.client_sessions;
DROP POLICY IF EXISTS "admin_delete_sessions" ON public.client_sessions;

CREATE POLICY "admin_read_all_sessions" ON public.client_sessions
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_manage_sessions" ON public.client_sessions
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_delete_sessions" ON public.client_sessions
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ============================================================================
-- Admin read-all functions (SECURITY DEFINER — bypass RLS for admin panels)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_all_products()
RETURNS SETOF public.catalog_products
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM catalog_products ORDER BY updated_at DESC;
END;
$$;
