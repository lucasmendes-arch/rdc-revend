-- Data-fix: limpa dados de teste do módulo RH/DP (vagas, candidatos, colaboradores)
-- antes de liberar o módulo pra uso real. Ordem respeita FK ON DELETE RESTRICT
-- (employee_processes.candidate_id, candidates.job_opening_id) — cascatas cuidam
-- do resto (employee_documents/contracts/timeline, candidate_tags/stage_history/
-- answers, automation_whatsapp_queue).

delete from employee_processes;
delete from candidates;
delete from job_openings;
