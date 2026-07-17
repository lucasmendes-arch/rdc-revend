-- =====================================================================
-- Teste: job_roles (catálogo de cargos) + snapshot em job_openings
-- O que testa: CHECK de consistência compensation_type/fixed_amount/
--              variable_percentage, criação de vaga copiando snapshot
--              de um cargo, retrocompatibilidade (vaga manual sem cargo),
--              ON DELETE RESTRICT de job_role referenciado por job_opening
-- Migration: supabase/migrations/20260718000003_rh_job_roles.sql
-- Como executar:
--   Supabase Dashboard → SQL Editor → rodar bloco por bloco
--   (rodando como admin/service role — RLS de job_roles/job_openings
--    exige has_rh_access(), então em sessão normal simule admin como
--    no Bloco 1 de test_get_seller_commission_summary.sql)
-- Store de teste usado nos exemplos: substituir pelo id de uma loja real
--   SELECT id, name FROM stores LIMIT 1;
-- Todas as linhas de teste usam o prefixo 'TESTE CARGO' para facilitar limpeza.
-- =====================================================================


-- ── Bloco 1: Caminho feliz — remuneração fixa ────────────────────────
INSERT INTO job_roles (title, contract_type, compensation_type, fixed_amount, work_schedule, workload_hours, description, requirements, benefits)
VALUES ('TESTE CARGO Vendedor Fixa', 'clt', 'fixa', 1800.00, 'Seg-Sex 08h-18h', 44, 'Vende produtos no balcao', 'Experiencia em vendas', 'VT, VR')
RETURNING id, title, contract_type, compensation_type, fixed_amount, variable_percentage, is_active;
-- Esperado: insere normalmente, variable_percentage = NULL, is_active = true


-- ── Bloco 2: CHECK deve bloquear fixa + variable_percentage setado ───
INSERT INTO job_roles (title, contract_type, compensation_type, fixed_amount, variable_percentage)
VALUES ('TESTE CARGO Invalido 1', 'mei', 'fixa', 1000, 5.0);
-- Esperado: ERROR 23514 — violates check constraint "job_roles_compensation_consistency"


-- ── Bloco 3: CHECK deve bloquear variavel sem variable_percentage ────
INSERT INTO job_roles (title, contract_type, compensation_type)
VALUES ('TESTE CARGO Invalido 2', 'mei', 'variavel');
-- Esperado: ERROR 23514 — violates check constraint "job_roles_compensation_consistency"


-- ── Bloco 4: Caminho feliz — remuneração mista (fixo + variável) ─────
INSERT INTO job_roles (title, contract_type, compensation_type, fixed_amount, variable_percentage, variable_basis)
VALUES ('TESTE CARGO Vendedor Mista', 'clt', 'mista', 1400.00, 3.5, 'sobre vendas liquidas')
RETURNING id, compensation_type, fixed_amount, variable_percentage;
-- Esperado: insere normalmente com os dois valores preenchidos


-- ── Bloco 5: Vaga copiando snapshot do cargo (fluxo do select em Vagas) ─
-- Ajustar o store_id para um id real de `stores` antes de rodar
INSERT INTO job_openings (store_id, role_title, job_role_id, description, contract_type, compensation_type, fixed_amount, work_schedule, workload_hours, requirements, benefits)
SELECT '<STORE_ID_REAL>'::uuid, title, id, description, contract_type, compensation_type, fixed_amount, work_schedule, workload_hours, requirements, benefits
FROM job_roles WHERE title = 'TESTE CARGO Vendedor Fixa'
RETURNING id, role_title, job_role_id, contract_type, compensation_type, fixed_amount;
-- Esperado: vaga criada com os campos descritivos copiados do cargo (snapshot)


-- ── Bloco 6: Vaga manual sem cargo vinculado (retrocompatibilidade) ──
INSERT INTO job_openings (store_id, role_title)
VALUES ('<STORE_ID_REAL>'::uuid, 'TESTE CARGO Vaga Manual')
RETURNING id, role_title, job_role_id, contract_type, compensation_type;
-- Esperado: cria normalmente com job_role_id, contract_type, compensation_type etc. = NULL


-- ── Bloco 7: editar o cargo depois NÃO deve alterar a vaga já criada ─
UPDATE job_roles SET fixed_amount = 9999.00 WHERE title = 'TESTE CARGO Vendedor Fixa';

SELECT role_title, fixed_amount FROM job_openings WHERE role_title = 'TESTE CARGO Vendedor Fixa';
-- Esperado: fixed_amount da vaga continua 1800.00 (snapshot), não 9999.00


-- ── Bloco 8: ON DELETE RESTRICT — não pode excluir cargo com vaga vinculada ─
DELETE FROM job_roles WHERE title = 'TESTE CARGO Vendedor Fixa';
-- Esperado: ERROR 23503 — foreign key constraint "job_openings_job_role_id_fkey"
-- (é esse erro que o frontend Cargos.tsx captura pra sugerir "desative em vez de excluir")


-- ── Bloco 9: Desativar cargo (soft delete) funciona normalmente ─────
UPDATE job_roles SET is_active = false WHERE title = 'TESTE CARGO Vendedor Mista'
RETURNING title, is_active;
-- Esperado: is_active = false — cargo some do select de novas vagas mas não é apagado


-- ── Bloco 10: Limpeza ──────────────────────────────────────────────
DELETE FROM job_openings WHERE role_title LIKE 'TESTE CARGO%';
DELETE FROM job_roles WHERE title LIKE 'TESTE CARGO%';

-- Confirmar limpeza
SELECT count(*) AS deve_ser_zero FROM job_roles WHERE title LIKE 'TESTE CARGO%'
UNION ALL
SELECT count(*) FROM job_openings WHERE role_title LIKE 'TESTE CARGO%';
