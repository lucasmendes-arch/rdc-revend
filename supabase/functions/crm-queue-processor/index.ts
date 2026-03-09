import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// CRM Queue Processor — Etapa 4 P4
//
// Processa itens pendentes de crm_dispatch_queue cujo scheduled_at <= now().
// Chamado pelo pg_cron a cada minuto via net.http_post (sem JWT).
//
// Fluxo:
//   1. Reclama itens atomicamente via claim_crm_queue_items() (FOR UPDATE SKIP LOCKED)
//   2. Para cada item, chama crm-dispatcher com force=true
//   3. Atualiza status do item: 'sent' ou 'failed'
//
// Idempotência: o dispatcher verifica crm_automation_runs — se já enviado,
// retorna skipped=1. O item é marcado 'sent' em ambos os casos.
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── 1. Claim itens prontos (atômico, safe para concorrência) ──────────────

  const { data: items, error: claimError } = await db
    .rpc('claim_crm_queue_items', { batch_size: 10 })

  if (claimError) {
    console.error('[Queue Processor] Erro ao reclamar itens:', claimError.message)
    return respond({ error: claimError.message }, 500)
  }

  if (!items || items.length === 0) {
    return respond({ processed: 0, reason: 'queue_empty' })
  }

  console.log(`[Queue Processor] Processando ${items.length} item(s)`)

  // ── 2. Disparar cada item via crm-dispatcher ──────────────────────────────

  let sent   = 0
  let failed = 0

  for (const item of items) {
    let ok        = false
    let lastError: string | null = null

    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/crm-dispatcher`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            user_id:       item.user_id,
            automation_id: item.automation_id,
            force:         true,
          }),
        }
      )

      const result = await res.json().catch(() => null)

      // Considera 'sent' se dispatcher enviou OU se idempotência barrou (já enviado antes)
      if (res.ok && result && (result.dispatched > 0 || result.skipped > 0)) {
        ok = true
        console.log(`[Queue Processor] Enviado: item ${item.id} (auto: ${item.automation_id})`)
      } else {
        lastError = `dispatcher returned: ${JSON.stringify(result)}`
        console.warn(`[Queue Processor] Falha no item ${item.id}: ${lastError}`)
      }
    } catch (err) {
      lastError = `Network error: ${String(err)}`
      console.error(`[Queue Processor] Erro de rede no item ${item.id}: ${lastError}`)
    }

    // ── 3. Atualizar status do item ─────────────────────────────────────────

    await db
      .from('crm_dispatch_queue')
      .update({
        status:       ok ? 'sent' : 'failed',
        last_error:   ok ? null : lastError,
        processed_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    if (ok) sent++
    else failed++
  }

  return respond({ processed: items.length, sent, failed })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}
