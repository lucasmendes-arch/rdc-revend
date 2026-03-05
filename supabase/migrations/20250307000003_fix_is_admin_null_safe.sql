-- Fix is_admin() to safely return false when no user is authenticated
-- auth.uid() returns null for anon requests, which could cause issues
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT role = 'admin' FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  );
$$;
