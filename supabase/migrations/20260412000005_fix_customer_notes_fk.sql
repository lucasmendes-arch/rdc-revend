-- =============================================================================
-- Migration: 20260412000005_fix_customer_notes_fk.sql
-- Objetivo: corrigir FK de customer_notes.customer_id.
--
-- Problema anterior (20260412000002):
--   customer_notes.customer_id foi criado com FK → auth.users(id).
--   A preferência do projeto é referenciar profiles(id), que é a entidade
--   de negócio. auth.users é infraestrutura de autenticação.
--
-- Correção:
--   1. Remove a constraint atual (customer_notes_customer_id_fkey).
--   2. Recria a FK apontando para profiles(id) ON DELETE CASCADE.
--
-- Segurança de dados:
--   - Não há perda de dados: profiles.id = auth.users.id (garantido por
--     trigger handle_new_user). Os UUIDs existentes permanecem válidos.
--   - ON DELETE CASCADE é preservado: apagar o profile (e portanto o user)
--     remove as notas associadas, comportamento idêntico ao anterior.
--
-- Obs: O nome da constraint auto-gerada pelo Postgres para a FK criada em
--      20260412000002 é customer_notes_customer_id_fkey.
-- =============================================================================

ALTER TABLE public.customer_notes
  DROP CONSTRAINT IF EXISTS customer_notes_customer_id_fkey;

ALTER TABLE public.customer_notes
  ADD CONSTRAINT customer_notes_customer_id_fkey
    FOREIGN KEY (customer_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE;

COMMENT ON COLUMN public.customer_notes.customer_id IS
  'FK para profiles.id (= auth.users.id). ON DELETE CASCADE: remover o profile apaga as notas.';
