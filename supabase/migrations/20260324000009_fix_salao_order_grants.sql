-- ============================================================================
-- Migration: 20260324000009_fix_salao_order_grants.sql
-- BLOCO 3A — Fix: Permissões da RPC de Criação de Pedido
--
-- Problema:
-- A Migration 05 destruiu a assinatura anterior com um DROP FUNCTION IF EXISTS
-- sem transferir as permissões (GRANT EXECUTE) de execução da função.
-- Isso causou 404/400 Bad Request via Supabase PostgREST api, isolando a
-- função do frontend autenticado.
--
-- Correção:
-- 1. Restabelece o bloqueio global (REVOKE de PUBLIC).
-- 2. Concede EXECUTE explícito à role autenticada.
-- 3. Injeta NOTIFY no listener do PostgREST para forçar cache schema reload.
-- ============================================================================

DO $$
BEGIN
  -- 1. Revogar permissão pública de disparo
  REVOKE EXECUTE ON FUNCTION public.create_salao_order FROM PUBLIC;
  
  -- 2. Autorizar o App Auth Client
  GRANT EXECUTE ON FUNCTION public.create_salao_order TO authenticated;
END
$$;

-- 3. Comandar o PostgREST a recarregar as assinaturas ativas na API
NOTIFY pgrst, 'reload schema';
