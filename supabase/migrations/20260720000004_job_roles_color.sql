-- job_roles.color — cor de exibição da vaga nos cards do kanban (RH), mesmo
-- padrão de tags.color. Vinculada ao cargo (não copiada como snapshot pra
-- job_openings): mudar a cor do cargo reflete em todas as vagas/candidatos
-- ligados a ele, igual ao comportamento de tags hoje.
alter table job_roles
  add column color text not null default '#0D9488';

comment on column job_roles.color is
  'Hex de exibição do cargo/vaga nos cards do kanban RH — lido via job_openings.job_role_id no join, não copiado como snapshot (mesmo padrão de tags.color).';

-- Cores pedidas pelo usuário pros cargos já cadastrados
update job_roles set color = '#EC4899' where title ilike '%recepcionista%';
update job_roles set color = '#7C3AED' where title ilike '%cabeleireir%' and title ilike '%cacho%';
