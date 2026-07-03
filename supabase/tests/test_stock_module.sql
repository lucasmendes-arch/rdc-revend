-- =====================================================================
-- Teste: Módulo de Estoque (stores, stock_counts, stock_count_items,
--        store_stock_targets, replenishment_orders, confirm_stock_count,
--        update_replenishment_order_status)
-- Como executar:
--   Supabase Dashboard → SQL Editor → rodar bloco por bloco, NESTA ORDEM,
--   DEPOIS de aplicar as 8 migrations (20260702000002 .. 20260702000009).
-- Admin de teste: lmendescapelini@gmail.com
--                 id = 1e1342b2-c933-49d9-8782-477cfcad0486
-- Roda inteiramente como admin (bypassa a checagem de loja própria nas
-- RPCs) para validar a lógica de negócio. A seção final (Bloco 9+) testa
-- o escopo de RLS por loja e exige a criação prévia de 2 usuários reais
-- com role='salao' + store_id (ver instruções no Bloco 9).
-- Todos os dados de teste usam o prefixo 'ZZTEST' e são removidos no
-- Bloco final de limpeza — rodar o cleanup mesmo se algum teste falhar.
-- =====================================================================

-- ── Bloco 1: Simular sessão admin ────────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e1342b2-c933-49d9-8782-477cfcad0486","role":"authenticated"}',
  true
);
SELECT public.is_admin(); -- Esperado: true

-- ── Bloco 2: Conferir seed de stores ─────────────────────────────────
SELECT slug, name, type FROM public.stores ORDER BY slug;
-- Esperado: 5 linhas — linhares(central), serra/teixeira/colatina/sao-gabriel(satellite)

-- ── Bloco 3: Criar produto de teste com units_per_box = 12 ───────────
INSERT INTO public.catalog_products (name, price, units_per_box, package_type, stock_category)
VALUES ('ZZTEST Produto Caixa 12', 10.00, 12, 'CX', 'ZZTEST')
RETURNING id;
-- Anotar o id retornado como :product_id para os próximos blocos
-- (SQL Editor não suporta variáveis entre blocos — substituir manualmente
-- '00000000-0000-0000-0000-000000000000' pelo id real em todos os blocos abaixo)

-- ── Bloco 4: Cadastrar meta de estoque para a loja Serra ─────────────
INSERT INTO public.store_stock_targets (product_id, store_id, target_quantity)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, s.id, 100
FROM public.stores s WHERE s.slug = 'serra';

-- ── Bloco 5: Criar contagem draft para Serra + item (déficit de 30) ──
-- 5 caixas fechadas * 12 + 10 soltas = 70 (meta 100 => déficit 30)
WITH nova_contagem AS (
  INSERT INTO public.stock_counts (store_id, employee_id)
  SELECT s.id, '1e1342b2-c933-49d9-8782-477cfcad0486'::uuid
  FROM public.stores s WHERE s.slug = 'serra'
  RETURNING id
)
INSERT INTO public.stock_count_items (stock_count_id, product_id, closed_boxes, loose_units)
SELECT nova_contagem.id, '00000000-0000-0000-0000-000000000000'::uuid, 5, 10
FROM nova_contagem
RETURNING stock_count_id, total_units; -- Esperado: total_units = 70

-- Anotar o stock_count_id retornado como :count_id_1

-- ── Bloco 6: Confirmar contagem 1 → esperar déficit de 30 ────────────
SELECT public.confirm_stock_count('00000000-0000-0000-0000-000000000000'::uuid); -- usar :count_id_1
-- Esperado no jsonb: items_total=1, items_replenished=1, items_sufficient=0, items_skipped=[]

SELECT product_id, destination_store_id, suggested_quantity, status
FROM public.replenishment_orders
WHERE product_id = '00000000-0000-0000-0000-000000000000'::uuid; -- usar o product_id do Bloco 3
-- Esperado: 1 linha, suggested_quantity = 30, status = 'open'

-- ── Bloco 7: Reconfirmar a mesma contagem → deve falhar ──────────────
SELECT public.confirm_stock_count('00000000-0000-0000-0000-000000000000'::uuid); -- usar :count_id_1
-- Esperado: ERROR "Contagem já confirmada"

-- ── Bloco 8: Nova contagem com déficit diferente (45) → substitui, não soma
WITH nova_contagem AS (
  INSERT INTO public.stock_counts (store_id, employee_id)
  SELECT s.id, '1e1342b2-c933-49d9-8782-477cfcad0486'::uuid
  FROM public.stores s WHERE s.slug = 'serra'
  RETURNING id
)
INSERT INTO public.stock_count_items (stock_count_id, product_id, closed_boxes, loose_units)
SELECT nova_contagem.id, '00000000-0000-0000-0000-000000000000'::uuid, 4, 7 -- total = 55, déficit = 45
FROM nova_contagem
RETURNING stock_count_id;
-- Anotar como :count_id_2, depois:
-- SELECT public.confirm_stock_count(':count_id_2'::uuid);

