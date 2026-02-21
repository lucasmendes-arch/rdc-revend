-- ============================================================================
-- Orders Schema Migration
-- Tables: orders, order_items
-- RLS Policies for secure data access
-- ============================================================================

-- ============================================================================
-- 1. ORDER_STATUS ENUM
-- ============================================================================

do $$ begin
  create type public.order_status as enum (
    'recebido',
    'separacao',
    'enviado',
    'concluido',
    'cancelado'
  );
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- 2. ORDERS TABLE
-- ============================================================================

create table public.orders (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid not null references auth.users on delete cascade,
  status            public.order_status not null default 'recebido',
  subtotal          numeric(10,2) not null,
  shipping          numeric(10,2) not null default 0,
  total             numeric(10,2) not null,
  customer_name     text not null,
  customer_whatsapp text not null,
  customer_email    text not null,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Enable RLS on orders
alter table public.orders enable row level security;

-- RLS: Users can select/insert their own orders
create policy "users_select_own_orders" on public.orders
  for select using (auth.uid() = user_id);

create policy "users_insert_own_orders" on public.orders
  for insert with check (auth.uid() = user_id);

-- RLS: Admins can select all orders
create policy "admin_select_all_orders" on public.orders
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- RLS: Admins can update all orders
create policy "admin_update_orders" on public.orders
  for update using (
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

-- Trigger: Auto-update updated_at on orders UPDATE
create or replace function public.update_orders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_update_timestamp on public.orders;
create trigger orders_update_timestamp
  before update on public.orders
  for each row
  execute procedure public.update_orders_updated_at();

-- Indexes
create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_created_at on public.orders(created_at desc);
create index idx_orders_status on public.orders(status);

-- ============================================================================
-- 3. ORDER_ITEMS TABLE
-- ============================================================================

create table public.order_items (
  id                    uuid default gen_random_uuid() primary key,
  order_id              uuid not null references public.orders on delete cascade,
  product_id            uuid references public.catalog_products on delete set null,
  product_name_snapshot text not null,
  unit_price_snapshot   numeric(10,2) not null,
  qty                   int not null check (qty > 0),
  line_total            numeric(10,2) not null,
  created_at            timestamptz default now()
);

-- Enable RLS on order_items
alter table public.order_items enable row level security;

-- RLS: Users can select their own order items (via orders join)
create policy "users_select_own_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id and orders.user_id = auth.uid()
    )
  );

-- RLS: Users can insert items to their own orders
create policy "users_insert_own_order_items" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id and orders.user_id = auth.uid()
    )
  );

-- RLS: Admins can select all order items
create policy "admin_select_all_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- RLS: Admins can manage all order items
create policy "admin_manage_order_items" on public.order_items
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

-- Indexes
create index idx_order_items_order_id on public.order_items(order_id);
create index idx_order_items_product_id on public.order_items(product_id);
