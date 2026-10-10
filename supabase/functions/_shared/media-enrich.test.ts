import { describe, expect, it } from 'vitest'
import { audioFormat, buildOpenRouterBody, parseOpenRouterResponse, sha256OfBase64 } from './media-enrich'

describe('sha256OfBase64', () => {
  it('hash do conteúdo decodificado (base64 de "abc")', async () => {
    expect(await sha256OfBase64('YWJj')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('audioFormat', () => {
  it.each([
    ['audio/mpeg', 'mp3'],
    ['audio/ogg; codecs=opus', 'ogg'],
    ['audio/wav', 'wav'],
    ['audio/mp4', 'm4a'],
    [null, 'mp3'],
  ])('%s → %s', (mime, fmt) => {
    expect(audioFormat(mime)).toBe(fmt)
  })
})

describe('buildOpenRouterBody', () => {
  it('áudio vai como input_audio com o formato do mimetype', () => {
    const b = buildOpenRouterBody({ kind: 'transcription', model: 'm', base64: 'QUJD', mimetype: 'audio/mpeg' })
    const parts = b.messages[0].content as { type: string; input_audio?: { data: string; format: string } }[]
    expect(parts[1]).toEqual({ type: 'input_audio', input_audio: { data: 'QUJD', format: 'mp3' } })
    expect(b.usage).toEqual({ include: true })
    expect(b.temperature).toBe(0)
  })

  it('imagem vai como data URL e leva a legenda junto', () => {
    const b = buildOpenRouterBody({
      kind: 'image_description', model: 'm', base64: 'QUJD', mimetype: 'image/png', caption: 'olha meu cabelo',
    })
    const parts = b.messages[0].content as { type: string; text?: string; image_url?: { url: string } }[]
    expect(parts[0].text).toContain('olha meu cabelo')
    expect(parts[1].image_url?.url).toBe('data:image/png;base64,QUJD')
  })
})

describe('parseOpenRouterResponse', () => {
  it('extrai texto e custo', () => {
    expect(parseOpenRouterResponse({
      choices: [{ message: { content: '  "Oi, queria marcar pra sexta"  ' } }],
      usage: { cost: 0.000123 },
    })).toEqual({ text: 'Oi, queria marcar pra sexta', costUsd: 0.000123 })
  })

  it('erro do OpenRouter vira exceção', () => {
    expect(() => parseOpenRouterResponse({ error: { message: 'Insufficient credits' } })).toThrow('Insufficient credits')
  })

  it('resposta vazia vira exceção', () => {
    expect(() => parseOpenRouterResponse({ choices: [{ message: { content: '' } }] })).toThrow('sem texto')
  })
})
