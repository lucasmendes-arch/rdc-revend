-- Remove a etapa 'acompanhamento_90d' do kanban de Contratação (DP) — pedido
-- do usuário. Trilha MEI passa a ser:
--   formacao → decisao_formacao → contratacao → (efetivado | encerrado)
-- 'contratacao' passa a levar direto pra efetivado/encerrado, sem o
-- acompanhamento intermediário de 90 dias.

-- ============================================================
-- 1. Processos existentes parados em 'acompanhamento_90d' migram de volta
--    pra 'contratacao' — não há mais essa etapa no kanban (nenhuma linha
--    encontrada no remoto ao escrever esta migration, mas mantém defensivo).
-- ============================================================

UPDATE employee_processes
SET current_stage = 'contratacao'
WHERE current_stage = 'acompanhamento_90d';

-- ============================================================
-- 2. CHECK constraint de current_stage — remove 'acompanhamento_90d' do
--    conjunto válido pra MEI (mesma constraint de 20260724000003).
-- ============================================================

ALTER TABLE employee_processes DROP CONSTRAINT employee_processes_current_stage_valid;
ALTER TABLE employee_processes
  ADD CONSTRAINT employee_processes_current_stage_valid CHECK (
    (employment_type = 'clt' AND current_stage IN (
      'contratacao', 'experiencia', 'decisao', 'efetivado', 'encerrado'
    ))
    OR (employment_type = 'mei' AND current_stage IN (
      'formacao', 'decisao_formacao', 'contratacao', 'efetivado', 'encerrado'
    ))
  );
