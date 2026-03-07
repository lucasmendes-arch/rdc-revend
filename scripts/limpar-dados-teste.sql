-- Limpeza para producao - RDC Revend
-- Roda no Supabase Dashboard -> SQL Editor

-- 1. Pedidos
DELETE FROM public.order_items;
DELETE FROM public.orders;

-- 2. Sessoes de navegacao
DELETE FROM public.client_sessions;

-- 3. Rate limits
DELETE FROM public.rate_limits;

-- 4. Perfis - mantem apenas lmendescapelini@gmail.com
DELETE FROM public.profiles
WHERE id IN (
  SELECT p.id FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email != 'lmendescapelini@gmail.com'
);

-- 5. Usuarios auth - mantem apenas lmendescapelini@gmail.com
DELETE FROM auth.users
WHERE email != 'lmendescapelini@gmail.com';

-- 6. Estoque - reseta para 100 apenas produtos ativos
UPDATE public.inventory
SET quantity = 100
WHERE product_id IN (
  SELECT id FROM public.catalog_products WHERE is_active = true
);
