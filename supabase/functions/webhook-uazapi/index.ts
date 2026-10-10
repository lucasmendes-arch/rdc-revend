import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { timingSafeEqual } from '../_shared/timingSafe.ts'
import { parseUazapiEvent, redactPayload } from '../_shared/uazapi-message.ts'

// Escuta passiva de WhatsApp: recebe os eventos de mensagem da Uazapi
// (recebidas E enviadas) de todas as instâncias marcadas com
// whatsapp_instances.listen_enabled e grava o log de conversas.
//
// 100% PASSIVO. Este código não chama NENHUM endpoint da Uazapi: não envia,
// não marca como lido, não simula digitação. Só recebe e grava.
//
// Fluxo:
//   1. segredo compartilhado (a Uazapi não assina com HMAC) — header
//      `x-webhook-secret` ou parâmetro "secret" na query; fail-closed;
//   2. parse (_shared/uazapi-message.ts): grupo, status, canal e eventos que
//      não são mensagem são descartados aqui, sem gravar;
//   3. o `token` do payload tem que ser de uma instância em escuta (a doc da
//      Uazapi recomenda amarrar o token à instância autorizada);
//   4. grava o bruto (ON CONFLICT DO NOTHING = idempotente) e responde 200;
//   5. processa em segundo plano (whatsapp_process_raw_event). Se falhar, o
//      cron whatsapp-process-pending tenta de novo.

declare const Deno: { env: { get(k: string): string | undefined } }
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const secret = Deno.env.get('UAZAPI_WEBHOOK_SECRET')
  if (!secret) {
    console.error('UAZAPI_WEBHOOK_SECRET não configurado — rejeitando webhook')
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const provided =
    req.headers.get('x-webhook-secret') ||
    new URL(req.url).searchParams.get('secret') ||
    ''

  if (!timingSafeEqual(provided, secret)) {
    console.error('Segredo inválido no webhook da Uazapi')
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('Credenciais Supabase ausentes')
    return jsonResponse({ error: 'Not configured' }, 500)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const parsed = parseUazapiEvent(payload)
  if (parsed.kind === 'skip') {
    // 200 de propósito: erro faria a Uazapi reentregar pra sempre.
    return jsonResponse({ ok: true, ignored: parsed.reason })
  }

  const token = parsed.kind === 'message' ? parsed.message.instanceToken : parsed.instanceToken
  if (!token) {
    console.warn('Evento sem token de instância — ignorado')
    return jsonResponse({ ok: true, ignored: 'sem token' })
  }

  const client = createClient(supabaseUrl, serviceKey)

  const { data: instance, error: instErr } = await client
    .from('whatsapp_instances')
    .select('id, listen_enabled')
    .eq('uazapi_token', token)
    .maybeSingle()

  if (instErr) {
    console.error('Falha ao buscar instância:', instErr.message)
    return jsonResponse({ error: 'Falha interna' }, 500)
  }
  if (!instance) {
    console.warn('Token de instância desconhecido — ignorado')
    return jsonResponse({ ok: true, ignored: 'instancia desconhecida' })
  }
  if (!instance.listen_enabled) {
    return jsonResponse({ ok: true, ignored: 'escuta desligada' })
  }

  const row =
    parsed.kind === 'message'
      ? {
          instance_id: instance.id,
          event_type: parsed.message.eventType,
          provider_message_id: parsed.message.providerMessageId,
          parsed: { ...parsed.message, instanceToken: undefined },
          payload: redactPayload(payload),
        }
      : {
          // Parece mensagem mas falta o essencial: guarda pra análise do parser.
          instance_id: instance.id,
          event_type: parsed.eventType,
          provider_message_id: null,
          parsed: null,
          payload: redactPayload(payload),
          status: 'ignored',
          status_reason: parsed.reason,
          processed_at: new Date().toISOString(),
        }

  const { data: inserted, error: insErr } = await client
    .from('whatsapp_raw_events')
    .upsert(row, { onConflict: 'instance_id,provider_message_id', ignoreDuplicates: true })
    .select('id')

  if (insErr) {
    console.error('Falha ao gravar evento bruto:', insErr.message)
    // 500 intencional: erro nosso, queremos a reentrega da Uazapi.
    return jsonResponse({ error: 'Falha ao gravar' }, 500)
  }

  const rawId = inserted?.[0]?.id as string | undefined
  if (!rawId) return jsonResponse({ ok: true, duplicate: true })
  if (parsed.kind !== 'message') return jsonResponse({ ok: true, ignored: parsed.reason })

  const work = client
    .rpc('whatsapp_process_raw_event', { p_id: rawId })
    .then(({ data, error }) => {
      if (error) console.error('Processamento falhou (cron reprocessa):', error.message)
      else if (typeof data === 'string' && data.startsWith('erro')) console.error('Processamento:', data)
    })

  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(work)
  } else {
    await work
  }

  return jsonResponse({ ok: true, received: rawId })
})
