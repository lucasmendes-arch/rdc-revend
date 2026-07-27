-- Campo pro link da pasta do Google Drive do colaborador — pedido do
-- usuário no card do processo (aba Documentos), compartilhado entre o
-- kanban de Contratação e a lista de Colaboradores (mesmo ProcessoDetailModal).
-- Fica em employee_processes (não em employee_contract_data): não é dado de
-- template de contrato, é só uma referência interna do processo, mesmo
-- padrão de onboarding_completed/training_applicable já na tabela.

-- IF NOT EXISTS acrescentado em 2026-07-27: a coluna já estava no banco
-- remoto sem esta migration constar no histórico (supabase_migrations), então
-- o push falhava com "column already exists" e travava a fila inteira. Sem o
-- privilégio de `migration repair` nesta conta, tornar idempotente é o que
-- registra a migration sem reaplicar efeito nenhum.
ALTER TABLE employee_processes ADD COLUMN IF NOT EXISTS drive_folder_url text;
