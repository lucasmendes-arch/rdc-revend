import { describe, expect, it } from 'vitest'
import { createSign, generateKeyPairSync } from 'node:crypto'

import {
  extractTrinksFields, isAllowedCertUrl, isTrustedSubscription, parseEnvelope, parseMessage, stringToSign,
  verifySignature, type SnsEnvelope,
} from './sns'

// Testes simulados: chave gerada aqui faz o papel do certificado da AWS.
// verifySignature aceita tanto certificado X.509 quanto chave pública PEM.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const fechamento = {
  IdDoEstabelecimento: 194516,
  IdDaTransacao: 47999,
  ValorDaCompra: '10',
  DataDoFechamento: '2026-10-08 10:15:15',
  Action: 1,
  TipoDeEvento: 1,
}

function signed(env: Omit<SnsEnvelope, 'Signature'>, version: '1' | '2' = '2'): SnsEnvelope {
  const e = { ...env, SignatureVersion: version } as SnsEnvelope
  const s = createSign(version === '2' ? 'RSA-SHA256' : 'RSA-SHA1')
  s.update(stringToSign(e), 'utf8')
  return { ...e, Signature: s.sign(privateKey, 'base64') }
}

const base = {
  Type: 'Notification',
  MessageId: 'b7c1a2d3-0000-4000-8000-000000000001',
  TopicArn: 'arn:aws:sns:us-east-1:123456789012:trinks-webhook',
  Message: JSON.stringify(fechamento),
  Timestamp: '2026-10-08T13:15:16.000Z',
  SignatureVersion: '2',
  SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem',
}

describe('stringToSign', () => {
  it('omite Subject ausente em Notification', () => {
    expect(stringToSign(base as SnsEnvelope)).toBe(
      `Message\n${base.Message}\nMessageId\n${base.MessageId}\nTimestamp\n${base.Timestamp}\n`
      + `TopicArn\n${base.TopicArn}\nType\nNotification\n`,
    )
  })

  it('inclui Subject quando presente', () => {
    expect(stringToSign({ ...base, Subject: 'x' } as SnsEnvelope)).toContain('Subject\nx\nTimestamp')
  })

  it('usa SubscribeURL e Token em SubscriptionConfirmation', () => {
    const s = stringToSign({
      ...base, Type: 'SubscriptionConfirmation', SubscribeURL: 'https://u', Token: 't',
    } as SnsEnvelope)
    expect(s).toBe(
      `Message\n${base.Message}\nMessageId\n${base.MessageId}\nSubscribeURL\nhttps://u\n`
      + `Timestamp\n${base.Timestamp}\nToken\nt\nTopicArn\n${base.TopicArn}\nType\nSubscriptionConfirmation\n`,
    )
  })
})

describe('verifySignature', () => {
  it('aceita assinatura válida v2 (SHA256) e v1 (SHA1)', () => {
    expect(verifySignature(signed(base, '2'), pubPem)).toBe(true)
    expect(verifySignature(signed(base, '1'), pubPem)).toBe(true)
  })

  it('rejeita mensagem adulterada (valor da compra trocado)', () => {
    const env = signed(base)
    const tampered = { ...env, Message: JSON.stringify({ ...fechamento, ValorDaCompra: '99999' }) }
    expect(verifySignature(tampered, pubPem)).toBe(false)
  })

  it('rejeita assinatura de outra chave', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
      .export({ type: 'spki', format: 'pem' }).toString()
    expect(verifySignature(signed(base), other)).toBe(false)
  })

  it('rejeita versão de assinatura desconhecida e lixo', () => {
    expect(verifySignature({ ...signed(base), SignatureVersion: '3' }, pubPem)).toBe(false)
    expect(verifySignature({ ...signed(base), Signature: 'nao-base64' }, pubPem)).toBe(false)
  })
})

