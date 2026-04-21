-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Soft-delete: coluna archived_at em price_lists
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Atualiza get_my_price_list_items — filtra listas arquivadas
--    (tabelas arquivadas são sempre inativas para o cliente final)
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_archived_at    timestamptz;
BEGIN
  SELECT p.price_list_id, pl.is_active, pl.archived_at
    INTO v_price_list_id, v_is_active, v_archived_at
    FROM profiles p
    LEFT JOIN price_lists pl ON pl.id = p.price_list_id
   WHERE p.id = auth.uid();

  -- Sem lista, lista inativa ou lista arquivada: retorna vazio
  IF v_price_list_id IS NULL
     OR v_is_active IS DISTINCT FROM true
     OR v_archived_at IS NOT NULL
  THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Atualiza resolve_product_prices — filtra listas arquivadas
-- ─────────────────────────────────────────────────────────────────────────────
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
    cp.id                                              AS product_id,
    COALESCE(pli.price, cp.price)::numeric(10,2)       AS resolved_price
  FROM unnest(p_product_ids) AS t(pid)
  JOIN public.catalog_products    cp  ON cp.id  = t.pid
  LEFT JOIN public.profiles       pr  ON pr.id  = p_user_id
  LEFT JOIN public.price_lists    pl  ON pl.id  = pr.price_list_id
                                     AND pl.is_active  = true
                                     AND pl.archived_at IS NULL
  LEFT JOIN public.price_list_items pli
                                      ON pli.price_list_id = pl.id
                                     AND pli.product_id    = cp.id
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_product_prices(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_product_prices(uuid, uuid[])
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Atualiza admin_set_profile_price_list — bloqueia vínculo com lista arquivada
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_profile_price_list(
  p_user_id       uuid,
  p_price_list_id uuid
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

  IF p_price_list_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.price_lists
       WHERE id = p_price_list_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Tabela de preço não encontrada ou arquivada: %', p_price_list_id;
    END IF;
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
