-- ============================================================================
-- Migration: 20260707000004_stock_counts_employee_name.sql
-- Módulo de Estoque — nome do colaborador que fez a contagem
--
-- employee_id aponta pro login usado (auth.users/profiles), mas o login de
-- uma loja satélite costuma ser compartilhado entre várias pessoas — não dá
-- pra saber quem de fato contou. employee_name é preenchido por um popup no
-- início da contagem (texto livre, digitado pelo colaborador) e complementa
-- (não substitui) employee_id.
--
-- Retrocompatibilidade: coluna nova, nullable, sem default — contagens
-- antigas continuam com employee_name NULL; a tela de histórico cai de
-- volta pro nome do profile via employee_id nesse caso.
-- ============================================================================

ALTER TABLE public.stock_counts
  ADD COLUMN IF NOT EXISTS employee_name text;

COMMENT ON COLUMN public.stock_counts.employee_name IS
  'Nome digitado pelo colaborador no popup ao iniciar a contagem — '
  'complementa employee_id, que só identifica o login (compartilhado entre '
  'pessoas da mesma loja), não a pessoa física.';
