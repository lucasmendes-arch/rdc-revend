import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// CRM Dispatcher — Etapa 3 P3
//
// Envia mensagens WhatsApp via UAZAPI para automações CRM ativas.
//
// Modos de invocação:
//   A) Supabase Database Webhook (INSERT em crm_customer_tags)
//      body = { type: 'INSERT', table: 'crm_customer_tags', record: { user_id, tag_id } }
//      → filtra automações com trigger_type='tag_added' e tag_slug correspondente
//
//   B) Chamada direta (HTTP POST)
//      body = { user_id: string, automation_id?: string }
//      → executa todas as automações ativas (ou uma específica)
//
// Secrets necessários (Supabase Edge Function Secrets):
//   UAZAPI_URL    — ex: https://reidoscachos.uazapi.com
//   UAZAPI_TOKEN  — token de autenticação da instância UAZAPI
//
// Idempotência: uma execução bem-sucedida por (automation_id × user_id).
// Para reenviar, deletar o registro correspondente em crm_automation_runs.
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

  const uazapiUrl   = Deno.env.get('UAZAPI_URL')
  const uazapiToken = Deno.env.get('UAZAPI_TOKEN')

  if (!uazapiUrl || !uazapiToken) {
    console.error('[CRM Dispatcher] UAZAPI_URL ou UAZAPI_TOKEN nao configurados')
    return respond({ error: 'UAZAPI not configured' }, 500)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return respond({ error: 'Invalid JSON body' }, 400)
  }

  // ── Resolver user_id e contexto do payload ────────────────────────────────

  let userId:          string | null = null
  let triggerTagSlug:  string | null = null
  const forcedAutoId:  string | null = (body.automation_id as string) ?? null
  const forceDispatch: boolean       = body.force === true // admin bypass: ignora is_active

  if (
    body.type === 'INSERT' &&
    body.table === 'crm_customer_tags' &&
    body.record &&
    (body.record as Record<string, unknown>).user_id
  ) {
    // Modo A: Supabase Database Webhook
    const record = body.record as Record<string, string>
    userId = record.user_id

    const { data: tag } = await db
      .from('crm_tags')
      .select('slug')
      .eq('id', record.tag_id)
      .maybeSingle()

    triggerTagSlug = tag?.slug ?? null
    console.log(`[CRM Dispatcher] Webhook tag: ${triggerTagSlug} para user ${userId}`)

  } else if (body.user_id) {
    // Modo B: chamada direta
    userId = body.user_id as string
    console.log(`[CRM Dispatcher] Chamada direta para user ${userId}`)
  }

  if (!userId) {
    return respond({ error: 'user_id required' }, 400)
  }

  // ── Resolver perfil do cliente ────────────────────────────────────────────

  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, phone')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    console.warn(`[CRM Dispatcher] Perfil nao encontrado: ${userId}`)
    return respond({ skipped: true, reason: 'profile_not_found' })
  }

  if (!profile.phone) {
    console.warn(`[CRM Dispatcher] Sem telefone para user: ${userId}`)
    return respond({ skipped: true, reason: 'no_phone' })
  }

  // ── Buscar automações ativas e elegíveis ──────────────────────────────────

  let autoQuery = db
    .from('crm_automations')
    .select('*')
    .eq('channel', 'whatsapp')

  if (!forceDispatch) {
    autoQuery = autoQuery.eq('is_active', true)
  }

  if (forcedAutoId) {
    autoQuery = autoQuery.eq('id', forcedAutoId)
  }

  const { data: automations } = await autoQuery

  if (!automations || automations.length === 0) {
    return respond({ dispatched: 0, reason: 'no_active_automations' })
  }

  // Filtrar por trigger_conditions quando acionado por tag
  const eligible = automations.filter((auto) => {
    if (!triggerTagSlug) return true // chamada direta: roda tudo
    if (auto.trigger_type !== 'tag_added') return false
    const requiredSlug = auto.trigger_conditions?.tag_slug as string | undefined
    return !requiredSlug || requiredSlug === triggerTagSlug
  })

  if (eligible.length === 0) {
    return respond({ dispatched: 0, reason: 'no_matching_automations' })
  }

  // ── Disparar cada automação elegível ─────────────────────────────────────

  let dispatched = 0
  let skipped    = 0
  let queued     = 0

  for (const automation of eligible) {
    const idempotencyKey = `auto_${automation.id}_user_${userId}`

    // Verificar se já executou com sucesso para este par (automation × user)
    const { data: existingRun } = await db
      .from('crm_automation_runs')
      .select('id, status, attempt_count')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingRun?.status === 'success') {
      console.log(`[CRM Dispatcher] Ja enviado: "${automation.name}" → user ${userId}`)
      skipped++
      continue
    }

    // Resolver telefone: tenta phone_field da config, cai em 'phone'
    const phoneField = (automation.action_config?.phone_field as string) ?? 'phone'
    const rawPhone   = (profile as Record<string, unknown>)[phoneField] as string
                     ?? profile.phone
    const cleanPhone = sanitizePhone(rawPhone)

    if (!cleanPhone) {
      console.warn(`[CRM Dispatcher] Telefone invalido para user ${userId} (campo: ${phoneField})`)
      continue
    }

    // Renderizar template com variaveis do perfil
    const template = (automation.action_config?.template as string) ?? ''
    const message  = renderTemplate(template, {
      nome: profile.full_name ?? 'Cliente',
    })

    // ── Suporte a delay: se delay_minutes > 0, enfileirar para envio futuro ──
    const delayMinutes = (automation.action_config?.delay_minutes as number) ?? 0

    if (delayMinutes > 0 && !forceDispatch) {
      const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()

      const { error: queueError } = await db
        .from('crm_dispatch_queue')
        .upsert(
          {
            automation_id:   automation.id,
            user_id:         userId,
            trigger_event:   { tag_slug: triggerTagSlug, source: 'crm-dispatcher' },
            idempotency_key: idempotencyKey,
            scheduled_at:    scheduledAt,
            status:          'pending',
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: true }
        )

      if (queueError) {
        console.error(`[CRM Dispatcher] Erro ao enfileirar "${automation.name}": ${queueError.message}`)
      } else {
        console.log(`[CRM Dispatcher] Enfileirado: "${automation.name}" → ${scheduledAt} (${delayMinutes}min)`)
        queued++
      }
      continue
    }

    // Registrar run como 'running' (upsert: cria ou atualiza se era failed)
    const attemptCount = (existingRun?.attempt_count ?? 0) + 1

    const { data: runRecord } = await db
      .from('crm_automation_runs')
      .upsert(
        {
          automation_id:    automation.id,
          user_id:          userId,
          trigger_event:    { tag_slug: triggerTagSlug, source: 'crm-dispatcher' },
          action_payload:   { number: cleanPhone, text: message },
          status:           'running',
          attempt_count:    attemptCount,
          idempotency_key:  idempotencyKey,
        },
        { onConflict: 'idempotency_key' }
      )
      .select('id')
      .maybeSingle()

    // Enviar via UAZAPI
    let sendOk       = false
    let sendResponse: unknown = null
    let sendError:   string | null = null

    try {
      const uazapiRes = await fetch(`${uazapiUrl}/send/text`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'token': uazapiToken },
        body:    JSON.stringify({ number: cleanPhone, text: message }),
      })

      sendResponse = await uazapiRes.json().catch(() => null)
      sendOk = uazapiRes.ok

      if (!uazapiRes.ok) {
        sendError = `UAZAPI HTTP ${uazapiRes.status}: ${JSON.stringify(sendResponse)}`
      }
    } catch (err) {
      sendError = `Network error: ${String(err)}`
    }

    // Atualizar run com resultado
    if (runRecord?.id) {
      await db
        .from('crm_automation_runs')
        .update({
          status:          sendOk ? 'success' : 'failed',
          action_response: sendResponse ?? null,
          error_message:   sendError,
        })
        .eq('id', runRecord.id)
    }

    if (sendOk) {
      console.log(`[CRM Dispatcher] Enviado: "${automation.name}" → ${cleanPhone}`)
      dispatched++
    } else {
      console.error(`[CRM Dispatcher] Falha: "${automation.name}" → ${cleanPhone}: ${sendError}`)
    }
  }

  return respond({ dispatched, skipped, queued })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

/** Substitui {variavel} pelo valor correspondente no mapa. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

/**
 * Normaliza telefone para dígitos apenas com DDI 55.
 * Entrada: '(27) 99686-5366' → Saída: '5527996865366'
 */
function sanitizePhone(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('55') && digits.length <= 11) {
    return '55' + digits
  }
  return digits
}
