-- Correção de vulnerabilidade crítica (checkup 2026-07-23, item S-01).
--
-- 20260722000004_contract_formacao_schema.sql fez DROP FUNCTION +
-- CREATE OR REPLACE de get_system_users() sem refazer o GRANT. DROP descarta
-- os privilégios e o CREATE seguinte concede EXECUTE a PUBLIC por padrão —
-- no Supabase, PUBLIC inclui anon. Como a função é SECURITY DEFINER (lê
-- auth.users) e não tinha guarda interna, qualquer anônimo com a chave anon
-- pública obtinha nome, e-mail, WhatsApp, role, permissions, loja e último
-- login de toda a equipe. Confirmado explorável em produção (HTTP 200).
--
-- Aqui: (1) fecha o grant, (2) adiciona guarda interna admin-only, (3) cria
-- uma RPC enxuta pras telas de RH que só precisam do nome pra um dropdown.

-- ============================================================
-- 1. get_system_users() — admin-only, com guarda interna.
--
-- CREATE OR REPLACE (não DROP) de propósito: o shape do RETURNS TABLE é
-- idêntico ao de 20260722000004, então dá pra trocar LANGUAGE sql →
-- plpgsql sem dropar. Dropar aqui repetiria justamente o erro que esta
-- migration corrige. LANGUAGE precisa virar plpgsql porque LANGUAGE sql
-- não permite RAISE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_system_users()
RETURNS TABLE (
  id              uuid,
  role            text,
  full_name       text,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  permissions     jsonb,
  store_id        uuid,
  store_name      text,
  whatsapp_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.role,
    p.full_name,
    u.email::text,
    p.created_at,
    u.last_sign_in_at,
    p.permissions,
    p.store_id,
    s.name,
    p.whatsapp_number
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.role IN ('admin', 'salao', 'administrativo')
  ORDER BY p.role ASC, p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_system_users() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_system_users() TO authenticated;

COMMENT ON FUNCTION public.get_system_users() IS
  'Lista usuários de sistema com dados sensíveis (e-mail, WhatsApp, permissions, '
  'último login). Admin-only, verificado internamente — as telas de RH/DP que só '
  'precisam de nome pra dropdown devem usar get_assignable_rh_users().';

-- ============================================================
-- 2. get_assignable_rh_users() — só id + nome, pro select de "responsável"
--    nas telas de RH/DP (Candidatos, Automações, DP/Contratação).
--
-- Mesmo conjunto de usuários que o frontend filtrava no cliente
-- (role IN ('admin','administrativo') OR permissions->>'can_manage_rh'),
-- agora resolvido no servidor. Não devolve e-mail, last_sign_in_at nem
-- permissions — um dropdown de responsável não precisa de nada disso.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_assignable_rh_users()
RETURNS TABLE (
  id        uuid,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_rh_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.role IN ('admin', 'administrativo')
     OR p.permissions->>'can_manage_rh' = 'true'
  ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_assignable_rh_users() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_assignable_rh_users() TO authenticated;

COMMENT ON FUNCTION public.get_assignable_rh_users() IS
  'Usuários atribuíveis como responsável por um candidato/processo (mesma regra '
  'de has_rh_access). Devolve só id + full_name — sem e-mail, permissions ou '
  'último login. Criada no checkup 2026-07-23 pra tirar as telas de RH/DP de '
  'cima de get_system_users(), que passou a ser admin-only.';
