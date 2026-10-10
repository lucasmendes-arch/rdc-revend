/**
 * Teste de fumaça da escuta de WhatsApp contra o projeto linkado.
 *
 *   npm run test:whatsapp
 *
 * Roda supabase/tests/whatsapp_listener_smoke.sql pela Management API. O SQL
 * termina sempre em RAISE EXCEPTION — a transação é desfeita e nada fica no
 * banco. Passou = o erro devolvido contém "SMOKE OK".
 *
 * Precisa de SUPABASE_ACCESS_TOKEN (env ou .env.local).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function accessToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  const env = readFileSync(resolve(root, '.env.local'), 'utf8')
  const m = env.match(/^SUPABASE_ACCESS_TOKEN=["']?([^"'\r\n]+)/m)
  if (!m) throw new Error('SUPABASE_ACCESS_TOKEN não encontrado (env ou .env.local)')
  return m[1]
}

async function main() {
  const ref = readFileSync(resolve(root, 'supabase/.temp/project-ref'), 'utf8').trim()
  const query = readFileSync(resolve(root, 'supabase/tests/whatsapp_listener_smoke.sql'), 'utf8')

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  let message = text
  try {
    message = String(JSON.parse(text).message ?? text)
  } catch {
    // corpo não-JSON: usa o texto cru
  }
  const m = message.match(/SMOKE OK: (.*)/)
  if (m) {
    for (const part of m[1].split('; ')) console.log(`✓ ${part}`)
    return
  }
  console.error(`✗ falhou (HTTP ${res.status}):\n${text}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
