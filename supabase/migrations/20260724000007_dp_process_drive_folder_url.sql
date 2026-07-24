-- Campo pro link da pasta do Google Drive do colaborador — pedido do
-- usuário no card do processo (aba Documentos), compartilhado entre o
-- kanban de Contratação e a lista de Colaboradores (mesmo ProcessoDetailModal).
-- Fica em employee_processes (não em employee_contract_data): não é dado de
-- template de contrato, é só uma referência interna do processo, mesmo
-- padrão de onboarding_completed/training_applicable já na tabela.

ALTER TABLE employee_processes ADD COLUMN drive_folder_url text;
