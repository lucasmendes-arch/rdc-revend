-- Migration: 20260409000003_partner_access.sql
-- Objetivo: adicionar colunas de controle de acesso para parceiros da rede.
--
-- Design:
--   profiles.id = auth.users.id (FK garantida por trigger handle_new_user).
--   Não criamos nova coluna auth_user_id — usamos o auth user existente
--   e adicionamos phone + password via Admin API (edge function).
--
-- Colunas novas em profiles:
--   access_status       — estado do acesso ao portal
--   auth_phone          — telefone normalizado (E.164) usado como login
--   credentials_created_at  — quando o acesso foi provisionado
--   last_password_reset_at  — quando a senha foi resetada pela última vez

-- ============================================================================
-- 1. Colunas de controle de acesso em profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_status text
    DEFAULT 'not_created'
    CHECK (access_status IN ('not_created', 'active', 'blocked')),
  ADD COLUMN IF NOT EXISTS auth_phone text,
  ADD COLUMN IF NOT EXISTS credentials_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_password_reset_at timestamptz;

-- Índice para deduplicação por telefone
CREATE INDEX IF NOT EXISTS idx_profiles_auth_phone
  ON public.profiles (auth_phone)
  WHERE auth_phone IS NOT NULL;

-- ============================================================================
-- 2. Atualizar get_all_profiles para incluir novas colunas
--    Também corrige campos que já existiam na interface mas não eram retornados
--    (document_type, document, employees, revenue).
-- ============================================================================

-- DROP first because changing RETURNS TABLE signature requires it
DROP FUNCTION IF EXISTS public.get_all_profiles();

CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id                      uuid,
  full_name               text,
  phone                   text,
  document_type           text,
  document                text,
  business_type           text,
  employees               text,
  revenue                 text,
  email                   text,
  is_partner              boolean,
  customer_segment        text,
  access_status           text,
  auth_phone              text,
  credentials_created_at  timestamptz,
  last_password_reset_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.phone,
      p.document_type,
      p.document,
      p.business_type,
      p.employees,
      p.revenue,
      u.email::text,
      p.is_partner,
      p.customer_segment,
      COALESCE(p.access_status, 'not_created')::text,
      p.auth_phone,
      p.credentials_created_at,
      p.last_password_reset_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'user'
    ORDER BY p.full_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
