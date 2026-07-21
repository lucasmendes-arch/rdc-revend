-- Replace job_roles.seniority_level (júnior/pleno/sênior) with education_level (grau de escolaridade)
alter table job_roles
  rename column seniority_level to education_level;

alter table job_roles
  drop constraint if exists job_roles_seniority_level_check;

-- valores antigos de senioridade (junior/pleno/senior) não mapeiam pra escolaridade — zera
update job_roles set education_level = null
where education_level is not null
  and education_level not in (
    'fundamental_incompleto',
    'fundamental_completo',
    'medio_incompleto',
    'medio_completo',
    'superior_incompleto',
    'superior_completo',
    'pos_graduacao'
  );

alter table job_roles
  add constraint job_roles_education_level_check
  check (education_level in (
    'fundamental_incompleto',
    'fundamental_completo',
    'medio_incompleto',
    'medio_completo',
    'superior_incompleto',
    'superior_completo',
    'pos_graduacao'
  ));
