-- ============================================================================
-- Migration: 20260713000001_delete_replenishment_request_rpc.sql
-- Módulo de Estoque — RPC admin_delete_replenishment_request
--
-- Permite excluir um pedido de reposição consolidado (open/picking) que foi
-- gerado por engano ou não faz mais sentido. shipped é terminal — mesma
-- regra de update_replenishment_request_status — não pode ser excluído,
-- é histórico de envio já concluído.
-- ============================================================================

ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_entity_type_check;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_entity_type_check
  CHECK (entity_type IN ('order', 'client', 'replenishment_request'));

CREATE OR REPLACE FUNCTION public.admin_delete_replenishment_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Mesma autorização de update_replenishment_request_status: admin ou
  -- colaborador de estoque da loja central.
  IF NOT (
    public.is_admin()
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

  -- replenishment_request_items cai em cascata (FK ON DELETE CASCADE).
  DELETE FROM public.replenishment_requests WHERE id = p_request_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_replenishment_request(uuid) IS
  'Exclui um pedido de reposição consolidado (open/picking). shipped é terminal, '
  'não pode ser excluído. Acessível por: authenticated (admin ou estoque da loja '
  'central, verificado internamente).';

REVOKE EXECUTE ON FUNCTION public.admin_delete_replenishment_request(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_replenishment_request(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
