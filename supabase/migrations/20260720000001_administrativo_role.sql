-- ============================================================================
-- Migration: 20260720000001_administrativo_role.sql
-- Novo tipo de acesso 'administrativo' — RH + DP + Estoque completo
--
-- Perfil de escritório sem loja física vinculada: acessa RH/DP como um admin
-- (mesma has_rh_access()) e o módulo de Estoque por completo — Contagem,
-- Pedidos, Relatório, Estoque Atual, Histórico e Config — igual ao admin
-- (sem store_id fixo; escolhe a loja no seletor, mesmo fluxo do admin em
-- useMyStore/EstoqueLayout). NÃO tem nenhum outro poder de admin (catálogo
-- geral, pedidos comerciais, usuários, tabelas de preço, credenciais
-- WhatsApp — essa última continua is_admin()-only mesmo pra quem já lê via
-- has_rh_access(), ver nota de segurança em admin_set_store_whatsapp_credential).
--
-- Decisão do usuário (2026-07-20): estoque "completo" (não só contagem) e
-- sem loja fixa (vê/escolhe qualquer loja, como o admin já faz hoje).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles.role — novo valor válido
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'salao', 'administrativo'));

-- ----------------------------------------------------------------------------
-- 2. has_full_stock_access() — admin OU administrativo, sem escopo de loja.
--    Usada só nas policies/RPCs do módulo de Estoque que hoje checam
--    is_admin() puro (o ramo "colaborador de loja" via is_estoque() +
--    my_store_id() continua exclusivo de role='salao', sem mudança).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_full_stock_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'administrativo')
  );
$$;

COMMENT ON FUNCTION public.has_full_stock_access() IS
  'Retorna true para admin ou administrativo — acesso irrestrito (todas as '
  'lojas) ao módulo de Estoque, mesmo padrão de is_admin()/is_estoque() '
  '(SECURITY DEFINER evita subquery direta em profiles dentro de policy, '
  'regra D-01). Colaborador de loja física (role=salao) continua passando '
  'por is_estoque() + my_store_id(), sem mudança.';

-- ----------------------------------------------------------------------------
-- 3. has_rh_access() — inclui role='administrativo' (acesso pleno, igual admin;
--    a permissão granular can_manage_rh continua valendo pra outros roles).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_rh_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'administrativo') OR permissions->>'can_manage_rh' = 'true')
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS: troca is_admin() por has_full_stock_access() nas policies "_admin_all"
--    das tabelas do módulo de Estoque (8 tabelas).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS stores_admin_all ON public.stores;
CREATE POLICY stores_admin_all ON public.stores
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS stock_categories_admin_all ON public.stock_categories;
CREATE POLICY stock_categories_admin_all ON public.stock_categories
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS stock_count_items_admin_all ON public.stock_count_items;
CREATE POLICY stock_count_items_admin_all ON public.stock_count_items
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS stock_counts_admin_all ON public.stock_counts;
CREATE POLICY stock_counts_admin_all ON public.stock_counts
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS store_stock_targets_admin_all ON public.store_stock_targets;
CREATE POLICY store_stock_targets_admin_all ON public.store_stock_targets
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS replenishment_orders_admin_all ON public.replenishment_orders;
CREATE POLICY replenishment_orders_admin_all ON public.replenishment_orders
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS replenishment_requests_admin_all ON public.replenishment_requests;
CREATE POLICY replenishment_requests_admin_all ON public.replenishment_requests
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

DROP POLICY IF EXISTS replenishment_request_items_admin_all ON public.replenishment_request_items;
CREATE POLICY replenishment_request_items_admin_all ON public.replenishment_request_items
  FOR ALL USING (public.has_full_stock_access()) WITH CHECK (public.has_full_stock_access());

