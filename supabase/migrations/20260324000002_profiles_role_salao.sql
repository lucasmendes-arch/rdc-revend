-- ============================================================================
-- Migration: 20260324000002_profiles_role_salao.sql
-- BLOCO 3A — Expandir CHECK de profiles.role para incluir 'salao'
--
-- O constraint profiles_role_check existente no banco restringe os valores
-- de role. Esta migration expande para incluir 'salao'.
--
-- Retrocompatibilidade:
--   - Valores existentes ('user', 'admin') continuam válidos
--   - Apenas adição de novo valor permitido
-- ============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'salao'));
