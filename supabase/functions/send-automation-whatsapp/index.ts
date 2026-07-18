import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Drena automation_whatsapp_queue (enfileirada pela ação send_whatsapp do
// motor de automações do RH — ver supabase/migrations/20260719000002/3).
// Chamada a cada minuto pelo pg_cron (job 'rh-automation-whatsapp-sender'),
// sem Authorization header — igual ao padrão já usado em
// cron-commission-reports. Reforço extra: shared secret opcional via header,
// já que este endpoint dispara envio real de mensagem.
//
// Resolve credencial Uazapi por loja (store_whatsapp_credentials) com
// fallback pra instância global (UAZAPI_URL/UAZAPI_TOKEN) enquanto a tabela
// não estiver populada com dados reais por unidade.

interface QueueItem {
  id: string
  candidate_id: string
  store_id: string
  automation_id: string | null
  template_id: string | null
  phone_number: string
  rendered_message: string
  attempt_count: number
}

const BATCH_SIZE = 20

serve(async (req) => {
  const cronSecret = Deno.env.get('AUTOMATION_CRON_SECRET')
  if (cronSecret && req.headers.get('x-automation-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const globalUazapiUrl = Deno.env.get('UAZAPI_URL')
  const globalUazapiToken = Deno.env.get('UAZAPI_TOKEN')

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase service credentials')
    return new Response(JSON.stringify({ success: false, message: 'Not configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = createClient(supabaseUrl, serviceKey)

  const { data: items, error: claimError } = await client.rpc('claim_automation_whatsapp_queue_items', {
    p_batch_size: BATCH_SIZE,
  })

  if (claimError) {
    console.error('Failed to claim queue items:', claimError.message)
    return new Response(JSON.stringify({ success: false, error: claimError.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const queueItems = (items || []) as QueueItem[]
  let sent = 0
  let failed = 0

  for (const item of queueItems) {
    const { data: cred } = await client
      .from('store_whatsapp_credentials')
      .select('uazapi_url, uazapi_token, is_active')
      .eq('store_id', item.store_id)
      .maybeSingle()

    const uazapiUrl = cred?.is_active && cred?.uazapi_url ? cred.uazapi_url : globalUazapiUrl
    const uazapiToken = cred?.is_active && cred?.uazapi_token ? cred.uazapi_token : globalUazapiToken

    if (!uazapiUrl || !uazapiToken) {
      await finalizeItem(client, item, false, 'Nenhuma credencial Uazapi disponível (nem por loja, nem global)')
      failed++
      continue
    }

    try {
      // Mesmo formato já usado em send-order-whatsapp/notify-replenishment.
      const response = await fetch(`${uazapiUrl}/send/text?token=${encodeURIComponent(uazapiToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: item.phone_number, text: item.rendered_message }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        await finalizeItem(client, item, false, `uazapi ${response.status}: ${errorText}`)
        failed++
      } else {
        await finalizeItem(client, item, true, null)
        sent++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      await finalizeItem(client, item, false, message)
      failed++
    }
  }

  return new Response(JSON.stringify({ success: true, sent, failed, claimed: queueItems.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

async function finalizeItem(
  client: ReturnType<typeof createClient>,
  item: QueueItem,
  success: boolean,
  errorMessage: string | null
) {
  const nextStatus = success ? 'sent' : item.attempt_count < 3 ? 'pending' : 'failed'

  await client
    .from('automation_whatsapp_queue')
    .update({ status: nextStatus, processed_at: new Date().toISOString(), last_error: errorMessage })
    .eq('id', item.id)

  await client.from('candidate_stage_history').insert({
    candidate_id: item.candidate_id,
    event_type: 'whatsapp_sent',
    automation_id: item.automation_id,
    metadata: { template_id: item.template_id, success, error: errorMessage },
  })
}
