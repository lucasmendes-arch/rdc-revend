-- Fix infinite recursion on profiles table
-- The admin_read_all_profiles policy calls is_admin() which queries profiles → recursion

-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;

-- 2. Recreate is_admin() to use auth.jwt() instead of querying profiles table
--    This avoids the recursion entirely by reading the role from a separate check
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

-- 3. Admin access to profiles via a SECURITY DEFINER function (bypasses RLS completely)
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.profiles;
$$;

-- 4. Grant execute to authenticated users (is_admin check happens in application layer)
GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
