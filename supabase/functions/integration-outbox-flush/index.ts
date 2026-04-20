import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// integration-outbox-flush
//
// Worker que lê integration_outbox (status=pending, next_retry_at elegível)
// e faz relay dos eventos para o webhook do n8n.
//
// Concorrência: claim_outbox_items() usa FOR UPDATE SKIP LOCKED — seguro para
// múltiplas execuções simultâneas.
//
// Retry: backoff exponencial — next_retry_at = now() + 2^attempt_count minutos
// (mín 1 min, máx 60 min). Esgotados max_attempts → status = 'failed'.
//
// Status finais:
//   delivered → n8n retornou 2xx
//   failed    → esgotou max_attempts
//   pending   → reagendado para próxima tentativa
//
// Secrets necessários:
//   N8N_WEBHOOK_URL    — URL do webhook receptor no n8n
//   N8N_WEBHOOK_SECRET — header X-Webhook-Secret para autenticação (opcional)
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE  = 10
const MAX_BACKOFF_MINUTES = 60

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

  const n8nWebhookUrl    = Deno.env.get('N8N_WEBHOOK_URL')
  const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET') ?? null

  if (!n8nWebhookUrl) {
    console.error('[OutboxFlush] N8N_WEBHOOK_URL não configurado')
    return respond({ error: 'N8N_WEBHOOK_URL not configured' }, 500)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── 1. Resetar itens travados antes de processar ──────────────────────────

  const { data: resetCount, error: resetError } = await db
    .rpc('reset_stuck_outbox_items')

  if (resetError) {
    console.warn('[OutboxFlush] Erro ao resetar travados:', resetError.message)
  } else if (resetCount > 0) {
    console.log(`[OutboxFlush] ${resetCount} item(s) travado(s) resetados`)
  }

  // ── 2. Claim batch atômico ────────────────────────────────────────────────

  const { data: items, error: claimError } = await db
    .rpc('claim_outbox_items', { p_batch_size: BATCH_SIZE })

  if (claimError) {
    console.error('[OutboxFlush] Erro ao reclamar itens:', claimError.message)
    return respond({ error: claimError.message }, 500)
  }

  if (!items || items.length === 0) {
    return respond({ processed: 0, reason: 'queue_empty' })
  }

  console.log(`[OutboxFlush] Processando ${items.length} item(s)`)

  // ── 3. Enviar cada item para o n8n ────────────────────────────────────────

  let delivered = 0
  let retried   = 0
  let failed    = 0

  for (const item of items) {
    let httpStatus: number | null = null
    let lastError:  string | null = null
    let sendOk = false

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (n8nWebhookSecret) {
        headers['X-Webhook-Secret'] = n8nWebhookSecret
      }

      const res = await fetch(n8nWebhookUrl, {
        method:  'POST',
        headers,
        body: JSON.stringify({
          outbox_id:  item.id,
          event_type: item.event_type,
          user_id:    item.user_id,
          payload:    item.payload,
          attempt:    item.attempt_count,
          created_at: item.created_at,
        }),
      })

      httpStatus = res.status
      sendOk = res.ok

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`
      }
    } catch (err) {
      lastError = `Network error: ${String(err)}`
    }

    // ── 4. Atualizar item conforme resultado ────────────────────────────────

    if (sendOk) {
      await db
        .from('integration_outbox')
        .update({
          status:           'delivered',
          delivered_at:     new Date().toISOString(),
          last_http_status: httpStatus,
          last_error:       null,
          next_retry_at:    null,
        })
        .eq('id', item.id)

      console.log(`[OutboxFlush] Delivered: ${item.id} (${item.event_type})`)
      delivered++

    } else {
      const exhausted = item.attempt_count >= item.max_attempts

      if (exhausted) {
        await db
          .from('integration_outbox')
          .update({
            status:           'failed',
            last_error:       lastError,
            last_http_status: httpStatus,
            next_retry_at:    null,
          })
          .eq('id', item.id)

        console.error(`[OutboxFlush] Failed (exhausted): ${item.id} — ${lastError}`)
        failed++

      } else {
        const backoffMinutes = Math.min(
          Math.pow(2, item.attempt_count),
          MAX_BACKOFF_MINUTES
        )
        const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

        await db
          .from('integration_outbox')
          .update({
            status:           'pending',
            last_error:       lastError,
            last_http_status: httpStatus,
            next_retry_at:    nextRetry,
          })
          .eq('id', item.id)

        console.warn(
          `[OutboxFlush] Retry agendado: ${item.id} — ${lastError} — próxima em ${backoffMinutes}min`
        )
        retried++
      }
    }
  }

  return respond({ processed: items.length, delivered, retried, failed })
})

// ── Helper ────────────────────────────────────────────────────────────────────

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}
