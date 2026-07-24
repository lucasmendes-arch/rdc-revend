-- Módulo de RH — tipo "texto_longo" (textarea, várias linhas) no construtor
-- de formulário. "texto" tinha virado textarea pra todo mundo (inclusive
-- Nome), mas a maioria das perguntas de texto curto não precisa disso —
-- separa em dois tipos: "texto" volta a ser input de uma linha, "texto_longo"
-- é o novo tipo pra perguntas como "Resumo da atuação do profissional".

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
  CHECK (field_type IN ('texto', 'texto_longo', 'numero', 'telefone', 'select', 'checkbox', 'data', 'upload_imagem', 'upload_imagens', 'upload_arquivo'));
