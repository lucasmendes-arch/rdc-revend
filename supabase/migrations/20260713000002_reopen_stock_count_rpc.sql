-- ============================================================================
-- Migration: 20260713000002_reopen_stock_count_rpc.sql
-- Módulo de Estoque — RPC admin_reopen_stock_count
--
-- Permite reabrir uma contagem já confirmada (erro do colaborador, produto
-- esquecido, etc). status volta pra 'draft' e confirmed_at zera — a contagem
-- fica editável de novo (RLS de stock_count_items já trava em status=draft).
--
-- Efeito colateral: a confirmação original pode ter gerado um pedido de
-- reposição consolidado (confirm_stock_count). Se ele ainda estiver 'open',
-- é apagado (será regerado do zero quando a contagem for reconfirmada). Se
-- já estiver 'picking'/'shipped', a reabertura é bloqueada — não faz sentido
-- reabrir uma contagem cuja reposição já está sendo separada/enviada.
-- ============================================================================

ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_entity_type_check;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_entity_type_check
  CHECK (entity_type IN ('order', 'client', 'replenishment_request', 'stock_count'));

CREATE OR REPLACE FUNCTION public.admin_reopen_stock_count(p_stock_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: requer admin';
  END IF;

  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contagem não encontrada: %', p_stock_count_id;
  END IF;

  IF v_count.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Contagem não está confirmada (status atual: %)', v_count.status;
  END IF;

  -- Pedido de reposição gerado por esta confirmação (se algum item ficou
  -- abaixo da meta). Ver confirm_stock_count().
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
$$;

COMMENT ON FUNCTION public.admin_reopen_stock_count(uuid) IS
  'Reabre uma contagem confirmada (status volta pra draft). Admin-only. '
  'Bloqueia se o pedido de reposição gerado por ela já estiver picking/shipped; '
  'se estiver open, apaga (regerado na próxima confirmação).';

REVOKE EXECUTE ON FUNCTION public.admin_reopen_stock_count(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_reopen_stock_count(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
