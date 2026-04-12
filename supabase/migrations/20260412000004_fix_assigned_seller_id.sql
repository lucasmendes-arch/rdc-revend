-- =============================================================================
-- Migration: 20260412000004_fix_assigned_seller_id.sql
-- Objetivo: corrigir modelagem de owner comercial em profiles.
--
-- Problema anterior (20260412000001):
--   A RPC admin_set_profile_seller gravava sellers.code (text) em
--   profiles.assigned_seller, sem integridade referencial. Se o code de um
--   seller mudar, o vínculo quebra silenciosamente.
--
-- Correção:
--   1. Nova coluna profiles.assigned_seller_id (uuid FK → sellers.id)
--      com ON DELETE SET NULL — integridade garantida pelo banco.
--   2. Backfill: preenche assigned_seller_id onde houver match confiável
--      entre assigned_seller (code) e sellers.code existente.
--   3. Atualiza admin_set_profile_seller para gravar em assigned_seller_id.
--      Também sincroniza assigned_seller (text) para backward compat com n8n.
--   4. Atualiza get_all_profiles para resolver seller_id a partir de
--      assigned_seller_id (não mais de assigned_seller via code).
--
-- Compatibilidade:
--   - assigned_seller (text) é mantido como está — continua sendo gravado
--     em paralelo para não quebrar integração n8n/ClickUp que o lê.
--   - A source of truth para o admin passa a ser assigned_seller_id.
--   - Clientes sem vínculo de seller têm assigned_seller_id = NULL.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Nova coluna assigned_seller_id (uuid FK → sellers.id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_seller_id uuid
    REFERENCES public.sellers(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.assigned_seller_id IS
  'FK para sellers.id — source of truth do owner comercial (CRM P1). '
  'assigned_seller (text) é mantido para compatibilidade com integração n8n/ClickUp.';

CREATE INDEX IF NOT EXISTS idx_profiles_assigned_seller_id
  ON public.profiles (assigned_seller_id)
  WHERE assigned_seller_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Backfill: preencher assigned_seller_id onde houver match em sellers.code
--    Só preenche onde assigned_seller_id ainda é NULL e assigned_seller não é
--    NULL — evita sobrescrever qualquer valor já inserido.
-- -----------------------------------------------------------------------------
UPDATE public.profiles p
   SET assigned_seller_id = s.id
  FROM public.sellers s
 WHERE s.code = p.assigned_seller
   AND p.assigned_seller IS NOT NULL
   AND p.assigned_seller_id IS NULL;


-- -----------------------------------------------------------------------------
-- 3. Atualizar admin_set_profile_seller
--    - Passa a gravar em assigned_seller_id (uuid FK) como source of truth.
--    - Mantém assigned_seller (text) sincronizado para n8n/ClickUp.
--    - Aceita p_seller_id NULL para desvincular ambos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_seller(
  p_user_id   uuid,
  p_seller_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_code text;
  v_updated     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_seller_id IS NULL THEN
    -- Desvincular: limpa ambas as colunas
    UPDATE public.profiles
       SET assigned_seller_id = NULL,
           assigned_seller    = NULL
     WHERE id = p_user_id
       AND role = 'user';
  ELSE
    -- Validar seller ativo e capturar code para sync legada
    SELECT s.code
      INTO v_seller_code
      FROM public.sellers s
     WHERE s.id = p_seller_id
       AND s.active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vendedor inválido ou inativo';
    END IF;

    UPDATE public.profiles
       SET assigned_seller_id = p_seller_id,
           assigned_seller    = v_seller_code   -- sync legada para n8n
     WHERE id = p_user_id
       AND role = 'user';
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_seller(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_profile_seller(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_set_profile_seller(uuid, uuid) IS
  'Admin: atribui (ou desvincula com NULL) o seller owner de um profile. '
  'Grava em assigned_seller_id (FK, source of truth) e assigned_seller (text, sync n8n).';


-- -----------------------------------------------------------------------------
-- 4. Atualizar get_all_profiles
--    Resolve seller_id e seller_name via JOIN em assigned_seller_id (não mais
--    em assigned_seller text). Assinatura RETURNS TABLE inalterada.
-- -----------------------------------------------------------------------------
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
  last_password_reset_at  timestamptz,
  price_list_id           uuid,
  price_list_name         text,
  assigned_seller         text,
  seller_id               uuid,
  seller_name             text,
  next_action             text,
  next_action_at          timestamptz,
  total_orders            bigint,
  total_spent             numeric,
  first_order_at          timestamptz,
  last_order_at           timestamptz
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
    p.last_password_reset_at,
    p.price_list_id,
    pl.name   AS price_list_name,
    p.assigned_seller,
    s.id      AS seller_id,       -- resolvido via FK assigned_seller_id
    s.name    AS seller_name,
    p.next_action,
    p.next_action_at,
    COALESCE(ord.total_orders, 0)  AS total_orders,
    COALESCE(ord.total_spent,  0)  AS total_spent,
    ord.first_order_at,
    ord.last_order_at
  FROM public.profiles p
  LEFT JOIN auth.users         u   ON u.id  = p.id
  LEFT JOIN public.price_lists pl  ON pl.id = p.price_list_id
  LEFT JOIN public.sellers     s   ON s.id  = p.assigned_seller_id   -- FK direto
  LEFT JOIN (
    SELECT
      o.user_id,
      COUNT(*)::bigint AS total_orders,
      COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelado','expirado')), 0) AS total_spent,
      MIN(o.created_at) AS first_order_at,
      MAX(o.created_at) AS last_order_at
    FROM public.orders o
    GROUP BY o.user_id
  ) ord ON ord.user_id = p.id
  WHERE p.role = 'user'
  ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_profiles() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
