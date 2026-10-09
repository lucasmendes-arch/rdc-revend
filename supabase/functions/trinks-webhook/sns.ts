// ─────────────────────────────────────────────────────────────────────────────
// Verificação de mensagens Amazon SNS
//
// O Trinks entrega os webhooks pelo SNS. Toda mensagem vem assinada pela AWS:
// a assinatura cobre um texto canônico montado com campos do envelope, e a
// chave pública está num certificado servido em SigningCertURL (domínio da
// AWS). Sem essa checagem, qualquer um que descubra a URL do webhook consegue
// injetar faturamento falso no dashboard.
//
// Referência: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
//
// Módulo puro (sem Deno/URL imports) para rodar também no vitest.
// ─────────────────────────────────────────────────────────────────────────────

import { createVerify } from 'node:crypto'

export interface SnsEnvelope {
  Type: string
  MessageId: string
  TopicArn?: string
  Subject?: string | null
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL?: string
  SigningCertUrl?: string
  SubscribeURL?: string
  Token?: string
  UnsubscribeURL?: string
}

const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const
const SUBSCRIPTION_FIELDS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const

/** Aceita objeto ou string JSON (o n8n pode repassar o corpo text/plain como string). */
export function parseEnvelope(body: unknown): SnsEnvelope | null {
  let obj = body
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return null }
  }
  if (!obj || typeof obj !== 'object') return null
  const e = obj as Record<string, unknown>
  for (const k of ['Type', 'MessageId', 'Message', 'Timestamp', 'SignatureVersion', 'Signature']) {
    if (typeof e[k] !== 'string' || !e[k]) return null
  }
  return e as unknown as SnsEnvelope
}

export function certUrlOf(env: SnsEnvelope): string | undefined {
  return env.SigningCertURL ?? env.SigningCertUrl
}

/**
 * Só aceitamos certificados servidos pela própria AWS por HTTPS — senão um
 * atacante assinaria a mensagem com a chave dele e apontaria para o próprio
 * certificado.
 */
export function isAllowedCertUrl(url: string | undefined): boolean {
  if (!url) return false
  let u: URL
  try { u = new URL(url) } catch { return false }
  return u.protocol === 'https:'
    && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname)
    && u.pathname.endsWith('.pem')
}

/** Texto canônico assinado pela AWS: "Chave\nValor\n" na ordem documentada. */
export function stringToSign(env: SnsEnvelope): string {
  const fields = env.Type === 'Notification' ? NOTIFICATION_FIELDS : SUBSCRIPTION_FIELDS
  let out = ''
  for (const k of fields) {
    const v = (env as unknown as Record<string, unknown>)[k]
    // Subject é opcional em Notification e só entra quando presente.
    if (v === undefined || v === null) continue
    out += `${k}\n${v}\n`
  }
  return out
}

export function verifySignature(env: SnsEnvelope, certPem: string): boolean {
  const algo = env.SignatureVersion === '2' ? 'RSA-SHA256'
    : env.SignatureVersion === '1' ? 'RSA-SHA1'
    : null
  if (!algo) return false
  try {
    const v = createVerify(algo)
    v.update(stringToSign(env), 'utf8')
    return v.verify(certPem, env.Signature, 'base64')
  } catch {
    return false
  }
}

/** Campos do Trinks que queremos indexados. O nome do campo de estabelecimento
 *  varia entre tipos de evento na documentação, então tentamos os conhecidos. */
export function extractTrinksFields(payload: unknown): {
  event_type: number | null
  action: number | null
  establishment_id: number | null
} {
  const p = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {}
  const num = (...keys: string[]) => {
    for (const k of keys) {
      const n = Number(p[k])
      if (p[k] !== undefined && p[k] !== null && p[k] !== '' && Number.isFinite(n)) return n
    }
    return null
  }
  return {
    event_type: num('TipoDeEvento', 'tipoDeEvento'),
    action: num('Action', 'action'),
    establishment_id: num('IdDoEstabelecimento', 'IdEstabelecimento', 'EstabelecimentoId', 'idEstabelecimento'),
  }
}

export function parseMessage(message: string): unknown {
  const t = message.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try { return JSON.parse(t) } catch { return null }
}