describe('isAllowedCertUrl', () => {
  it('aceita só HTTPS em sns.<regiao>.amazonaws.com terminando em .pem', () => {
    expect(isAllowedCertUrl(base.SigningCertURL)).toBe(true)
    expect(isAllowedCertUrl('https://sns.sa-east-1.amazonaws.com/x.pem')).toBe(true)
    expect(isAllowedCertUrl('http://sns.us-east-1.amazonaws.com/x.pem')).toBe(false)
    expect(isAllowedCertUrl('https://sns.us-east-1.amazonaws.com.evil.com/x.pem')).toBe(false)
    expect(isAllowedCertUrl('https://evil.com/sns.us-east-1.amazonaws.com/x.pem')).toBe(false)
    expect(isAllowedCertUrl('https://sns.us-east-1.amazonaws.com/x.txt')).toBe(false)
    expect(isAllowedCertUrl(undefined)).toBe(false)
  })
})

describe('parseEnvelope', () => {
  it('aceita objeto e string JSON', () => {
    const env = signed(base)
    expect(parseEnvelope(env)?.MessageId).toBe(base.MessageId)
    expect(parseEnvelope(JSON.stringify(env))?.MessageId).toBe(base.MessageId)
  })

  it('rejeita corpo sem campos obrigatórios ou não-JSON', () => {
    expect(parseEnvelope({ Type: 'Notification' })).toBeNull()
    expect(parseEnvelope('oi')).toBeNull()
    expect(parseEnvelope(null)).toBeNull()
  })
})

describe('extractTrinksFields / parseMessage', () => {
  it('extrai tipo, ação e estabelecimento do fechamento', () => {
    expect(extractTrinksFields(parseMessage(base.Message))).toEqual({
      event_type: 1, action: 1, establishment_id: 194516,
    })
  })

  it('aceita nomes alternativos de estabelecimento e devolve null quando faltam', () => {
    expect(extractTrinksFields({ TipoDeEvento: 11, IdEstabelecimento: '241717' }).establishment_id).toBe(241717)
    expect(extractTrinksFields({})).toEqual({ event_type: null, action: null, establishment_id: null })
    expect(extractTrinksFields(null).event_type).toBeNull()
  })

  it('parseMessage devolve null para texto que não é JSON', () => {
    expect(parseMessage('texto livre')).toBeNull()
    expect(parseMessage('{quebrado')).toBeNull()
  })
})

describe('isTrustedSubscription', () => {
  const topic = 'arn:aws:sns:us-east-1:441135549897:prd_integracao_rei_dos_cachos'
  const url = (t: string, host = 'sns.us-east-1.amazonaws.com') =>
    `https://${host}/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(t)}&Token=abc`
  const sub =(over: Partial<SnsEnvelope> = {}): SnsEnvelope => ({
    Type: 'SubscriptionConfirmation', MessageId: 'm', TopicArn: topic, Message: 'x',
    Timestamp: '2026-10-09T00:00:00Z', SignatureVersion: '1', Signature: 's',
    SubscribeURL: url(topic), ...over,
  } as SnsEnvelope)

  it('confirma inscrição do tópico do Trinks', () => {
    expect(isTrustedSubscription(sub())).toBe(true)
  })
  it('recusa tópico de outra conta AWS', () => {
    const other = 'arn:aws:sns:us-east-1:111111111111:qualquer'
    expect(isTrustedSubscription(sub({ TopicArn: other, SubscribeURL: url(other) }))).toBe(false)
  })
  it('recusa SubscribeURL fora da AWS', () => {
    expect(isTrustedSubscription(sub({ SubscribeURL: url(topic, 'sns.evil.com') }))).toBe(false)
    expect(isTrustedSubscription(sub({ SubscribeURL: url(topic, 'snsXus-east-1.amazonaws.com') }))).toBe(false)
  })
  it('recusa SubscribeURL de outro tópico', () => {
    expect(isTrustedSubscription(sub({ SubscribeURL: url('arn:aws:sns:us-east-1:441135549897:outro') }))).toBe(false)
  })
  it('ignora notificação comum', () => {
    expect(isTrustedSubscription(sub({ Type: 'Notification' }))).toBe(false)
  })
})
