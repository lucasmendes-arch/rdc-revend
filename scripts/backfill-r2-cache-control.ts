/**
 * Backfill do Cache-Control nos objetos já existentes no R2.
 *
 * Contexto: `supabase/functions/upload-product-image/index.ts` passou a gravar
 * `Cache-Control: public, max-age=31536000, immutable` em todo upload novo
 * (deploy de 2026-07-27). Objetos enviados ANTES desse deploy ficaram sem o
 * header — e o R2 grava o Cache-Control no momento do PUT, então não há como
 * corrigir "do lado da leitura". Sem o header o browser cai no cache heurístico
 * (10% da idade do arquivo): foto recém-enviada tem idade ~0, ou seja,
 * revalidação a cada visita. É o que faz uma foto nova parecer mais lenta que
 * uma antiga, mesmo sendo menor.
 *
 * A correção é reescrever a metadata via CopyObject (mesma chave, origem =
 * destino) com `x-amz-metadata-directive: REPLACE`. Os bytes não mudam.
 *
 * Uso:
 *   npx tsx scripts/backfill-r2-cache-control.ts            # dry-run (só lista)
 *   npx tsx scripts/backfill-r2-cache-control.ts --apply    # aplica
 *   npx tsx scripts/backfill-r2-cache-control.ts --prefix candidates/ --apply
 *
 * Lê do .env.local: ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT.
 */

import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BUCKET = 'product-images'
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex')

const apply = process.argv.includes('--apply')
const prefixArg = process.argv.indexOf('--prefix')
const prefix = prefixArg !== -1 ? process.argv[prefixArg + 1] ?? '' : ''

function loadEnv(): Record<string, string> {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const env = loadEnv()
const accountId = env.ACCOUNT_ID
const accessKeyId = env.ACCESS_KEY_ID
const secretAccessKey = env.SECRET_ACCESS_KEY
const publicBase = env.ENDPOINT

if (!accountId || !accessKeyId || !secretAccessKey || !publicBase) {
  console.error('Faltando ACCOUNT_ID / ACCESS_KEY_ID / SECRET_ACCESS_KEY / ENDPOINT no .env.local')
  process.exit(1)
}

const host = `${accountId}.r2.cloudflarestorage.com`

// ── SigV4 mínimo pro S3 API do R2 ────────────────────────────────────────────
// Só o necessário pra GET (list) e PUT (copy) sem corpo — evita puxar o
// aws-sdk inteiro pra um script de manutenção pontual.
function sign(key: Buffer | string, msg: string) {
  return createHmac('sha256', key).update(msg, 'utf8').digest()
}

function signedFetch(method: string, path: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const allHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': EMPTY_SHA256,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  }

  const sortedKeys = Object.keys(allHeaders).sort()
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${allHeaders[k].trim()}\n`).join('')
  const signedHeaders = sortedKeys.join(';')

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&')

  // Cada segmento do path é encodado, mas a '/' que separa segmentos não.
  const canonicalUri = path.split('/').map((s) => encodeURIComponent(s)).join('/')

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, EMPTY_SHA256].join('\n')
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const signingKey = sign(sign(sign(sign(`AWS4${secretAccessKey}`, dateStamp), 'auto'), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`
  return fetch(url, { method, headers: { ...allHeaders, Authorization: authorization } })
}

// ── Listagem paginada ────────────────────────────────────────────────────────
async function listAll(): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined

  do {
    const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' }
    if (prefix) query.prefix = prefix
    if (token) query['continuation-token'] = token

    const res = await signedFetch('GET', `/${BUCKET}`, query)
    if (!res.ok) throw new Error(`List falhou: ${res.status} ${await res.text()}`)
    const xml = await res.text()

    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decodeXml(m[1]))
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
  } while (token)

  return keys
}

function decodeXml(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// ── Execução ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Bucket "${BUCKET}"${prefix ? ` (prefixo "${prefix}")` : ''} — modo ${apply ? 'APPLY' : 'DRY-RUN'}\n`)

  const keys = await listAll()
  console.log(`${keys.length} objetos encontrados. Checando Cache-Control...\n`)

  const stale: { key: string; contentType: string }[] = []

  for (const key of keys) {
    // HEAD pelo domínio público: o objeto já é público e isso evita assinar
    // mais uma requisição por arquivo.
    const head = await fetch(`${publicBase}/${key}`, { method: 'HEAD' })
    if (!head.ok) {
      console.warn(`  ? ${key} — HEAD ${head.status}, pulando`)
      continue
    }
    if (head.headers.get('cache-control')) continue
    stale.push({ key, contentType: head.headers.get('content-type') || 'application/octet-stream' })
  }

  console.log(`${stale.length} objetos SEM Cache-Control:\n`)
  const byPrefix = new Map<string, number>()
  for (const { key } of stale) {
    const p = key.split('/').slice(0, -1).join('/') || '(raiz)'
    byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1)
  }
  for (const [p, n] of [...byPrefix].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}/`)

  if (!apply) {
    console.log('\nDry-run: nada foi alterado. Rode com --apply pra corrigir.')
    return
  }

  console.log('\nAplicando...\n')
  let ok = 0
  let fail = 0

  for (const { key, contentType } of stale) {
    const res = await signedFetch('PUT', `/${BUCKET}/${key}`, {}, {
      'x-amz-copy-source': `/${BUCKET}/${key}`,
      'x-amz-metadata-directive': 'REPLACE',
      'cache-control': CACHE_CONTROL,
      'content-type': contentType,
    })
    if (res.ok) {
      ok++
      if (ok % 25 === 0) console.log(`  ${ok}/${stale.length}...`)
    } else {
      fail++
      console.error(`  x ${key} — ${res.status} ${(await res.text()).slice(0, 200)}`)
    }
  }

  console.log(`\nConcluído: ${ok} atualizados, ${fail} com erro.`)
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
