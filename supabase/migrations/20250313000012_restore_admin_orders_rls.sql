-- ============================================================================
-- Migration: 20250313000012_restore_admin_orders_rls.sql
-- Problema: migration _006 removeu as policies admin de orders/order_items.
-- Pedidos manuais (user_id = cliente) ficavam invisíveis ao admin porque a única
-- policy SELECT era "own_orders_select" (auth.uid() = user_id).
-- Solução: restaurar políticas admin de leitura e escrita em orders e order_items.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- orders — admin SELECT + UPDATE
-- Usa subquery em profiles (segura: admin lê o próprio perfil via self_select,
-- que tem role='admin', então auth.uid() IN (...) retorna true para admins)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_all_orders"  ON public.orders;
DROP POLICY IF EXISTS "admin_select_all_orders" ON public.orders;
DROP POLICY IF EXISTS "admin_update_orders"     ON public.orders;

CREATE POLICY "admin_read_all_orders" ON public.orders
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_update_orders" ON public.orders
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- order_items — admin SELECT
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_all_order_items"   ON public.order_items;
DROP POLICY IF EXISTS "admin_select_all_order_items" ON public.order_items;
DROP POLICY IF EXISTS "admin_manage_order_items"     ON public.order_items;

CREATE POLICY "admin_read_all_order_items" ON public.order_items
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_manage_order_items" ON public.order_items
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );
