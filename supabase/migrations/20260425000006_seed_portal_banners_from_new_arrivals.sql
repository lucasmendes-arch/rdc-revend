-- Migra os produtos is_new_arrival=true para a tabela portal_banners
-- Executa apenas se a tabela ainda estiver vazia (idempotente)

INSERT INTO public.portal_banners (title, badge_text, image_url, redirect_url, is_active, sort_order)
SELECT
  name,
  'Lançamento',
  main_image,
  '/catalogo',
  true,
  (ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1)::integer
FROM public.catalog_products
WHERE is_new_arrival = true
  AND is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.portal_banners LIMIT 1);
