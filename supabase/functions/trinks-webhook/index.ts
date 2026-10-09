// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  certUrlOf, extractTrinksFields, isAllowedCertUrl, isTrustedSubscription, parseEnvelope,
  parseMessage, verifySignature,
} from './sns.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

// ─────────────────────────────────────────────────────────────────────────────
// trinks-webhook
//
// Recebe o envelope SNS dos webhooks do Trinks (repassado pelo workflow n8n
// "WebHook Trinks"), valida a assinatura da AWS e grava em
// trinks_webhook_events. Só captura: o processamento para as tabelas do
// dashboard é uma etapa separada, que lê desta caixa de entrada.
//
// Respostas:
//   200 — gravado (ou já existia: o SNS reentrega, e o MessageId deduplica)
//   400 — corpo não é um envelope SNS
//   403 — assinatura inválida, certificado fora da AWS ou tópico não permitido
//   500 — falha ao gravar; o n8n devolve erro ao SNS, que tenta de novo
//
// Sem JWT (verify_jwt = false): quem chama é o n8n. A autenticidade vem da
// assinatura da AWS, que nenhum terceiro consegue forjar.
//
// TRINKS_SNS_TOPIC_ARNS (opcional, separado por vírgula) restringe os tópicos
// aceitos. Sem ele, qualquer tópico com assinatura válida da AWS passa.
// ─────────────────────────────────────────────────────────────────────────────

const certCache = new Map<string, string>()
const storeByEstab = new Map<number, string | null>()

async function getCert(url: string): Promise<string> {
  const hit = certCache.get(url)
  if (hit) return hit
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`certificado HTTP ${res.status}`)
  const pem = await res.text()
  certCache.set(url, pem)
  return pem
}

async function storeFor(db: any, establishmentId: number | null): Promise<string | null> {
  if (establishmentId === null) return null
  if (storeByEstab.has(establishmentId)) return storeByEstab.get(establishmentId)!
  const { data } = await db
    .from('trinks_units')
    .select('store_id')
    .eq('trinks_establishment_id', establishmentId)
    .maybeSingle()
  const id = data?.store_id ?? null
  storeByEstab.set(establishmentId, id)
  return id
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Log estruturado sem dado pessoal: o payload completo fica só no banco.
const log = (evt: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ fn: 'trinks-webhook', evt, ...data }))

serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const text = await req.text()
  const env = parseEnvelope(text)
  if (!env) {
    log('rejected', { reason: 'envelope invalido', bytes: text.length })
    return json(400, { error: 'envelope SNS invalido' })
  }

  const certUrl = certUrlOf(env)
  if (!isAllowedCertUrl(certUrl)) {
    log('rejected', { reason: 'cert url', message_id: env.MessageId })
    return json(403, { error: 'certificado nao permitido' })
  }

  let valid = false
  try {
    valid = verifySignature(env, await getCert(certUrl!))
  } catch (err) {
    // Falha ao baixar o certificado é transitória: 500 faz o SNS reentregar.
    log('cert_error', { message_id: env.MessageId, error: String(err) })
    return json(500, { error: 'falha ao obter certificado' })
  }
  if (!valid) {
    log('rejected', { reason: 'assinatura', message_id: env.MessageId })
    return json(403, { error: 'assinatura invalida' })
  }

  const allowedTopics = (Deno.env.get('TRINKS_SNS_TOPIC_ARNS') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (allowedTopics.length && !allowedTopics.includes(env.TopicArn ?? '')) {
    log('rejected', { reason: 'topico', message_id: env.MessageId, topic: env.TopicArn })
    return json(403, { error: 'topico nao permitido' })
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const payload = env.Type === 'Notification' ? parseMessage(env.Message) : null
  const fields = extractTrinksFields(payload)
  const store_id = await storeFor(db, fields.establishment_id)

  const ts = Date.parse(env.Timestamp)
  const { data, error } = await db
    .from('trinks_webhook_events')
    .upsert({
      message_id: env.MessageId,
      sns_type: env.Type,
      topic_arn: env.TopicArn ?? null,
      sns_timestamp: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
      event_type: fields.event_type,
      action: fields.action,
      establishment_id: fields.establishment_id,
      store_id,
      payload,
      envelope: env,
    }, { onConflict: 'message_id', ignoreDuplicates: true })
    .select('id')

  if (error) {
    log('db_error', { message_id: env.MessageId, error: error.message })
    return json(500, { error: 'falha ao gravar' })
  }

  const duplicate = !data?.length

  // Processa na hora para o dashboard refletir o evento em segundos. Falha
  // aqui NÃO devolve erro ao SNS: o evento bruto já está salvo, o erro fica em
  // process_error e o cron trinks-process-webhooks tenta de novo.
  let processed: string | null = null
  if (!duplicate) {
    const { data: res, error: procErr } = await db.rpc('trinks_process_webhook_event', { p_event_id: data![0].id })
    processed = procErr ? `erro rpc: ${procErr.message}` : String(res)
  }

  log(duplicate ? 'duplicate' : 'stored', {
    message_id: env.MessageId,
    sns_type: env.Type,
    event_type: fields.event_type,
    action: fields.action,
    establishment_id: fields.establishment_id,
    mapped_store: store_id !== null,
    processed,
  })

  // Confirmação de inscrição (o Trinks inscrevendo uma unidade nova ou
  // recriando a inscrição): já está gravada para auditoria. Confirma sozinho
  // só se for do tópico da conta AWS do Trinks — ver isTrustedSubscription.
  // Sem confirmar, a AWS não entrega nenhum evento dessa inscrição.
  if (env.Type === 'SubscriptionConfirmation') {
    if (!isTrustedSubscription(env)) {
      log('subscription_ignored', { message_id: env.MessageId, topic: env.TopicArn })
      return json(200, { ok: true, confirmed: false })
    }
    try {
      const res = await fetch(env.SubscribeURL!, { signal: AbortSignal.timeout(10000) })
      log('subscription_confirmed', { message_id: env.MessageId, topic: env.TopicArn, status: res.status })
      // Falhou? 500 faz o SNS reentregar a confirmação.
      if (!res.ok) return json(500, { error: 'falha ao confirmar inscricao' })
      return json(200, { ok: true, confirmed: true })
    } catch (err) {
      log('subscription_error', { message_id: env.MessageId, error: String(err) })
      return json(500, { error: 'falha ao confirmar inscricao' })
    }
  }

  return json(200, { ok: true, duplicate })
})
