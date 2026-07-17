-- Módulo de RH — tipo "checkbox" (múltipla escolha) no construtor de formulário
-- Igual ao "select" (usa a mesma coluna options), mas o candidato pode marcar
-- mais de uma opção — a resposta grava as opções marcadas juntas numa string
-- só, separadas por "; " (candidate_answers.value continua text simples).

-- DROP/ADD dinâmico: o CHECK original em field_type foi criado sem nome
-- explícito (20260718000001), então o Postgres gerou o nome automaticamente —
-- descobre e remove por conteúdo em vez de arriscar o nome errado.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'form_fields' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%field_type%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE form_fields DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
  CHECK (field_type IN ('texto', 'numero', 'telefone', 'select', 'checkbox', 'data', 'upload_imagem', 'upload_arquivo'));

-- Data-fix pontual pedida pelo usuário: o campo "tipo_entrevista" já existia
-- como select (single-choice) e devia ser múltipla escolha desde o início.
UPDATE form_fields SET field_type = 'checkbox' WHERE field_key = 'tipo_entrevista';
