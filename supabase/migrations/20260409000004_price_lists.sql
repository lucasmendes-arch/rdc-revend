-- ============================================================================
-- Migration: 20260409000004_price_lists.sql
-- Tarefa: RDC_BACK_PRECOS_P1_CLD_V1 — Tabelas de preço por parceiro / nível
--
-- Design:
--   price_lists       — tabelas de preço nomeadas (uma por nível ou parceiro)
--   price_list_items  — preços por produto dentro de uma tabela
--   profiles.price_list_id — vínculo 1 parceiro → 1 tabela de preço (nullable)
--
-- Regra de resolução de preço (source of truth):
--   1. Se profiles.price_list_id IS NOT NULL
--      E price_lists.is_active = true
--      E price_list_items tem entrada para o produto
--      → usar price_list_items.price
--   2. Senão → usar catalog_products.price (fallback padrão)
--
-- Campos legados mantidos (não removidos):
--   profiles.price_category     — campo livre histórico, sem impacto operacional
--   catalog_products.partner_price — continua existindo, não usado pela resolução nova
--
-- Retrocompatibilidade:
--   - profiles.price_list_id tem DEFAULT NULL → sem impacto em clientes existentes
--   - Clientes sem price_list_id continuam recebendo catalog_products.price
--   - Nenhuma coluna existente alterada ou removida
-- ============================================================================


-- ============================================================================
-- 1. TABELA price_lists
-- ============================================================================

CREATE TABLE public.price_lists (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text         NOT NULL,
  description text,
  priority    int          NOT NULL DEFAULT 0,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.price_lists IS 'Tabelas de preço B2B — uma por nível comercial ou parceiro';
COMMENT ON COLUMN public.price_lists.priority IS 'Reservado para resolução futura multi-lista; sem efeito na v1';


-- ============================================================================
-- 2. TABELA price_list_items
-- ============================================================================

CREATE TABLE public.price_list_items (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id  uuid           NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id     uuid           NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  price          numeric(10,2)  NOT NULL CHECK (price >= 0),
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, product_id)
);

COMMENT ON TABLE public.price_list_items IS 'Preços específicos por produto dentro de uma tabela de preço';


-- ============================================================================
-- 3. VÍNCULO parceiro → tabela de preço em profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS price_list_id uuid
    REFERENCES public.price_lists(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.price_list_id IS
  'FK para price_lists. NULL = sem tabela especial, usa catalog_products.price';


-- ============================================================================
-- 4. ÍNDICES
-- ============================================================================

CREATE INDEX idx_price_list_items_price_list_id
  ON public.price_list_items (price_list_id);

CREATE INDEX idx_price_list_items_product_id
  ON public.price_list_items (product_id);

CREATE INDEX idx_profiles_price_list_id
  ON public.profiles (price_list_id)
  WHERE price_list_id IS NOT NULL;

CREATE INDEX idx_price_lists_is_active
  ON public.price_lists (is_active);


-- ============================================================================
-- 5. RLS
--
-- Estratégia:
--   - Admin: acesso total via is_admin() (SECURITY DEFINER, sem recursão)
--   - Usuários autenticados: acesso via RPC get_my_price_list_items()
--     (sem acesso direto às tabelas — evita subquery em profiles nas policies)
--   - Anon: sem acesso
-- ============================================================================

ALTER TABLE public.price_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

-- price_lists: admin total
CREATE POLICY "price_lists_admin_all"
  ON public.price_lists
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- price_list_items: admin total
CREATE POLICY "price_list_items_admin_all"
  ON public.price_list_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================================
-- 6. RPC: get_my_price_list_items
--    Retorna itens da tabela de preço do usuário autenticado.
--    Se sem lista ou lista inativa → retorna vazio (frontend usa preço padrão).
--    Frontend usa para exibir preços resolvidos no catálogo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_price_list_items()
RETURNS TABLE (
  product_id  uuid,
  price       numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_price_list_id  uuid;
  v_is_active      boolean;
BEGIN
  SELECT p.price_list_id, pl.is_active
    INTO v_price_list_id, v_is_active
    FROM profiles p
    LEFT JOIN price_lists pl ON pl.id = p.price_list_id
   WHERE p.id = auth.uid();

  -- Sem lista ou lista inativa: retorna vazio
  IF v_price_list_id IS NULL OR v_is_active IS DISTINCT FROM true THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT pli.product_id, pli.price
      FROM price_list_items pli
     WHERE pli.price_list_id = v_price_list_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_price_list_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_price_list_items() TO authenticated;


-- ============================================================================
-- 7. RPC: resolve_product_prices
--    Resolve preços para um conjunto de produtos dado um user_id.
--    Usada pela edge function create-order via serviceClient.
--    Também disponível como utilitário para outros contextos server-side.
--
--    Regra:
--      price_list_items.price se lista ativa e item cadastrado
--      catalog_products.price como fallback
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_product_prices(
  p_user_id     uuid,
  p_product_ids uuid[]
)
RETURNS TABLE (
  product_id     uuid,
  resolved_price numeric(10,2)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    cp.id                                             AS product_id,
    COALESCE(pli.price, cp.price)::numeric(10,2)      AS resolved_price
  FROM unnest(p_product_ids) AS t(pid)
  JOIN public.catalog_products   cp  ON cp.id  = t.pid
  LEFT JOIN public.profiles      pr  ON pr.id  = p_user_id
  LEFT JOIN public.price_lists   pl  ON pl.id  = pr.price_list_id
                                    AND pl.is_active = true
  LEFT JOIN public.price_list_items pli
                                     ON pli.price_list_id = pl.id
                                    AND pli.product_id    = cp.id
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_product_prices(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_product_prices(uuid, uuid[])
  TO authenticated, service_role;


-- ============================================================================
-- 8. ADMIN RPC: admin_set_profile_price_list
--    Vincula ou desvincula um parceiro de uma tabela de preço.
--    p_price_list_id = NULL → desvincula.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_profile_price_list(
  p_user_id       uuid,
  p_price_list_id uuid  -- NULL para desvincular
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_price_list_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.price_lists WHERE id = p_price_list_id
  ) THEN
    RAISE EXCEPTION 'Tabela de preço não encontrada: %', p_price_list_id;
  END IF;

  UPDATE public.profiles
     SET price_list_id = p_price_list_id
   WHERE id = p_user_id
     AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_price_list(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_price_list(uuid, uuid) TO authenticated;


-- ============================================================================
-- 9. ATUALIZAR get_all_profiles para incluir price_list_id e price_list_name
--    Mantém assinatura compatível com 20260409000003_partner_access.sql
--    e adiciona os dois campos novos no final.
-- ============================================================================

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
  price_list_name         text
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
      pl.name AS price_list_name
    FROM public.profiles p
    LEFT JOIN auth.users         u  ON u.id  = p.id
    LEFT JOIN public.price_lists pl ON pl.id = p.price_list_id
    WHERE p.role = 'user'
    ORDER BY p.full_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
