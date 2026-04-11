-- Adiciona last_sign_in_at ao retorno de get_system_users
DROP FUNCTION IF EXISTS get_system_users();
CREATE OR REPLACE FUNCTION get_system_users()
RETURNS TABLE (
  id              uuid,
  role            text,
  full_name       text,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.role,
    p.full_name,
    u.email,
    p.created_at,
    u.last_sign_in_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role IN ('admin', 'salao')
  ORDER BY p.role ASC, p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_system_users() TO authenticated;
