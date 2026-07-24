-- Módulo de RH — tipo "upload_imagens" (múltiplas imagens, até 5) no
-- construtor de formulário. Pensado pra perguntas sobre certificados, onde
-- um único upload não é suficiente. Mesmo esquema de armazenamento do
-- "checkbox": candidate_answers.value continua text simples, com as URLs
-- enviadas gravadas juntas separadas por "; " (CHECKBOX_DELIM em
-- src/components/rh/FormFieldRenderer.tsx, reaproveitado como delimitador
-- genérico de multivalor) — nenhuma RPC precisa mudar, pois
-- submit_candidate_application já trata qualquer campo não-sistema como
-- texto opaco.

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
  CHECK (field_type IN ('texto', 'numero', 'telefone', 'select', 'checkbox', 'data', 'upload_imagem', 'upload_imagens', 'upload_arquivo'));
