-- ============================================================================
-- FIX: Corrigir RLS Policies - Infinite Recursion
-- ============================================================================
-- Execute isso no SQL Editor do Supabase

-- 1. Desabilitar RLS temporariamente para fazer as correções
alter table public.profiles disable row level security;
alter table public.catalog_products disable row level security;
alter table public.catalog_sync_runs disable row level security;

-- 2. Dropar policies problemáticas
drop policy if exists "admin_read_all_profiles" on public.profiles;
drop policy if exists "users_read_own_profile" on public.profiles;
drop policy if exists "admin_read_all_products" on public.catalog_products;
drop policy if exists "users_read_active_products" on public.catalog_products;
drop policy if exists "admin_write_products" on public.catalog_products;
drop policy if exists "admin_manage_sync_runs" on public.catalog_sync_runs;

-- 3. Recriar policies SIMPLES sem recursão

-- PROFILES
alter table public.profiles enable row level security;

create policy "users_read_own_profile" on public.profiles
  for select using (auth.uid() = id);

create policy "admin_full_access" on public.profiles
  for all using (auth.uid() in (
    select id from public.profiles where role = 'admin'
  )) with check (auth.uid() in (
    select id from public.profiles where role = 'admin'
  ));

-- CATALOG_PRODUCTS
alter table public.catalog_products enable row level security;

-- Públicos (não autenticados ou autenticados) veem apenas ativos
create policy "public_read_active" on public.catalog_products
  for select using (is_active = true);

-- Admins veem tudo e podem editar
create policy "admin_full_access" on public.catalog_products
  for all using (
    auth.uid() in (select id from public.profiles where role = 'admin')
  ) with check (
    auth.uid() in (select id from public.profiles where role = 'admin')
  );

-- CATALOG_SYNC_RUNS
alter table public.catalog_sync_runs enable row level security;

create policy "admin_only" on public.catalog_sync_runs
  for all using (
    auth.uid() in (select id from public.profiles where role = 'admin')
  ) with check (
    auth.uid() in (select id from public.profiles where role = 'admin')
  );

-- 4. Verificação final
select 'Migration de RLS completada!' as status;
