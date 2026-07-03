-- ============================================================================
-- Migration: 20260702000003_stores_table.sql
-- Módulo de Estoque — Etapa 2: tabela stores
--
-- Implementa:
--   1. Tabela stores (lojas físicas para contagem/reposição)
--   2. FK física profiles.store_id -> stores.id
--   3. Seed das 5 lojas
--   4. RLS: admin gerencia tudo; colaborador de estoque lê todas as lojas
--
-- Nota de design (ver docs/decisions.md, D-20):
--   Já existe pickup_units (leitura pública, usada no checkout) com os
--   mesmos 5 nomes de loja. stores é uma tabela NOVA e separada — sem FK
--   física a pickup_units — porque pickup_units é publicamente legível e
--   serve a um propósito diferente (endereço de retirada de pedido). Os
--   slugs são os mesmos por consistência, seguindo o mesmo padrão de
--   "FK lógica por slug" já usado em orders.pickup_unit_slug.
--
-- Retrocompatibilidade:
--   - Tabela nova, nenhum dado existente afetado
--   - profiles.store_id já existia (nullable) desde 20260702000002
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela stores
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('central', 'satellite')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stores IS
  'Lojas físicas do módulo de estoque (contagem e reposição). Slugs '
  'alinhados com pickup_units (mesmos valores), porém SEM FK física entre '
  'as duas tabelas — pickup_units serve ao checkout (leitura pública), '
  'stores serve ao módulo de contagem/reposição (autenticado). Ver D-20 em docs/decisions.md.';

-- ----------------------------------------------------------------------------
-- 2. FK física profiles.store_id -> stores.id
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_store_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. Seed das 5 lojas (mesmos slugs de pickup_units, sem FK física)
-- ----------------------------------------------------------------------------
INSERT INTO public.stores (slug, name, type) VALUES
  ('linhares',    'Linhares',             'central'),
  ('serra',       'Serra',                'satellite'),
  ('teixeira',    'Teixeira de Freitas',  'satellite'),
  ('colatina',    'Colatina',             'satellite'),
  ('sao-gabriel', 'São Gabriel da Palha', 'satellite')
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_admin_all" ON public.stores
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Leitura de TODAS as lojas para qualquer colaborador de estoque (não só a
-- própria) — a equipe de separação em Linhares precisa exibir o nome de
-- todas as lojas satélite como destino de replenishment_orders.
CREATE POLICY "stores_estoque_read" ON public.stores
  FOR SELECT TO authenticated
  USING (public.is_estoque());
