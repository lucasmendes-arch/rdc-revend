-- =====================================================================
-- Teste: módulo Departamento Pessoal (DP)
-- O que testa: RPC promote_candidate_to_dp (criação de employee_processes
--              + checklist de employee_documents + cópia de employee_timeline
--              a partir de candidate_stage_history), bloqueio de dupla
--              promoção (índice único parcial), trigger de sincronização
--              status/activated_at a partir de current_stage, CHECK composto
--              de current_stage por employment_type (etapa única "contratacao"
--              concentrando o checklist de documentos/exame/onboarding/
--              treinamento/contrato), employment_type simplificado pra
--              'clt'/'mei' (job_roles.requires_experience decide sozinho se o
--              processo MEI passa pela trilha de formação), e a RPC
--              register_existing_employee (cadastro retroativo, sem passar
--              pelo RH).
-- Migrations: 20260718000011 → 20260718000015 (módulo DP completo)
-- Como executar:
--   Supabase Dashboard → SQL Editor → rodar bloco por bloco
-- Admin de teste: lmendescapelini@gmail.com
--                 id = 1e1342b2-c933-49d9-8782-477cfcad0486
-- Store de teste: substituir '<STORE_ID_REAL>' por um id real de `stores`
--   SELECT id, name FROM stores LIMIT 1;
-- Todas as linhas de teste usam o prefixo 'TESTE DP' pra facilitar limpeza.
-- =====================================================================


-- ── Bloco 1: Simular sessão admin (rodar ANTES de todos os testes) ───
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e1342b2-c933-49d9-8782-477cfcad0486","role":"authenticated"}',
  true
);
SELECT public.has_rh_access();
-- Esperado: true


-- ── Bloco 2: Setup — vaga + 2 candidatos já em 'contratado' (clt / mei) ─
-- Ajustar o store_id para um id real de `stores` antes de rodar
INSERT INTO job_openings (store_id, role_title)
VALUES ('<STORE_ID_REAL>'::uuid, 'TESTE DP Cargo')
RETURNING id;
-- Guardar o id retornado como <JOB_OPENING_ID> nos inserts abaixo

INSERT INTO candidates (job_opening_id, name, age, whatsapp, stage, source)
VALUES
  ('<JOB_OPENING_ID>'::uuid, 'TESTE DP Candidato CLT', 30, '27999990001', 'contratado', 'manual'),
  ('<JOB_OPENING_ID>'::uuid, 'TESTE DP Candidato MEI', 25, '27999990002', 'contratado', 'manual')
RETURNING id, name, stage;
-- Guardar os 2 ids retornados como <CAND_CLT>, <CAND_MEI>


-- ── Bloco 3: Promover os 2 — caminho feliz ───────────────────────────
SELECT promote_candidate_to_dp('<CAND_CLT>'::uuid, 'clt');
SELECT promote_candidate_to_dp('<CAND_MEI>'::uuid, 'mei');
-- Esperado: cada chamada retorna um uuid (id do processo), sem erro


-- ── Bloco 4: Conferir employee_processes — etapa inicial "contratacao" ─
-- (vaga sem job_role_id vinculado assume requires_experience=true → sem
--  trilha de formação, direto em 'contratacao')
SELECT candidate_id, employment_type, current_stage, status, role_title,
       onboarding_completed, training_applicable, training_completed
FROM employee_processes
WHERE candidate_id IN ('<CAND_CLT>'::uuid, '<CAND_MEI>'::uuid)
ORDER BY employment_type;
-- Esperado: os 2 com current_stage='contratacao', status='em_andamento'
--   role_title = 'TESTE DP Cargo' nos 2
--   onboarding_completed=false, training_applicable=true, training_completed=false


-- ── Bloco 5: Conferir checklist de documentos (9 CLT / 5 MEI) ────────
SELECT p.employment_type, count(d.id) AS total_documentos
FROM employee_processes p
JOIN employee_documents d ON d.process_id = p.id
WHERE p.candidate_id IN ('<CAND_CLT>'::uuid, '<CAND_MEI>'::uuid)
GROUP BY p.employment_type
ORDER BY p.employment_type;
-- Esperado: clt=9, mei=5


-- ── Bloco 6: employment_type antigo (pré-simplificação) deve ser rejeitado ─
SELECT promote_candidate_to_dp('<CAND_CLT>'::uuid, 'mei_com_experiencia');
-- Esperado: ERROR — "employment_type inválido: mei_com_experiencia"


