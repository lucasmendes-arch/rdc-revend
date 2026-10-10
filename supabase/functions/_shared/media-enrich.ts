// Montagem da chamada ao OpenRouter para transcrever áudio / descrever imagem
// do WhatsApp, e leitura da resposta. Módulo puro (testado no vitest:
// media-enrich.test.ts); a rede fica em whatsapp-enrich-media/index.ts.

export type EnrichmentKind = 'transcription' | 'image_description'

const AUDIO_PROMPT =
  'Transcreva este áudio de WhatsApp em português do Brasil, palavra por palavra. ' +
  'Responda somente com a transcrição, sem comentários nem aspas. ' +
  'Se não houver fala compreensível, responda exatamente: [sem fala]'

const IMAGE_PROMPT =
  'Imagem trocada no WhatsApp de atendimento de um salão de beleza especializado em cabelos cacheados. ' +
  'Descreva objetivamente, em no máximo 2 frases, o que a imagem mostra ' +
  '(ex.: foto do cabelo da cliente, referência de corte, comprovante de pagamento, print de agenda, produto). ' +
  'Se houver texto relevante na imagem (valores, datas, horários, nomes de produto), transcreva. ' +
  'Responda somente com a descrição.'

/** Formato de áudio aceito pelo OpenRouter (input_audio.format). */
export function audioFormat(mimetype: string | null | undefined): string {
  const m = (mimetype ?? '').toLowerCase()
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  if (m.includes('ogg') || m.includes('opus')) return 'ogg'
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a'
  if (m.includes('webm')) return 'webm'
  return 'mp3'
}

export function buildOpenRouterBody(params: {
  kind: EnrichmentKind
  model: string
  base64: string
  mimetype: string
  caption?: string | null
}) {
  const { kind, model, base64, mimetype, caption } = params
  const content =
    kind === 'transcription'
      ? [
          { type: 'text', text: AUDIO_PROMPT },
          { type: 'input_audio', input_audio: { data: base64, format: audioFormat(mimetype) } },
        ]
      : [
          {
            type: 'text',
            text: caption ? `${IMAGE_PROMPT}\nLegenda enviada junto: "${caption}"` : IMAGE_PROMPT,
          },
          { type: 'image_url', image_url: { url: `data:${mimetype || 'image/jpeg'};base64,${base64}` } },
        ]
  return {
    model,
    messages: [{ role: 'user', content }],
    temperature: 0,
    max_tokens: kind === 'transcription' ? 2000 : 300,
    // Devolve o custo real da chamada em usage.cost.
    usage: { include: true },
  }
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOpenRouterResponse(json: any): { text: string; costUsd: number | null } {
  if (json?.error) throw new Error(`OpenRouter: ${json.error.message ?? JSON.stringify(json.error)}`)
  const raw = json?.choices?.[0]?.message?.content
  const text = (typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => p?.text ?? '').join('') : '')
    .trim()
    .replace(/^["“](.*)["”]$/s, '$1')
  if (!text) throw new Error('OpenRouter: resposta sem texto')
  const cost = Number(json?.usage?.cost)
  return { text, costUsd: Number.isFinite(cost) ? cost : null }
}
