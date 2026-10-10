-- ============================================================================
-- Escuta de WhatsApp — cache de transcrição/descrição por arquivo (2026-10-10)
--
-- Mensagem rápida com mídia mandada pelo celular da unidade para várias
-- clientes (resgate) não passa pelo filtro de disparo (não é API) e faria a IA
-- descrever a mesma imagem N vezes. A edge function calcula o SHA-256 do
-- arquivo baixado; se o mesmo arquivo já tem texto pronto, copia (custo zero,
-- model = 'cache:<modelo original>') em vez de chamar a IA.
-- ============================================================================

ALTER TABLE public.whatsapp_message_enrichments
  ADD COLUMN IF NOT EXISTS media_sha256 text,
  ADD COLUMN IF NOT EXISTS cached_from uuid REFERENCES public.whatsapp_message_enrichments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_enrichments_cache
  ON public.whatsapp_message_enrichments (kind, media_sha256)
  WHERE status = 'done' AND media_sha256 IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_message_enrichments.media_sha256 IS
  'SHA-256 (hex) do arquivo baixado. Mesmo arquivo = reaproveita o texto (cached_from).';
