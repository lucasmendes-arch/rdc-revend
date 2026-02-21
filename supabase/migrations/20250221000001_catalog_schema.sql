-- ============================================================================
-- Catalog Schema Migration
-- Tables: profiles, catalog_products, catalog_sync_runs
-- RLS Policies for secure data access
-- ============================================================================

-- ============================================================================
-- 1. PROFILES TABLE (admin role management)
-- ============================================================================

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text default 'user' not null check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- RLS: Users can read their own profile
create policy "users_read_own_profile" on public.profiles
  for select using (auth.uid() = id);

-- RLS: Admins can read all profiles
create policy "admin_read_all_profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Trigger: Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 2. CATALOG_PRODUCTS TABLE
-- ============================================================================

create table public.catalog_products (
  id uuid default gen_random_uuid() primary key,
  nuvemshop_product_id bigint unique,
  name text not null,
  description_html text,
  price numeric(10,2) not null default 0,
  compare_at_price numeric(10,2),
  images text[],
  main_image text,
  is_active boolean default true,
  source text default 'nuvemshop',
  updated_from_source_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on catalog_products
alter table public.catalog_products enable row level security;

-- RLS: Authenticated users can read only active products
create policy "users_read_active_products" on public.catalog_products
  for select using (
    auth.role() = 'authenticated' and is_active = true
  );

-- RLS: Admins can read all products (active and inactive)
create policy "admin_read_all_products" on public.catalog_products
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- RLS: Admins can insert/update/delete products
create policy "admin_write_products" on public.catalog_products
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Index on frequently queried columns
create index idx_catalog_products_is_active on public.catalog_products(is_active);
create index idx_catalog_products_nuvemshop_id on public.catalog_products(nuvemshop_product_id);

-- ============================================================================
-- 3. CATALOG_SYNC_RUNS TABLE (track synchronization history)
-- ============================================================================

create table public.catalog_sync_runs (
  id uuid default gen_random_uuid() primary key,
  status text not null check (status in ('running', 'success', 'error')),
  imported int default 0,
  updated int default 0,
  skipped int default 0,
  errors int default 0,
  error_message text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Enable RLS on catalog_sync_runs
alter table public.catalog_sync_runs enable row level security;

-- RLS: Only admins can manage sync runs
create policy "admin_manage_sync_runs" on public.catalog_sync_runs
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Index for sync history
create index idx_catalog_sync_runs_started_at on public.catalog_sync_runs(started_at desc);

-- ============================================================================
-- Helpful views/functions for the future
-- ============================================================================

-- View: Last sync run status
create or replace view public.last_sync_run as
select * from public.catalog_sync_runs
order by started_at desc
limit 1;
