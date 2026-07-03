-- ============================================================================
-- Migration: 20260703000003_stock_categories_salao_read.sql
-- Módulo de Estoque — leitura de stock_categories para colaborador de loja
--
-- Bug: a única policy de stock_categories era admin-only (20260702000011),
-- criada quando a tabela servia só à tela /estoque/config. Depois, a tela de
-- contagem (/estoque/contagem/:id) passou a ler sort_order e color_index
-- dela — mas para o colaborador (role=salao, via is_estoque()) o RLS
-- filtrava todas as linhas silenciosamente: sem erro, array vazio. Efeito:
-- cores das categorias não apareciam (tudo caía na cor 0 da paleta) e a
-- ordem manual das categorias virava alfabética.
--
-- Fix: SELECT liberado para o colaborador do módulo de estoque. Tabela de
-- lookup sem dado sensível; escrita continua admin-only.
-- ============================================================================

DROP POLICY IF EXISTS "stock_categories_estoque_select" ON public.stock_categories;

CREATE POLICY "stock_categories_estoque_select" ON public.stock_categories
  FOR SELECT TO authenticated
  USING (public.is_estoque());
