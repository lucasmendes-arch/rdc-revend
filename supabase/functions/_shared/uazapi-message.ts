// Parser dos eventos de webhook da Uazapi (escuta passiva de WhatsApp).
//
// Módulo puro — sem Deno, sem rede — pra ser testado no vitest
// (uazapi-message.test.ts). Só extrai e classifica; a normalização de telefone
// e a conciliação com o CRM ficam no banco (phone_br_canonical / phone_br_key,
// whatsapp_process_raw_event), que é a fonte única dessas regras.
//
// Formato (docs.uazapi.com, /webhook/messages e OpenAPI): envelope com
// `EventType`, `owner`, `token`, `instanceName`; dados do evento na raiz em
// `message` e `chat`. A doc avisa pra não assumir um wrapper fixo, então
// também aceitamos `data.message` / `data`.

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export type MessageType =
  | 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker'
  | 'location' | 'contact' | 'reaction' | 'other'

export interface ParsedMessage {
  instanceToken: string | null
  owner: string | null
  eventType: string
  providerMessageId: string
  direction: 'inbound' | 'outbound'
  partyJid: string
  /** Telefone/JID de telefone da outra pessoa; null quando só há LID. */
  phoneRaw: string | null
  lid: string | null
  pushName: string | null
  messageType: MessageType
  providerType: string | null
  body: string | null
  media: Record<string, unknown> | null
  sentAt: string | null
  wasSentByApi: boolean
}

export type ParseResult =
  /** Não é mensagem de conversa individual: não grava nada. */
  | { kind: 'skip'; reason: string; instanceToken: string | null }
  /** Parece mensagem mas não dá pra usar: grava o bruto como 'ignored' pra análise. */
  | { kind: 'invalid'; reason: string; instanceToken: string | null; eventType: string | null }
  | { kind: 'message'; message: ParsedMessage }

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

function obj(v: unknown): Json | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(v)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

const isLid = (jid: string) => jid.toLowerCase().endsWith('@lid')
const isPhoneJid = (jid: string) => /@(s\.whatsapp\.net|c\.us)$/i.test(jid) || /^\+?\d[\d\s()-]{7,}$/.test(jid)

/** Grupo, status, canal, lista de transmissão — nada disso é conversa com uma pessoa. */
function nonPersonReason(jid: string): string | null {
  const j = jid.toLowerCase()
  if (j.endsWith('@g.us')) return 'grupo'
  if (j.startsWith('status@') || j.endsWith('@broadcast')) return 'status/broadcast'
  if (j.endsWith('@newsletter')) return 'canal'
  return null
}

// messageType da Uazapi vem no estilo do whatsmeow ("Conversation",
// "ExtendedTextMessage", "ImageMessage", "AudioMessage"…), às vezes em
// minúsculas ("image", "ptt").
export function mapMessageType(raw: string | null): MessageType {
  const t = (raw ?? '').toLowerCase()
  if (!t || t === 'conversation' || t.includes('extendedtext') || t === 'text' || t === 'chat') return 'text'
  if (t.includes('reaction')) return 'reaction'
  if (t.includes('sticker')) return 'sticker'
  if (t.includes('audio') || t === 'ptt' || t.includes('voice')) return 'audio'
  if (t.includes('image')) return 'image'
  if (t.includes('video') || t.includes('ptv')) return 'video'
  if (t.includes('document')) return 'document'
  if (t.includes('location')) return 'location'
  if (t.includes('contact') || t.includes('vcard')) return 'contact'
  return 'other'
}

// Tipos que não são mensagem de verdade: revogação, edição, sincronização.
const PROTOCOL_TYPES = new Set(['protocolmessage', 'senderkeydistributionmessage', 'messagecontextinfo'])

