-- ============================================================================
-- Arquivar vendedor
--
-- Excluir um vendedor apaga o vínculo dele com o histórico (orders.seller_id
-- e profiles.assigned_seller_id são ON DELETE SET NULL). Arquivar tira o
-- vendedor de uso sem perder quem vendeu o quê.
--
-- Regras (garantidas no banco, não só na tela):
--   1. Arquivado é sempre inativo → some de get_active_sellers_for_dropdown,
--      que já filtra por active = true.
--   2. O vendedor padrão não pode ser arquivado: ele é o fallback de pedido
--      sem vendedor (create_salon_order). Troque o padrão antes.
--
-- Retrocompatível: coluna nullable, sem default; nenhuma linha existente muda.
-- ============================================================================

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.sellers.archived_at IS
  'Quando o vendedor foi arquivado. NULL = em uso. Arquivado implica active = false e is_default = false.';

ALTER TABLE public.sellers
  DROP CONSTRAINT IF EXISTS sellers_archived_is_inactive;
ALTER TABLE public.sellers
  ADD CONSTRAINT sellers_archived_is_inactive
  CHECK (archived_at IS NULL OR (active = false AND is_default = false));