-- ----------------------------------------------------------------------------
-- 5. RPCs do módulo de Estoque — troca is_admin() por has_full_stock_access()
--    no ramo "acesso irrestrito"; ramo is_estoque()+my_store_id() (salao)
--    permanece inalterado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_stock_count(p_stock_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid               uuid;
  v_count             record;
  v_store_type        text;
  v_item              record;
  v_total_units       int;
  v_target            int;
  v_suggested         int;
  v_request_id        uuid;
  v_items_total       int := 0;
  v_items_replenished int := 0;
  v_items_sufficient  int := 0;
  v_items_skipped     jsonb := '[]'::jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contagem não encontrada: %', p_stock_count_id;
  END IF;

  SELECT type INTO v_store_type FROM public.stores WHERE id = v_count.store_id;

  IF NOT (
    public.has_full_stock_access()
    OR (public.is_estoque() AND v_count.store_id = public.my_store_id())
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_count.status = 'confirmed' THEN
    RAISE EXCEPTION 'Contagem já confirmada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_count_items WHERE stock_count_id = p_stock_count_id
  ) THEN
    RAISE EXCEPTION 'Contagem sem itens';
  END IF;

  DELETE FROM public.replenishment_requests
  WHERE destination_store_id = v_count.store_id AND status = 'open';

  FOR v_item IN
    SELECT sci.product_id, sci.closed_boxes, sci.loose_units, cp.units_per_box
    FROM public.stock_count_items sci
    JOIN public.catalog_products cp ON cp.id = sci.product_id
    WHERE sci.stock_count_id = p_stock_count_id
  LOOP
    v_items_total := v_items_total + 1;

    IF v_item.units_per_box IS NULL THEN
      v_items_skipped := v_items_skipped || jsonb_build_array(
        jsonb_build_object('product_id', v_item.product_id, 'reason', 'no_units_per_box')
      );
      CONTINUE;
    END IF;

    v_total_units := (v_item.closed_boxes * v_item.units_per_box) + v_item.loose_units;

    SELECT target_quantity INTO v_target
    FROM public.store_stock_targets
    WHERE product_id = v_item.product_id AND store_id = v_count.store_id;

    IF NOT FOUND THEN
      v_items_skipped := v_items_skipped || jsonb_build_array(
        jsonb_build_object('product_id', v_item.product_id, 'reason', 'no_target_defined')
      );
      CONTINUE;
    END IF;

    IF v_total_units >= v_target THEN
      v_items_sufficient := v_items_sufficient + 1;
      CONTINUE;
    END IF;

    v_suggested := v_target - v_total_units;

    IF v_store_type IS DISTINCT FROM 'central' THEN
      IF v_request_id IS NULL THEN
        INSERT INTO public.replenishment_requests (destination_store_id, source_stock_count_id)
        VALUES (v_count.store_id, p_stock_count_id)
        RETURNING id INTO v_request_id;
      END IF;

      INSERT INTO public.replenishment_request_items (request_id, product_id, suggested_quantity)
      VALUES (v_request_id, v_item.product_id, v_suggested);
    END IF;

    v_items_replenished := v_items_replenished + 1;
  END LOOP;

  UPDATE public.stock_counts
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_stock_count_id;

  RETURN jsonb_build_object(
    'stock_count_id',            p_stock_count_id,
    'store_id',                  v_count.store_id,
    'confirmed_at',              now(),
    'items_total',               v_items_total,
    'items_replenished',         v_items_replenished,
    'items_sufficient',          v_items_sufficient,
    'items_skipped',             v_items_skipped,
    'replenishment_request_id',  v_request_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_store_stock(p_store_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(store_id uuid, store_name text, store_type text, product_id uuid, product_name text, stock_category text, total_units integer, target_quantity integer, confirmed_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_store_id IS NOT NULL THEN
    IF NOT (
      public.has_full_stock_access()
      OR (public.is_estoque() AND p_store_id = public.my_store_id())
    ) THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  ELSE
    IF NOT public.has_full_stock_access() THEN
      RAISE EXCEPTION 'Acesso negado: visão consolidada de todas as lojas é admin-only';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (s.id, cp.id)
    s.id,
    s.name,
    s.type,
    cp.id,
    cp.name,
    cp.stock_category,
    sci.total_units,
    sst.target_quantity,
    sc.confirmed_at
  FROM public.stores s
  JOIN public.stock_counts sc ON sc.store_id = s.id AND sc.status = 'confirmed'
  JOIN public.stock_count_items sci ON sci.stock_count_id = sc.id
  JOIN public.catalog_products cp ON cp.id = sci.product_id
  LEFT JOIN public.store_stock_targets sst ON sst.product_id = cp.id AND sst.store_id = s.id
  WHERE (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.id, cp.id, sc.confirmed_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_replenishment_order_status(p_order_id uuid, p_new_status text, p_shipped_quantity integer DEFAULT NULL::integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid;
  v_order record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_order FROM public.replenishment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de reposição não encontrado: %', p_order_id;
  END IF;

  IF NOT (
    public.has_full_stock_access()
    OR (
      public.is_estoque() AND EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = public.my_store_id() AND type = 'central'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe de separação (loja central) ou admin';
  END IF;

  IF v_order.status = 'shipped' THEN
    RAISE EXCEPTION 'Pedido já foi enviado, não pode ser alterado';
  END IF;

  IF p_new_status = 'picking' THEN
    IF v_order.status <> 'open' THEN
      RAISE EXCEPTION 'Transição inválida: pedido não está aberto (status atual: %)', v_order.status;
    END IF;

    UPDATE public.replenishment_orders
    SET status = 'picking', picked_by = v_uid
    WHERE id = p_order_id;

  ELSIF p_new_status = 'shipped' THEN
    IF p_shipped_quantity IS NULL OR p_shipped_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade enviada inválida: %', p_shipped_quantity;
    END IF;

    UPDATE public.replenishment_orders
    SET status = 'shipped',
        shipped_quantity = p_shipped_quantity,
        shipped_at = now(),
        picked_by = COALESCE(picked_by, v_uid)
    WHERE id = p_order_id;

  ELSE
    RAISE EXCEPTION 'Status inválido: %', p_new_status;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_replenishment_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid;
  v_request record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_request FROM public.replenishment_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de reposição não encontrado: %', p_request_id;
  END IF;

  IF NOT (
    public.has_full_stock_access()
    OR (
      public.is_estoque() AND EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = public.my_store_id() AND type = 'central'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe de separação (loja central) ou admin';
  END IF;

  IF v_request.status = 'shipped' THEN
    RAISE EXCEPTION 'Pedido já enviado não pode ser excluído';
  END IF;

  INSERT INTO public.admin_audit_logs (admin_id, entity_type, entity_id, action)
  VALUES (v_uid, 'replenishment_request', p_request_id, 'hard_delete');

  DELETE FROM public.replenishment_requests WHERE id = p_request_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reopen_stock_count(p_stock_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid;
  v_count           record;
  v_request         record;
  v_request_deleted boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_full_stock_access() THEN
    RAISE EXCEPTION 'Acesso negado: requer admin';
  END IF;

  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contagem não encontrada: %', p_stock_count_id;
  END IF;

  IF v_count.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Contagem não está confirmada (status atual: %)', v_count.status;
  END IF;

  SELECT * INTO v_request
  FROM public.replenishment_requests
  WHERE source_stock_count_id = p_stock_count_id;

  IF FOUND AND v_request.status IN ('picking', 'shipped') THEN
    RAISE EXCEPTION 'Não é possível reabrir: o pedido de reposição gerado por esta contagem já está em % — separação/envio em andamento', v_request.status;
  END IF;

  IF FOUND AND v_request.status = 'open' THEN
    DELETE FROM public.replenishment_requests WHERE id = v_request.id;
    v_request_deleted := true;
  END IF;

  UPDATE public.stock_counts
  SET status = 'draft', confirmed_at = NULL
  WHERE id = p_stock_count_id;

  INSERT INTO public.admin_audit_logs (admin_id, entity_type, entity_id, action)
  VALUES (v_uid, 'stock_count', p_stock_count_id, 'reopen');

  RETURN jsonb_build_object(
    'stock_count_id', p_stock_count_id,
    'store_id', v_count.store_id,
    'replenishment_request_deleted', v_request_deleted
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_replenishment_item_picked(p_item_id uuid, p_picked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid;
  v_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_full_stock_access()
    OR (
      public.is_estoque() AND EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = public.my_store_id() AND type = 'central'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe de separação (loja central) ou admin';
  END IF;

  SELECT r.status INTO v_status
  FROM public.replenishment_request_items i
  JOIN public.replenishment_requests r ON r.id = i.request_id
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de reposição não encontrado: %', p_item_id;
  END IF;

  IF v_status <> 'picking' THEN
    RAISE EXCEPTION 'Checklist só pode ser editado com o pedido em separação (status atual: %)', v_status;
  END IF;

  UPDATE public.replenishment_request_items
  SET picked_at = CASE WHEN p_picked THEN now() ELSE NULL END
  WHERE id = p_item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_replenishment_item_shipped_qty(p_item_id uuid, p_shipped_quantity integer DEFAULT NULL::integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid;
  v_item   record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_full_stock_access()
    OR (
      public.is_estoque() AND EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = public.my_store_id() AND type = 'central'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe de separação (loja central) ou admin';
  END IF;

  SELECT i.id, i.suggested_quantity, r.status INTO v_item
  FROM public.replenishment_request_items i
  JOIN public.replenishment_requests r ON r.id = i.request_id
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de reposição não encontrado: %', p_item_id;
  END IF;

  IF v_item.status <> 'picking' THEN
    RAISE EXCEPTION 'Declaração só pode ser feita com o pedido em separação (status atual: %)', v_item.status;
  END IF;

  IF p_shipped_quantity IS NULL THEN
    UPDATE public.replenishment_request_items
    SET shipped_quantity = NULL
    WHERE id = p_item_id;
    RETURN;
  END IF;

  IF p_shipped_quantity < 0 OR p_shipped_quantity > v_item.suggested_quantity THEN
    RAISE EXCEPTION 'Quantidade declarada inválida: % (deve estar entre 0 e o sugerido %)',
      p_shipped_quantity, v_item.suggested_quantity;
  END IF;

  UPDATE public.replenishment_request_items
  SET shipped_quantity = p_shipped_quantity,
      picked_at = COALESCE(picked_at, now())
  WHERE id = p_item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_replenishment_request_status(p_request_id uuid, p_new_status text, p_shipped_items jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid;
  v_request record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_request FROM public.replenishment_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de reposição não encontrado: %', p_request_id;
  END IF;

  IF NOT (
    public.has_full_stock_access()
    OR (
      public.is_estoque() AND EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = public.my_store_id() AND type = 'central'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe de separação (loja central) ou admin';
  END IF;

  IF v_request.status = 'shipped' THEN
    RAISE EXCEPTION 'Pedido já foi enviado, não pode ser alterado';
  END IF;

  IF p_new_status = 'picking' THEN
    IF v_request.status <> 'open' THEN
      RAISE EXCEPTION 'Transição inválida: pedido não está aberto (status atual: %)', v_request.status;
    END IF;

    UPDATE public.replenishment_requests
    SET status = 'picking', picked_by = v_uid
    WHERE id = p_request_id;

  ELSIF p_new_status = 'shipped' THEN
    IF p_shipped_items IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_shipped_items) e
        WHERE (e.value->>'shipped_quantity')::int < 0
      ) THEN
        RAISE EXCEPTION 'Quantidade enviada não pode ser negativa';
      END IF;

      UPDATE public.replenishment_request_items i
      SET shipped_quantity = (e.value->>'shipped_quantity')::int
      FROM jsonb_array_elements(p_shipped_items) e
      WHERE i.id = (e.value->>'item_id')::uuid
        AND i.request_id = p_request_id;
    END IF;

    UPDATE public.replenishment_request_items
    SET shipped_quantity = suggested_quantity
    WHERE request_id = p_request_id AND shipped_quantity IS NULL;

    UPDATE public.replenishment_requests
    SET status = 'shipped', shipped_at = now(), picked_by = COALESCE(picked_by, v_uid)
    WHERE id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Status inválido: %', p_new_status;
  END IF;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. admin_set_user_role / get_system_users — inclui 'administrativo'.
--    store_id continua exclusivo de 'salao' (administrativo nunca tem loja
--    fixa, sempre NULL — vê/escolhe qualquer loja no seletor, como o admin).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id  uuid,
  p_role     text,
  p_store_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: requer admin';
  END IF;

  IF p_role NOT IN ('user', 'admin', 'salao', 'administrativo') THEN
    RAISE EXCEPTION 'Role inválido: %', p_role;
  END IF;

  IF p_store_id IS NOT NULL THEN
    IF p_role <> 'salao' THEN
      RAISE EXCEPTION 'store_id só pode ser atribuído a role=salao';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
      RAISE EXCEPTION 'Loja não encontrada: %', p_store_id;
    END IF;
  END IF;

  UPDATE public.profiles
  SET role     = p_role,
      store_id = CASE WHEN p_role = 'salao' THEN p_store_id ELSE NULL END
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_role(uuid, text, uuid) IS
  'Define role (user/admin/salao/administrativo) e, opcionalmente, store_id '
  'de um usuário salao (colaborador de loja física com acesso ao módulo de '
  'estoque). Admin-only, verificado internamente. store_id sempre NULL para '
  'roles diferentes de salao — administrativo também não tem loja fixa '
  '(acessa todas as lojas do Estoque, como o admin).';

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
  store_name      text
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
    u.last_sign_in_at,
    p.permissions,
    p.store_id,
    s.name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.role IN ('admin', 'salao', 'administrativo')
  ORDER BY p.role ASC, p.created_at DESC;
$$;
