-- ============================================================================
-- Migration: 20260324000006_sellers_rls_salao.sql
-- BLOCO 3A — Fix: Permissão de leitura de vendedores para o salão
--
-- Problema: A listagem de vendedores retornava vazia no frontend do salão
--           pois o RLS (Row Level Security) da tabela `sellers`
--           provavelmente restringia a leitura ao admin.
--
-- Fix: Adicionar política permitindo SELECT para a role `salao`.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sellers' AND policyname = 'Vendedores visíveis para salao'
  ) THEN
    CREATE POLICY "Vendedores visíveis para salao"
      ON public.sellers
      FOR SELECT
      TO authenticated
      USING ( public.is_salao() );
  END IF;
END
$$;
