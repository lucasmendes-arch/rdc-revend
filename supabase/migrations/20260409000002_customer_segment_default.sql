-- Migration: 20260409000002_customer_segment_default.sql
-- Objetivo: garantir que todo novo cadastro receba customer_segment = 'wholesale_buyer'
--           e backfillar qualquer NULL remanescente.
--
-- Contexto:
--   A migration 20260408000001 criou a coluna e backfillou usuários existentes
--   (is_partner=true → 'network_partner', is_partner=false → 'wholesale_buyer').
--   Porém o trigger handle_new_user() não foi atualizado, então usuários que se
--   cadastraram após aquela migration ficam com customer_segment = NULL.
--   Esta migration corrige isso.

-- ============================================================================
-- 1. Atualizar trigger handle_new_user() para setar customer_segment default
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, customer_segment)
  VALUES (new.id, 'user', 'wholesale_buyer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. Backfill: NULLs remanescentes → 'wholesale_buyer'
-- Cobre usuários cadastrados entre 20260408000001 e esta migration.
-- Idempotente: só atualiza onde customer_segment IS NULL.
-- ============================================================================

UPDATE public.profiles
SET customer_segment = 'wholesale_buyer'
WHERE role = 'user'
  AND customer_segment IS NULL;
