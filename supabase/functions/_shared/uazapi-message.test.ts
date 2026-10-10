import { describe, expect, it } from 'vitest'
import { mapMessageType, parseTimestamp, parseUazapiEvent, redactPayload } from './uazapi-message'

// Base: exemplo da doc oficial (docs.uazapi.com/webhook/messages).
function event(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    EventType: 'messages',
    owner: '5527900000000',
    token: 'INSTANCE_TOKEN',
    BaseUrl: 'https://reidoscachos.uazapi.com',
    instanceName: 'Atendimento',
    message: {
      id: '5527900000000:MSG1',
      messageid: 'MSG1',
      chatid: '5527999580961@s.whatsapp.net',
      sender: '5527999580961@s.whatsapp.net',
      senderName: 'Maria',
      fromMe: false,
      isGroup: false,
      messageType: 'Conversation',
      text: 'Oi, tem horário amanhã?',
      messageTimestamp: 1788868800000,
      ...message,
    },
    ...extra,
  }
}

function asMessage(payload: unknown) {
  const r = parseUazapiEvent(payload)
  if (r.kind !== 'message') throw new Error(`esperava message, veio ${r.kind}: ${'reason' in r ? r.reason : ''}`)
  return r.message
}

describe('parseUazapiEvent', () => {
  it('mensagem de texto recebida (exemplo da doc)', () => {
    const m = asMessage(event({}))
    expect(m).toMatchObject({
      instanceToken: 'INSTANCE_TOKEN',
      owner: '5527900000000',
      providerMessageId: 'MSG1',
      direction: 'inbound',
      partyJid: '5527999580961@s.whatsapp.net',
      phoneRaw: '5527999580961@s.whatsapp.net',
      lid: null,
      pushName: 'Maria',
      messageType: 'text',
      providerType: 'Conversation',
      body: 'Oi, tem horário amanhã?',
      media: null,
      wasSentByApi: false,
    })
    expect(m.sentAt).toBe(new Date(1788868800000).toISOString())
  })

  it('mensagem enviada pelo celular da unidade: outbound, contraparte é o chatid', () => {
    const m = asMessage(event({ fromMe: true, sender: '5527900000000@s.whatsapp.net', senderName: 'Unidade' },
      { chat: { wa_contactName: 'Maria Cliente' } }))
    expect(m.direction).toBe('outbound')
    expect(m.phoneRaw).toBe('5527999580961@s.whatsapp.net')
    expect(m.pushName).toBe('Maria Cliente')
    expect(m.wasSentByApi).toBe(false)
  })

  it('mensagem enviada pela API (disparo/automação)', () => {
    const m = asMessage(event({ fromMe: true, wasSentByApi: true }))
    expect(m.direction).toBe('outbound')
    expect(m.wasSentByApi).toBe(true)
  })

  it('aceita wrapper data.message', () => {
    const { message, ...env } = event({})
    const m = asMessage({ ...env, data: { message } })
    expect(m.providerMessageId).toBe('MSG1')
  })

  it('ignora grupo (por JID e por isGroup)', () => {
    expect(parseUazapiEvent(event({ chatid: '120363000000000000@g.us' }))).toMatchObject({ kind: 'skip', reason: 'grupo' })
    expect(parseUazapiEvent(event({ isGroup: true }))).toMatchObject({ kind: 'skip', reason: 'grupo' })
  })

  it('ignora status, broadcast e canal', () => {
    expect(parseUazapiEvent(event({ chatid: 'status@broadcast' }))).toMatchObject({ kind: 'skip' })
    expect(parseUazapiEvent(event({ chatid: '1234@broadcast' }))).toMatchObject({ kind: 'skip' })
    expect(parseUazapiEvent(event({ chatid: '1234@newsletter' }))).toMatchObject({ kind: 'skip', reason: 'canal' })
  })

  it('ignora eventos que não são mensagem', () => {
    for (const ev of ['connection', 'messages_update', 'presence', 'chats', 'call']) {
      expect(parseUazapiEvent({ EventType: ev, token: 't' })).toMatchObject({ kind: 'skip', instanceToken: 't' })
    }
  })

  it('ignora mensagens de protocolo (apagar/editar)', () => {
    expect(parseUazapiEvent(event({ messageType: 'ProtocolMessage' }))).toMatchObject({ kind: 'skip' })
  })

  it('sem messageid: invalid (fica no bruto pra análise)', () => {
    const r = parseUazapiEvent(event({ messageid: undefined, id: undefined }))
    expect(r).toMatchObject({ kind: 'invalid', reason: 'sem messageid' })
  })

  it('LID com telefone resolvido em sender_pn', () => {
    const m = asMessage(event({
      chatid: '204871234567890@lid',
      sender: '204871234567890@lid',
      sender_pn: '5527999580961@s.whatsapp.net',
      sender_lid: '204871234567890@lid',
    }))
    expect(m.lid).toBe('204871234567890@lid')
    expect(m.phoneRaw).toBe('5527999580961@s.whatsapp.net')
  })

  it('LID com telefone em chat.phone', () => {
    const m = asMessage(event({ chatid: '204871234567890@lid', sender: '204871234567890@lid' },
      { chat: { phone: '+55 27 99958-0961', wa_chatlid: '204871234567890@lid' } }))
    expect(m.phoneRaw).toBe('+55 27 99958-0961')
  })

  it('chatid com telefone: guarda o LID de message.chatlid (formato real de Linhares)', () => {
    const m = asMessage(event({ chatlid: '204871234567890@lid', sender_lid: '' }))
    expect(m.phoneRaw).toBe('5527999580961@s.whatsapp.net')
    expect(m.lid).toBe('204871234567890@lid')
  })

  it('reação enviada pela unidade', () => {
    const m = asMessage(event({ fromMe: true, messageType: 'ReactionMessage', text: '❤️', reaction: 'MSG0' }))
    expect(m.messageType).toBe('reaction')
    expect(m.direction).toBe('outbound')
  })

  it('LID sem telefone: não descarta, phoneRaw nulo', () => {
    const m = asMessage(event({ chatid: '204871234567890@lid', sender: '204871234567890@lid' }))
    expect(m.lid).toBe('204871234567890@lid')
    expect(m.phoneRaw).toBeNull()
  })

  it('LID em mensagem enviada: sender_pn é o nosso número e não pode virar telefone da cliente', () => {
    const m = asMessage(event({
      fromMe: true,
      chatid: '204871234567890@lid',
      sender: '5527900000000@s.whatsapp.net',
      sender_pn: '5527900000000@s.whatsapp.net',
    }))
    expect(m.phoneRaw).toBeNull()
  })

  it('áudio: só metadados da mídia, sem URL nem chave', () => {
    const m = asMessage(event({
      messageType: 'AudioMessage',
      text: '',
      content: {
        URL: 'https://mmg.whatsapp.net/xyz',
        mediaKey: 'segredo',
        mimetype: 'audio/ogg; codecs=opus',
        fileLength: '12345',
        seconds: 7,
        PTT: true,
      },
    }))
    expect(m.messageType).toBe('audio')
    expect(m.body).toBeNull()
    expect(m.media).toEqual({ mimetype: 'audio/ogg; codecs=opus', fileLength: 12345, seconds: 7, ptt: true })
  })

  it('imagem com legenda; content como JSON serializado', () => {
    const m = asMessage(event({
      messageType: 'ImageMessage',
      text: undefined,
      content: JSON.stringify({ caption: 'meu cabelo hoje', mimetype: 'image/jpeg', width: 1080, height: 1920 }),
    }))
    expect(m.messageType).toBe('image')
    expect(m.body).toBe('meu cabelo hoje')
    expect(m.media).toEqual({ mimetype: 'image/jpeg', width: 1080, height: 1920 })
  })

  it('timestamp em segundos também é aceito', () => {
    const m = asMessage(event({ messageTimestamp: 1788868800 }))
    expect(m.sentAt).toBe(new Date(1788868800000).toISOString())
  })
})

describe('mapMessageType', () => {
  it.each([
    ['Conversation', 'text'],
    ['ExtendedTextMessage', 'text'],
    ['ImageMessage', 'image'],
    ['AudioMessage', 'audio'],
    ['ptt', 'audio'],
    ['VideoMessage', 'video'],
    ['DocumentMessage', 'document'],
    ['DocumentWithCaptionMessage', 'document'],
    ['StickerMessage', 'sticker'],
    ['LocationMessage', 'location'],
    ['ContactMessage', 'contact'],
    ['ReactionMessage', 'reaction'],
    ['PollCreationMessage', 'other'],
  ])('%s → %s', (raw, expected) => {
    expect(mapMessageType(raw)).toBe(expected)
  })
})

describe('parseTimestamp', () => {
  it('rejeita lixo', () => {
    expect(parseTimestamp(undefined)).toBeNull()
    expect(parseTimestamp('abc')).toBeNull()
    expect(parseTimestamp(0)).toBeNull()
  })
})

describe('redactPayload', () => {
  it('remove o token da instância e mantém o resto', () => {
    const r = redactPayload(event({}))
    expect(r.token).toBeUndefined()
    expect(r.message.messageid).toBe('MSG1')
    expect(r.owner).toBe('5527900000000')
  })
})
