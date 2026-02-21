-- ============================================================================
-- FIX: Verificar e corrigir profiles/trigger, criar usuários admin e teste
-- Execute isso no SQL Editor do Supabase
-- ============================================================================

-- 1. Verificar trigger
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
-- WHERE trigger_schema = 'public';

-- 2. Ver todos os usuários do Auth que não tem profile ainda
-- SELECT id, email FROM auth.users
-- WHERE id NOT IN (SELECT id FROM public.profiles);

-- 3. Criar profiles para todos os usuários que não têm
INSERT INTO public.profiles (id, role)
SELECT id, 'admin' FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- 4. Atualizar todos os profiles para admin (temporariamente, para teste)
UPDATE public.profiles SET role = 'admin';

-- 5. Verificar profiles criados
SELECT id, role, (SELECT email FROM auth.users WHERE auth.users.id = profiles.id) as email
FROM public.profiles;

-- 6. Verificar quantos produtos existem
SELECT COUNT(*) as total_produtos FROM public.catalog_products;

-- 7. Se tabela vazia, criar produtos de teste
-- Se já tem produtos, pular esta parte
INSERT INTO public.catalog_products (
  name, nuvemshop_product_id, price, compare_at_price,
  description_html, main_image, is_active, source
)
SELECT
  name, nuvemshop_product_id, price, compare_at_price,
  description_html, main_image, is_active, source
FROM (VALUES
  ('Revenda De Cachos - Shampoo', 1001::bigint, 49.90, 79.90,
   '<p>Shampoo para cabelos cacheados. Limpa suavemente sem ressecar.</p>',
   'https://via.placeholder.com/300?text=Shampoo', true, 'manual'),
  ('Revenda De Cachos - Condicionador', 1002::bigint, 49.90, 79.90,
   '<p>Condicionador intenso para hidratação profunda.</p>',
   'https://via.placeholder.com/300?text=Condicionador', true, 'manual'),
  ('Revenda De Cachos - Leave-in', 1003::bigint, 39.90, 69.90,
   '<p>Leave-in para definição e controle de frizz.</p>',
   'https://via.placeholder.com/300?text=Leave-in', true, 'manual'),
  ('Revenda De Cachos - Gel', 1004::bigint, 29.90, 59.90,
   '<p>Gel fixador com brilho natural.</p>',
   'https://via.placeholder.com/300?text=Gel', true, 'manual'),
  ('Revenda De Cachos - Kit Completo', 1005::bigint, 149.90, 279.90,
   '<p>Kit com todos os produtos para cabelos cacheados.</p>',
   'https://via.placeholder.com/300?text=Kit', true, 'manual')
) AS v(name, nuvemshop_product_id, price, compare_at_price, description_html, main_image, is_active, source)
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_products WHERE nuvemshop_product_id = v.nuvemshop_product_id);

-- 8. Resultado final
SELECT '✅ Profiles e produtos corrigidos!' as status;
SELECT COUNT(*) as total_profiles FROM public.profiles;
SELECT COUNT(*) as total_products FROM public.catalog_products;
