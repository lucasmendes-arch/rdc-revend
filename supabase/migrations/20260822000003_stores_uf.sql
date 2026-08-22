-- UF da unidade, pro fecho dos contratos gerados: "Linhares/ES, Data: ..."
-- em vez de "Linhares, Data: ...".
--
-- Não dá pra cravar '/ES' no código: das 5 unidades, Teixeira de Freitas é
-- na Bahia. E extrair do fim de `legal_address` seria adivinhação em texto
-- livre — num documento jurídico, o dado merece coluna própria.
--
-- Backfill a partir do que já está cadastrado em legal_address (conferido
-- unidade por unidade em 2026-08-22).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS uf text;

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_uf_format;
ALTER TABLE stores
  ADD CONSTRAINT stores_uf_format CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');

UPDATE stores SET uf = 'ES' WHERE slug IN ('linhares', 'serra', 'colatina', 'sao-gabriel');
UPDATE stores SET uf = 'BA' WHERE slug = 'teixeira';

COMMENT ON COLUMN stores.uf IS
  'Sigla do estado da unidade (2 letras maiúsculas). Compõe o placeholder {{local}} dos contratos gerados ("Linhares/ES"). Editável no modal "Dados das lojas".';