-- ── Bloco 7: Dupla promoção deve ser bloqueada ───────────────────────
SELECT promote_candidate_to_dp('<CAND_CLT>'::uuid, 'clt');
-- Esperado: ERROR — "Candidato já possui um processo de DP em andamento"


-- ── Bloco 8: job_roles.requires_experience decide a trilha de formação ─
INSERT INTO job_roles (title, contract_type, compensation_type, fixed_amount, requires_experience)
VALUES ('TESTE DP Cargo Sem Experiencia', 'mei', 'fixa', 1200, false)
RETURNING id;
-- Guardar como <ROLE_SEM_EXP_ID>

INSERT INTO job_openings (store_id, role_title, job_role_id)
VALUES ('<STORE_ID_REAL>'::uuid, 'TESTE DP Cargo Sem Experiencia', '<ROLE_SEM_EXP_ID>'::uuid)
RETURNING id;
-- Guardar como <JOB_OPENING_SEM_EXP_ID>

INSERT INTO candidates (job_opening_id, name, whatsapp, stage, source)
VALUES ('<JOB_OPENING_SEM_EXP_ID>'::uuid, 'TESTE DP Candidato Sem Exp', '27999990003', 'contratado', 'manual')
RETURNING id;
-- Guardar como <CAND_SEM_EXP>

SELECT promote_candidate_to_dp('<CAND_SEM_EXP>'::uuid, 'mei');
SELECT current_stage FROM employee_processes WHERE candidate_id = '<CAND_SEM_EXP>'::uuid;
-- Esperado: current_stage = 'contrato_formacao' (cargo não exige experiência)


-- ── Bloco 9: Trigger sincroniza status ao mover pra 'efetivado'/'encerrado' ─
UPDATE employee_processes SET current_stage = 'efetivado' WHERE candidate_id = '<CAND_MEI>'::uuid
RETURNING current_stage, status, activated_at;
-- Esperado: status='ativo', activated_at preenchida automaticamente

UPDATE employee_processes SET current_stage = 'encerrado' WHERE candidate_id = '<CAND_SEM_EXP>'::uuid
RETURNING current_stage, status;
-- Esperado: status='encerrado'


-- ── Bloco 10: register_existing_employee — cadastro sem passar pelo RH ─
SELECT register_existing_employee(
  'TESTE DP Legado Fulano', '27999990099', 'TESTE DP Cargo', '<STORE_ID_REAL>'::uuid, 'clt', '2024-01-15'::date
);
-- Guardar o uuid retornado como <PROCESS_LEGADO_ID>

SELECT status, current_stage, activated_at FROM employee_processes WHERE id = '<PROCESS_LEGADO_ID>'::uuid;
-- Esperado: status='ativo', current_stage='efetivado', activated_at='2024-01-15'

SELECT jo.status FROM job_openings jo
JOIN candidates c ON c.job_opening_id = jo.id
JOIN employee_processes ep ON ep.candidate_id = c.id
WHERE ep.id = '<PROCESS_LEGADO_ID>'::uuid;
-- Esperado: status='fechada' (a vaga-sombra criada pro cadastro retroativo, resolvida via
-- candidate_id → job_opening_id — não usar role_title/store_id pra achar a vaga, pode haver
-- mais de uma vaga com o mesmo título)


-- ── Bloco 11: Limpeza ─────────────────────────────────────────────────
DELETE FROM employee_processes
WHERE candidate_id IN (SELECT id FROM candidates WHERE name LIKE 'TESTE DP%');
DELETE FROM candidates WHERE name LIKE 'TESTE DP%';
DELETE FROM job_openings WHERE role_title LIKE 'TESTE DP%';
DELETE FROM job_roles WHERE title LIKE 'TESTE DP%';

-- Confirmar limpeza (employee_documents/employee_contracts/employee_timeline
-- somem sozinhos via ON DELETE CASCADE de process_id)
SELECT count(*) AS deve_ser_zero FROM employee_processes
WHERE candidate_id IN (SELECT id FROM candidates WHERE name LIKE 'TESTE DP%')
UNION ALL
SELECT count(*) FROM candidates WHERE name LIKE 'TESTE DP%'
UNION ALL
SELECT count(*) FROM job_openings WHERE role_title LIKE 'TESTE DP%'
UNION ALL
SELECT count(*) FROM job_roles WHERE title LIKE 'TESTE DP%';
