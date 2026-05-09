-- =====================================================================
-- Teste: get_seller_commission_summary
-- O que testa: RPC que retorna pedidos finalizados (pago + concluido)
--              de um vendedor num período, com totais e comissão calculada
-- Como executar:
--   Supabase Dashboard → SQL Editor → rodar bloco por bloco
-- Vendedor de teste: Lindomar Reis (LINDOMAR) — commission_pct = 5%
--                    id = 85b98124-fb47-4896-b62d-e9b048fc9d20
-- Admin de teste: lmendescapelini@gmail.com
--                 id = 1e1342b2-c933-49d9-8782-477cfcad0486
-- =====================================================================


-- ── Bloco 1: Simular sessão admin (rodar ANTES de todos os testes) ───
-- Isso faz auth.uid() retornar o UUID do Lucas (admin) nesta sessão
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e1342b2-c933-49d9-8782-477cfcad0486","role":"authenticated"}',
  true
);
-- Verificar: deve retornar true
SELECT public.is_admin();


-- ── Bloco 2: Caminho feliz — Lindomar com pedidos em 2026 ───────────
SELECT public.get_seller_commission_summary(
  p_seller_id  := '85b98124-fb47-4896-b62d-e9b048fc9d20'::uuid,
  p_start_date := '2026-01-01'::date,
  p_end_date   := '2026-12-31'::date
);
-- Esperado:
--   seller.name = 'Lindomar Reis'
--   seller.commission_pct = 5
--   summary.total_orders >= 17
--   summary.commission_amount = round(total_value * 5 / 100, 2)
--   orders[] com status apenas 'pago' ou 'concluido'


-- ── Bloco 3: Verificar cálculo manual de comissão ───────────────────
-- Comparar com a query direta para confirmar que a RPC bate
SELECT
  count(*)                            AS total_pedidos,
  sum(total)                          AS total_bruto,
  round(sum(total) * 5 / 100.0, 2)   AS comissao_esperada_5pct
FROM orders
WHERE seller_id = '85b98124-fb47-4896-b62d-e9b048fc9d20'
  AND status IN ('pago', 'concluido')
  AND created_at::date BETWEEN '2026-01-01' AND '2026-12-31';
-- O valor de comissao_esperada_5pct deve bater com summary.commission_amount do Bloco 2


-- ── Bloco 4: Confirmar que statuses excluídos NÃO aparecem ──────────
-- Checar todos os status do Lindomar para garantir que a RPC filtra certo
SELECT status, count(*) AS total
FROM orders
WHERE seller_id = '85b98124-fb47-4896-b62d-e9b048fc9d20'
GROUP BY status
ORDER BY status;
-- 'pago' e 'concluido' devem aparecer na RPC; os outros, não


-- ── Bloco 5: Período sem pedidos (deve retornar orders=[]) ───────────
SELECT public.get_seller_commission_summary(
  p_seller_id  := '85b98124-fb47-4896-b62d-e9b048fc9d20'::uuid,
  p_start_date := '2020-01-01'::date,
  p_end_date   := '2020-12-31'::date
);
-- Esperado: orders = [], summary.total_orders = 0, commission_amount = 0.00


-- ── Bloco 6: Vendedor inexistente (deve lançar EXCEPTION) ────────────
SELECT public.get_seller_commission_summary(
  p_seller_id  := '00000000-0000-0000-0000-000000000000'::uuid,
  p_start_date := '2026-01-01'::date,
  p_end_date   := '2026-12-31'::date
);
-- Esperado: ERROR — "Vendedor não encontrado ou inativo"


-- ── Bloco 7: Sem sessão de admin (deve rejeitar) ─────────────────────
-- Limpar a sessão simulada
SELECT set_config('request.jwt.claims', '{}', true);
SELECT public.get_seller_commission_summary(
  p_seller_id  := '85b98124-fb47-4896-b62d-e9b048fc9d20'::uuid,
  p_start_date := '2026-01-01'::date,
  p_end_date   := '2026-12-31'::date
);
-- Esperado: ERROR — "Acesso negado"


-- ── Bloco 8: Inserir pedido de teste e confirmar que aparece ─────────
-- Restaurar sessão admin antes
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e1342b2-c933-49d9-8782-477cfcad0486","role":"authenticated"}',
  true
);

INSERT INTO orders (
  user_id, seller_id, status, subtotal, shipping, total,
  customer_name, customer_whatsapp, customer_email, origin
)
VALUES (
  '1e1342b2-c933-49d9-8782-477cfcad0486',
  '85b98124-fb47-4896-b62d-e9b048fc9d20',
  'concluido', 1000.00, 0, 1000.00,
  'TESTE COMISSAO', '27999999999', 'teste-comissao@rdc.test', 'site'
);

-- Rodar RPC e confirmar que o total_orders aumentou 1
SELECT public.get_seller_commission_summary(
  p_seller_id  := '85b98124-fb47-4896-b62d-e9b048fc9d20'::uuid,
  p_start_date := '2026-01-01'::date,
  p_end_date   := '2026-12-31'::date
) -> 'summary';
-- Esperado: total_orders = contagem anterior + 1
--           total_value aumentou 1000.00
--           commission_amount aumentou 50.00 (5% de 1000)


-- ── Bloco 9: Limpeza ─────────────────────────────────────────────────
DELETE FROM orders
WHERE customer_email = 'teste-comissao@rdc.test'
  AND customer_name  = 'TESTE COMISSAO';

-- Confirmar limpeza
SELECT count(*) AS deve_ser_zero
FROM orders
WHERE customer_email = 'teste-comissao@rdc.test';
