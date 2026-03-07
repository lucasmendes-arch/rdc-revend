-- Deduplicate: keep only the most recently updated profile for each document
-- Nullify document on older duplicates so the unique index can be created
WITH duplicates AS (
  SELECT id, document,
    ROW_NUMBER() OVER (PARTITION BY document ORDER BY created_at DESC NULLS LAST) as rn
  FROM profiles
  WHERE document IS NOT NULL AND document != ''
)
UPDATE profiles SET document = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Prevent duplicate CPF/CNPJ registrations
-- Only enforce uniqueness on non-null, non-empty documents
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_document_unique
  ON public.profiles (document)
  WHERE document IS NOT NULL AND document != '';
