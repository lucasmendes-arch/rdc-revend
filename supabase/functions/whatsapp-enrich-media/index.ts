import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { timingSafeEqual } from '../_shared/timingSafe.ts'
import { buildOpenRouterBody, parseOpenRouterResponse, sha256OfBase64, type EnrichmentKind } from '../_shared/media-enrich.ts'

// Transcreve áudio e descreve imagem das mensagens da escuta de WhatsApp.
// Chamada a cada minuto pelo pg_cron (job 'whatsapp-enrich-media') só quando há
// fila. Para cada item:
//   1. baixa a mídia pela Uazapi — POST /message/download. É LEITURA: busca o
//      arquivo no CDN do WhatsApp como o WhatsApp Web faria ao abrir a conversa.
//      Não envia mensagem, não marca como lido. Única chamada à Uazapi da escuta;
//   2. manda ao modelo via OpenRouter;
//   3. grava só o texto em whatsapp_message_enrichments. O arquivo não é salvo
//      em lugar nenhum (decisão do usuário: transcrever e descartar).
//
// Fail-closed: exige x-cron-secret = WHATSAPP_ENRICH_CRON_SECRET (o cron lê o
// mesmo valor do Vault). Sem o secret configurado, recusa tudo.

declare const Deno: { env: { get(k: string): string | undefined } }

const BATCH = 5
const MAX_BYTES = 15 * 1024 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface Claimed {
  enrichment_id: string
  kind: EnrichmentKind
  message_id: string
  instance_id: string | null
  provider_message_id: string
  owner: string | null
  media: { seconds?: number; fileLength?: number; mimetype?: string } | null
  body: string | null
  model: string
  max_audio_seconds: number
}

async function downloadMedia(baseUrl: string, token: string, ids: string[]) {
  let lastError = ''
  for (const id of ids) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/message/download`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, return_base64: true, generate_mp3: true }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.base64Data) return { base64: data.base64Data as string, mimetype: (data.mimetype as string) ?? '' }
      lastError = 'download sem base64Data'
    } else {
      lastError = `download HTTP ${res.status}`
    }
  }
  throw new Error(lastError || 'download falhou')
}

serve(async (req) => {
  const cronSecret = Deno.env.get('WHATSAPP_ENRICH_CRON_SECRET')
  if (!cronSecret || !timingSafeEqual(req.headers.get('x-cron-secret') ?? '', cronSecret)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!supabaseUrl || !serviceKey || !openrouterKey) {
    console.error('Configuração ausente (SUPABASE_* ou OPENROUTER_API_KEY)')
    return json({ error: 'Not configured' }, 500)
  }

  const db = createClient(supabaseUrl, serviceKey)
  const { data: items, error } = await db.rpc('whatsapp_claim_enrichments', { p_limit: BATCH })
  if (error) {
    console.error('Falha ao reivindicar fila:', error.message)
    return json({ error: 'claim' }, 500)
  }

  const results: Record<string, string> = {}
  const instances = new Map<string, { uazapi_url: string; uazapi_token: string }>()

  for (const it of (items ?? []) as Claimed[]) {
    const finish = (patch: Record<string, unknown>) =>
      db.from('whatsapp_message_enrichments').update({ processed_at: new Date().toISOString(), ...patch })
        .eq('id', it.enrichment_id)

    try {
      if (it.kind === 'transcription' && (it.media?.seconds ?? 0) > it.max_audio_seconds) {
        await finish({ status: 'skipped', last_error: `áudio de ${it.media?.seconds}s acima do limite` })
        results[it.enrichment_id] = 'skipped'
        continue
      }
      if ((it.media?.fileLength ?? 0) > MAX_BYTES) {
        await finish({ status: 'skipped', last_error: 'arquivo acima de 15 MB' })
        results[it.enrichment_id] = 'skipped'
        continue
      }
      if (!it.instance_id) throw new Error('mensagem sem instância')

      let inst = instances.get(it.instance_id)
      if (!inst) {
        const { data, error: e } = await db.from('whatsapp_instances')
          .select('uazapi_url, uazapi_token').eq('id', it.instance_id).single()
        if (e || !data) throw new Error('instância não encontrada')
        inst = data
        instances.set(it.instance_id, data)
      }

      // A doc da Uazapi pede o "ID da mensagem"; aceita o messageid puro e,
      // em algumas versões, o id composto owner:messageid.
      const ids = [it.provider_message_id, it.owner ? `${it.owner}:${it.provider_message_id}` : null]
        .filter((x): x is string => !!x)
      const media = await downloadMedia(inst.uazapi_url, inst.uazapi_token, ids)

      // Cache por arquivo: mensagem rápida com a mesma mídia para várias
      // clientes chama a IA uma vez só.
      const sha = await sha256OfBase64(media.base64)
      const { data: hit } = await db.from('whatsapp_message_enrichments')
        .select('id, text, model')
        .eq('kind', it.kind).eq('status', 'done').eq('media_sha256', sha)
        .not('text', 'is', null)
        .order('processed_at', { ascending: true })
        .limit(1).maybeSingle()
      if (hit) {
        const origin = (hit.model as string | null)?.replace(/^cache:/, '') ?? it.model
        await finish({
          status: 'done', text: hit.text, model: `cache:${origin}`, cost_usd: 0,
          media_sha256: sha, cached_from: hit.id, last_error: null,
        })
        results[it.enrichment_id] = 'cache'
        continue
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOpenRouterBody({
          kind: it.kind, model: it.model, base64: media.base64,
          mimetype: media.mimetype || it.media?.mimetype || '', caption: it.body,
        })),
      })
      const { text, costUsd } = parseOpenRouterResponse(await res.json())

      await finish({ status: 'done', text, model: it.model, cost_usd: costUsd, media_sha256: sha, last_error: null })
      results[it.enrichment_id] = 'done'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Enriquecimento ${it.enrichment_id} falhou:`, msg)
      // Volta pra fila; whatsapp_claim_enrichments marca 'failed' na 3ª tentativa.
      await finish({ status: 'pending', last_error: msg.slice(0, 500), processed_at: null })
      results[it.enrichment_id] = `erro: ${msg}`
    }
  }

  return json({ ok: true, processed: results })
})
