-- Migration 10: Admin Deletion Audit + RPCs
-- Description: Adds audit logs for destructive operations and secure RPCs for deleting orders and clients

-- 1. Create Audit Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    entity_type text NOT NULL CHECK (entity_type IN ('order', 'client')),
    entity_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.admin_audit_logs
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Only admins can insert (handled by RPC SECURITY DEFINER anyway, but good to have)
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
    ON public.admin_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());


-- 2. RPC to Delete Orders
CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id uuid;
BEGIN
    -- Check if user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir pedidos.';
    END IF;

    -- Get admin id
    v_admin_id := auth.uid();

    -- Check if order exists
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
        RAISE EXCEPTION 'Pedido não encontrado.';
    END IF;

    -- 1. Log the audit
    INSERT INTO public.admin_audit_logs (admin_id, entity_type, entity_id, action)
    VALUES (v_admin_id, 'order', p_order_id, 'hard_delete');

    -- 2. Clean dependencies
    DELETE FROM public.crm_events WHERE metadata->>'order_id' = p_order_id::text;
    DELETE FROM public.order_items WHERE order_id = p_order_id;

    -- 3. Delete order
    DELETE FROM public.orders WHERE id = p_order_id;

    RETURN true;
END;
$$;

-- Grant execute
REVOKE EXECUTE ON FUNCTION public.admin_delete_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid) TO authenticated;


-- 3. RPC to Delete Test Client
CREATE OR REPLACE FUNCTION public.admin_delete_test_client(p_client_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id uuid;
    v_order_count int;
BEGIN
    -- Check if user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir clientes.';
    END IF;

    -- Get admin id
    v_admin_id := auth.uid();

    -- Check if profile exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client_id) THEN
        RAISE EXCEPTION 'Cliente não encontrado.';
    END IF;

    -- Check for linked orders
    SELECT count(*) INTO v_order_count FROM public.orders WHERE user_id = p_client_id;
    IF v_order_count > 0 THEN
        RAISE EXCEPTION 'Bloqueado: Este cliente possui % pedido(s) vinculados. Exclua os pedidos primeiro.', v_order_count;
    END IF;

    -- 1. Log the audit
    INSERT INTO public.admin_audit_logs (admin_id, entity_type, entity_id, action)
    VALUES (v_admin_id, 'client', p_client_id, 'hard_delete');

    -- 2. Clean dependent structures
    DELETE FROM public.crm_customer_tags WHERE user_id = p_client_id;
    DELETE FROM public.client_sessions WHERE user_id = p_client_id;
    DELETE FROM public.crm_events WHERE user_id = p_client_id;

    -- 3. Delete profile
    DELETE FROM public.profiles WHERE id = p_client_id;

    RETURN true;
END;
$$;

-- Grant execute
REVOKE EXECUTE ON FUNCTION public.admin_delete_test_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_test_client(uuid) TO authenticated;

-- Force schema reload
NOTIFY pgrst, 'reload schema';
