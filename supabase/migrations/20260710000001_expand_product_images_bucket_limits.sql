-- Expand product-images bucket limits: HEIC/HEIF (fotos de iPhone) causavam 400
-- ao subir comprovantes de pagamento; 5MB também era baixo para fotos de câmera.
UPDATE storage.buckets
SET
  file_size_limit = 10485760, -- 10MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
WHERE id = 'product-images';