SELECT suggested_quantity, status FROM public.replenishment_orders
WHERE product_id = '00000000-0000-0000-0000-000000000000'::uuid;
-- Esperado: AINDA 1 linha (não duas), suggested_quantity = 45 (substituiu, não somou 30+45)

-- ── Bloco 8b: Produto sem units_per_box → deve aparecer em items_skipped
INSERT INTO public.catalog_products (name, price)
VALUES ('ZZTEST Produto Sem Classificação', 5.00)
RETURNING id; -- anotar como :product_id_unclassified

WITH nova_contagem AS (
  INSERT INTO public.stock_counts (store_id, employee_id)
  SELECT s.id, '1e1342b2-c933-49d9-8782-477cfcad0486'::uuid
  FROM public.stores s WHERE s.slug = 'serra'
  RETURNING id
)
INSERT INTO public.stock_count_items (stock_count_id, product_id, closed_boxes, loose_units)
SELECT nova_contagem.id, '00000000-0000-0000-0000-000000000000'::uuid, 1, 0 -- usar :product_id_unclassified
FROM nova_contagem
RETURNING stock_count_id; -- anotar como :count_id_3

SELECT public.confirm_stock_count('00000000-0000-0000-0000-000000000000'::uuid); -- usar :count_id_3
-- Esperado: items_skipped = [{"product_id": "...", "reason": "no_units_per_box"}]

-- ── Bloco 9: Testar update_replenishment_order_status (como admin) ───
-- Pegar o id do pedido gerado no Bloco 8
SELECT id, status FROM public.replenishment_orders
WHERE product_id = '00000000-0000-0000-0000-000000000000'::uuid; -- anotar como :order_id

SELECT public.update_replenishment_order_status('00000000-0000-0000-0000-000000000000'::uuid, 'picking');
-- usar :order_id — esperado: sem erro, status vira 'picking'

SELECT public.update_replenishment_order_status('00000000-0000-0000-0000-000000000000'::uuid, 'shipped', 40);
-- usar :order_id — esperado: sem erro, status vira 'shipped', shipped_quantity=40

SELECT public.update_replenishment_order_status('00000000-0000-0000-0000-000000000000'::uuid, 'picking');
-- usar :order_id — esperado: ERROR "Pedido já foi enviado, não pode ser alterado"

-- =====================================================================
-- Bloco 10 (opcional, requer 2 usuários reais com role='salao' + store_id):
-- Testar escopo de RLS satélite vs. central.
--
-- Pré-requisito: criar (via Dashboard → Authentication, ou create-user)
-- dois usuários reais e rodar como admin:
--   UPDATE profiles SET role='salao', store_id=(SELECT id FROM stores WHERE slug='serra')
--     WHERE id = '<uuid-usuario-serra>';
--   UPDATE profiles SET role='salao', store_id=(SELECT id FROM stores WHERE slug='linhares')
--     WHERE id = '<uuid-usuario-linhares>';
--
-- Depois, simular sessão de cada um e conferir:
--   SELECT set_config('request.jwt.claims', '{"sub":"<uuid-usuario-serra>","role":"authenticated"}', true);
--   SELECT * FROM stock_counts; -- só deve trazer contagens da própria loja (Serra)
--   SELECT * FROM replenishment_orders; -- só deve trazer pedidos com destination_store_id = Serra
--
--   SELECT set_config('request.jwt.claims', '{"sub":"<uuid-usuario-linhares>","role":"authenticated"}', true);
--   SELECT * FROM replenishment_orders; -- deve trazer pedidos de TODAS as lojas de destino
--   SELECT public.update_replenishment_order_status('<order_id_aberto>'::uuid, 'picking'); -- deve funcionar
--
-- Voltar para sessão admin antes de reverter os profiles de teste:
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e1342b2-c933-49d9-8782-477cfcad0486","role":"authenticated"}',
  true
);
-- =====================================================================

-- ── Bloco final: LIMPEZA — rodar sempre, mesmo se algum teste acima falhou
DELETE FROM public.replenishment_orders
WHERE product_id IN (SELECT id FROM public.catalog_products WHERE name LIKE 'ZZTEST%');
DELETE FROM public.stock_count_items
WHERE product_id IN (SELECT id FROM public.catalog_products WHERE name LIKE 'ZZTEST%');
DELETE FROM public.stock_counts
WHERE employee_id = '1e1342b2-c933-49d9-8782-477cfcad0486'::uuid
  AND id NOT IN (SELECT DISTINCT stock_count_id FROM public.stock_count_items); -- só as vazias remanescentes, se houver
DELETE FROM public.store_stock_targets
WHERE product_id IN (SELECT id FROM public.catalog_products WHERE name LIKE 'ZZTEST%');
DELETE FROM public.catalog_products WHERE name LIKE 'ZZTEST%';
