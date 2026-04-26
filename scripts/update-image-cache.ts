/**
 * Atualiza o cache-control de todas as imagens existentes no bucket product-images.
 * Necessário porque o cacheControl só foi configurado no upload hook —
 * arquivos já existentes no bucket não têm o header definido.
 *
 * Uso:
 *   npx tsx scripts/update-image-cache.ts
 *
 * Requer no .env.local:
 *   VITE_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY
const BUCKET = 'product-images'
const DELAY_MS = 150

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function listAllFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  return (data ?? [])
    .filter((f) => f.id !== null)
    .map((f) => `${prefix}/${f.name}`)
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const files = await listAllFiles('products')
  console.log(`Encontrados ${files.length} arquivos no bucket "${BUCKET}/products"`)

  let updated = 0
  let failed = 0

  for (const filePath of files) {
    const { data: blob, error: downloadErr } = await supabase.storage
      .from(BUCKET)
      .download(filePath)

    if (downloadErr || !blob) {
      console.error(`  ✗ Download falhou: ${filePath}`, downloadErr?.message)
      failed++
      await sleep(DELAY_MS)
      continue
    }

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .update(filePath, blob, {
        cacheControl: '31536000',
        upsert: true,
        contentType: blob.type || 'image/jpeg',
      })

    if (uploadErr) {
      console.error(`  ✗ Update falhou: ${filePath}`, uploadErr.message)
      failed++
    } else {
      console.log(`  ✓ ${filePath}`)
      updated++
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nConcluído: ${updated} atualizados, ${failed} com erro`)
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
