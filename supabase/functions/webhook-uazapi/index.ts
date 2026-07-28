import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { timingSafeEqual } from '../_shared/timingSafe.ts'

// Recebe eventos de mensagem da Uazapi e grava a conversa (Fase 1 da triagem
// de entrevistas). Este endpoint NÃO responde, NÃO classifica e NÃO move card
// — só captura. Toda decisão continua com o RH na tela.
//
// Autenticação: a Uazapi não assina o payload com HMAC (diferente do
// MercadoPago), então o que dá pra fazer é segredo compartilhado. Aceita no
// header `x-webhook-secret` ou no parâmetro "secret" da query — a query existe porque
// nem toda instância da Uazapi deixa configurar header customizado. Falha
// fechado: sem UAZAPI_WEBHOOK_SECRET no ambiente, rejeita tudo (mesma regra
// aplicada no webhook-mercadopago no checkup de 2026-07-23).
//
// O formato do payload da Uazapi não é estável entre versões, então a
// extração abaixo tenta vários caminhos e o payload cru vai inteiro pra
// `whatsapp_messages.raw`. É de propósito: dá pra ajustar o parser depois
// olhando o que realmente chegou, sem ter perdido mensagem nenhuma.

declare const Deno: { env: { get(k: string): string | undefined } }

// deno-lint-ignore no-explicit-any
type Json = any

function pick(obj: Json, paths: string[]): string | null {
  for (const path of paths) {
    let cur: Json = obj
    for (const part of path.split('.')) {
      if (cur == null || typeof cur !== 'object') { cur = null; break }
      cur = cur[part]
    }
    if (typeof cur === 'string' && cur.trim()) return cur
    if (typeof cur === 'number') return String(cur)
  }
  return null
}

function pickBool(obj: Json, paths: string[]): boolean {
  for (const path of paths) {
    let cur: Json = obj
    for (const part of path.split('.')) {
      if (cur == null || typeof cur !== 'object') { cur = null; break }
      cur = cur[part]
    }
    if (typeof cur === 'boolean') return cur
  }
  return false
}

// Timestamp da Uazapi vem em segundos ou milissegundos dependendo do evento.
function parseTimestamp(raw: string | null): string | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = n > 1e11 ? n : n * 1000
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

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

  let payload: Json
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  // A Uazapi manda ora o objeto de mensagem na raiz, ora sob `message`/`data`.
  const msg = payload?.message ?? payload?.data?.message ?? payload?.data ?? payload

  const jid = pick(msg, [
    'sender', 'chatid', 'chatId', 'from', 'key.remoteJid', 'remoteJid',
  ])

  if (!jid) {
    // Evento sem destinatário: presença, status de conexão, ack de entrega.
    // 200 de propósito — devolver erro faria a Uazapi reentregar pra sempre.
    return jsonResponse({ ok: true, ignored: 'sem jid' })
  }

  // Grupo e status broadcast não são conversa com candidato.
  if (jid.includes('@g.us') || jid.startsWith('status@')) {
    return jsonResponse({ ok: true, ignored: 'grupo ou status' })
  }

  const fromMe = pickBool(msg, ['fromMe', 'key.fromMe', 'FromMe'])

  const body = pick(msg, [
    'text', 'body', 'content', 'caption',
    'message.conversation',
    'message.extendedTextMessage.text',
    'message.imageMessage.caption',
  ])

  const messageType = pick(msg, ['messageType', 'type', 'msgType']) ?? 'text'
  const externalId = pick(msg, ['id', 'messageid', 'messageId', 'key.id'])
  const sentAt = parseTimestamp(pick(msg, ['messageTimestamp', 'timestamp', 'moment', 't']))

  // Mensagem sem texto (áudio, imagem sem legenda, figurinha) é gravada com
  // body nulo — o card mostra o tipo. Perder o evento seria pior: some da
  // conversa e o RH não entende o buraco.
  const client = createClient(supabaseUrl, serviceKey)

  const { data, error } = await client.rpc('record_whatsapp_message', {
    p_direction: fromMe ? 'outbound' : 'inbound',
    p_phone_raw: jid,
    p_body: body,
    p_message_type: messageType,
    p_external_id: externalId,
    p_sent_at: sentAt,
    p_raw: payload,
  })

  if (error) {
    console.error('Falha ao gravar mensagem:', error.message)
    // 500 aqui é intencional: erro nosso, queremos a reentrega da Uazapi.
    return jsonResponse({ error: 'Falha ao gravar' }, 500)
  }

  // data === null: número irreconhecível, ou reentrega já gravada. Nos dois
  // casos o webhook cumpriu seu papel.
  return jsonResponse({ ok: true, recorded: data !== null })
})
