/**
 * Testa phone_br_canonical() / phone_br_key() — a regra de telefone vive só no
 * banco (coluna gerada em trinks_clients, conciliação do WhatsApp), então o
 * teste roda os casos de supabase/tests/phone_br_cases.json contra o projeto
 * linkado, numa única query, pela Management API.
 *
 *   npm run test:phone
 *
 * Precisa de SUPABASE_ACCESS_TOKEN (env ou .env.local). Só lê: a query é um
 * SELECT sobre funções IMMUTABLE.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Case = { input: string | null; canonical: string | null; key: string | null; note: string }

const root = resolve(import.meta.dirname, '..')

function accessToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  const env = readFileSync(resolve(root, '.env.local'), 'utf8')
  const m = env.match(/^SUPABASE_ACCESS_TOKEN=["']?([^"'\r\n]+)/m)
  if (!m) throw new Error('SUPABASE_ACCESS_TOKEN não encontrado (env ou .env.local)')
  return m[1]
}

const lit = (s: string | null) => (s === null ? 'NULL::text' : `'${s.replace(/'/g, "''")}'`)

async function main() {
  const cases: Case[] = JSON.parse(readFileSync(resolve(root, 'supabase/tests/phone_br_cases.json'), 'utf8'))
  const ref = readFileSync(resolve(root, 'supabase/.temp/project-ref'), 'utf8').trim()

  const values = cases.map((c, i) => `(${i}, ${lit(c.input)})`).join(',\n')
  const query = `SELECT i, public.phone_br_canonical(v) AS canonical, public.phone_br_key(v) AS key
                   FROM (VALUES ${values}) t(i, v) ORDER BY i`

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as { i: number; canonical: string | null; key: string | null }[]

  let failed = 0
  for (const row of rows) {
    const c = cases[row.i]
    const ok = row.canonical === c.canonical && row.key === c.key
    if (!ok) failed++
    const label = JSON.stringify(c.input)
    console.log(
      `${ok ? '✓' : '✗'} ${label.padEnd(32)} ${String(row.canonical).padEnd(14)} ${String(row.key).padEnd(11)} ${c.note}` +
        (ok ? '' : `  (esperado ${c.canonical} / ${c.key})`),
    )
  }
  console.log(`\n${rows.length - failed}/${rows.length} casos ok`)
  if (failed || rows.length !== cases.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