/** Timestamp da Uazapi: milissegundos (doc atual) ou segundos (versões antigas). */
export function parseTimestamp(v: unknown): string | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(n > 1e11 ? n : n * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const MEDIA_FIELDS = ['mimetype', 'fileLength', 'seconds', 'fileName', 'width', 'height', 'pageCount', 'PTT', 'ptt'] as const

/** Só metadados — nada de URL, mediaKey ou miniatura em base64. */
function mediaMetadata(content: Json | null, type: MessageType): Record<string, unknown> | null {
  if (!content || !['audio', 'image', 'video', 'document', 'sticker'].includes(type)) return null
  const out: Record<string, unknown> = {}
  for (const f of MEDIA_FIELDS) {
    const v = content[f]
    if (v === undefined || v === null || v === '') continue
    if (f === 'fileLength' || f === 'seconds' || f === 'width' || f === 'height' || f === 'pageCount') {
      const n = Number(v)
      if (Number.isFinite(n)) out[f] = n
    } else {
      out[f === 'PTT' ? 'ptt' : f] = v
    }
  }
  return Object.keys(out).length ? out : null
}

// Telefone da outra pessoa. Com chatid @lid, procura o PN que a Uazapi tenha
// resolvido; sender/sender_pn só valem quando quem enviou foi ela (numa
// mensagem nossa, são o NOSSO número).
function resolveParty(partyJid: string, msg: Json, chat: Json, fromMe: boolean) {
  if (!isLid(partyJid)) {
    return {
      phoneRaw: partyJid,
      lid: str(msg.chatlid) ?? str(chat.wa_chatlid) ?? (fromMe ? null : str(msg.sender_lid)),
    }
  }
  const candidates = [
    str(chat.phone),
    str(chat.wa_chatid),
    fromMe ? null : str(msg.sender_pn),
    fromMe ? null : str(msg.sender),
  ]
  return {
    phoneRaw: candidates.find((c): c is string => !!c && !isLid(c) && isPhoneJid(c)) ?? null,
    lid: partyJid,
  }
}

function bodyOf(msg: Json, content: Json | null): string | null {
  return (
    str(msg.text) ??
    (typeof msg.content === 'string' && !content ? str(msg.content) : null) ??
    str(content?.text) ??
    str(content?.caption) ??
    str(content?.conversation)
  )
}

function pushNameOf(msg: Json, chat: Json, fromMe: boolean): string | null {
  return fromMe
    ? str(chat.wa_contactName) ?? str(chat.wa_name) ?? str(chat.name)
    : str(msg.senderName) ?? str(chat.wa_name) ?? str(chat.wa_contactName) ?? str(chat.name)
}

export function parseUazapiEvent(payload: Json): ParseResult {
  const root = obj(payload) ?? {}
  const instanceToken = str(root.token) ?? str(root.instanceToken)
  const eventType = str(root.EventType) ?? str(root.event) ?? str(root.type)

  if (eventType && eventType.toLowerCase() !== 'messages') {
    return { kind: 'skip', reason: `evento ${eventType}`, instanceToken }
  }

  const msg = obj(root.message) ?? obj(root.data?.message) ?? obj(root.data)
  if (!msg) return { kind: 'skip', reason: 'sem objeto de mensagem', instanceToken }
  const chat = obj(root.chat) ?? obj(root.data?.chat) ?? {}

  const partyJid = str(msg.chatid) ?? str(chat.wa_chatid) ?? str(msg.key?.remoteJid) ?? str(msg.sender)
  if (!partyJid) return { kind: 'invalid', reason: 'sem chatid', instanceToken, eventType }

  const nonPerson = nonPersonReason(partyJid)
  if (nonPerson) return { kind: 'skip', reason: nonPerson, instanceToken }
  if (msg.isGroup === true || chat.wa_isGroup === true) return { kind: 'skip', reason: 'grupo', instanceToken }

  const providerType = str(msg.messageType) ?? str(msg.type) ?? str(msg.mediaType)
  if (providerType && PROTOCOL_TYPES.has(providerType.toLowerCase())) {
    return { kind: 'skip', reason: `protocolo ${providerType}`, instanceToken }
  }

  const providerMessageId = str(msg.messageid) ?? str(msg.key?.id) ?? str(msg.id)
  if (!providerMessageId) return { kind: 'invalid', reason: 'sem messageid', instanceToken, eventType }

  const fromMe = msg.fromMe === true || msg.key?.fromMe === true

  const { phoneRaw, lid } = resolveParty(partyJid, msg, chat, fromMe)
  const content = obj(msg.content)
  const messageType = mapMessageType(providerType)

  return {
    kind: 'message',
    message: {
      instanceToken,
      owner: str(root.owner) ?? str(msg.owner),
      eventType: eventType ?? 'messages',
      providerMessageId,
      direction: fromMe ? 'outbound' : 'inbound',
      partyJid,
      phoneRaw,
      lid,
      pushName: pushNameOf(msg, chat, fromMe),
      messageType,
      providerType,
      body: bodyOf(msg, content),
      media: mediaMetadata(content, messageType),
      sentAt: parseTimestamp(msg.messageTimestamp ?? msg.timestamp),
      wasSentByApi: msg.wasSentByApi === true,
    },
  }
}

/** Payload pra guardar: sem o token da instância (dado sensível, pela doc). */
export function redactPayload(payload: Json): Json {
  const root = obj(payload)
  if (!root) return payload ?? {}
  const { token: _t, instanceToken: _it, ...rest } = root
  return rest
}
