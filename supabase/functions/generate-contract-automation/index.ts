// Geração automática de contrato — disparada pelo Postgres (trigger em
// employee_processes/employee_contract_data, via pg_net), não por um
// usuário logado. Ver migration 20260722000005 e o plano da feature.
// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGoogleAccessToken, findOrCreateFolder, copyTemplate, replacePlaceholders, getWebViewLink,
  decomposeDatePtBR, formatDateBR, todayISO, addDaysISO, type FieldMap,
} from '../_shared/googleDrive.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Intent = 'formacao' | 'desligamento_formacao'

const REQUIRED_FIELDS: Record<Intent, string[]> = {
  formacao: ['cpf', 'birth_date', 'address', 'email'],
  desligamento_formacao: [],
}

interface StoreRow { name: string; legal_name: string | null; cnpj: string | null; legal_address: string | null }

function buildFormacaoFieldMap(input: {
  store: StoreRow
  candidateName: string
  candidateWhatsapp: string
  contractData: Record<string, unknown>
  termStart: string
  termEnd: string
}): FieldMap {
  const { store, candidateName, candidateWhatsapp, contractData, termStart, termEnd } = input
  const { dia, mes, ano } = decomposeDatePtBR(todayISO())
  return {
    '{{razao_social}}': store.legal_name || '',
    '{{cnpj}}': store.cnpj || '',
    '{{endereco}}': store.legal_address || '',
    '{{nome_completo}}': candidateName,
    '{{cpf}}': (contractData.cpf as string) || '',
    '{{data_nascimento}}': formatDateBR((contractData.birth_date as string) || null),
    '{{endereco_completo}}': (contractData.address as string) || '',
    '{{telefone_whatsapp}}': candidateWhatsapp,
    '{{email}}': (contractData.email as string) || '',
    '{{local}}': store.name,
    '{{dia_assinatura}}': dia,
    '{{mes_assinatura}}': mes,
    '{{ano_assinatura}}': ano,
    '{{data_inicio_curso}}': formatDateBR(termStart),
    '{{data_fim_curso}}': formatDateBR(termEnd),
    '{{carga_horaria_cumprida}}': '',
    '{{data_declaracao}}': '',
    '{{dia_declaracao}}': '',
    '{{mes_declaracao}}': '',
    '{{ano_declaracao}}': '',
  }
}

function buildDesligamentoFieldMap(input: {
  store: StoreRow
  candidateName: string
  cpf: string
  cursoInicio: string | null
  cursoFim: string | null
}): FieldMap {
  const { store, candidateName, cpf, cursoInicio, cursoFim } = input
  return {
    '{{razao_social}}': store.legal_name || '',
    '{{cnpj}}': store.cnpj || '',
    '{{endereco}}': store.legal_address || '',
    '{{nome_completo}}': candidateName,
    '{{cpf}}': cpf,
    '{{data_inicio_curso}}': formatDateBR(cursoInicio),
    '{{data_fim_curso}}': formatDateBR(cursoFim),
    '{{local}}': store.name,
    '{{data_desligamento}}': formatDateBR(todayISO()),
  }
}

async function sendWhatsAppNotification(
  serviceClient: ReturnType<typeof createClient>,
  storeId: string,
  phone: string,
  candidateName: string,
  docLabel: string,
  link: string | null,
) {
  const { data: cred } = await serviceClient
    .from('store_whatsapp_credentials')
    .select('uazapi_url, uazapi_token, is_active')
    .eq('store_id', storeId)
    .maybeSingle()

  const uazapiUrl = cred?.is_active && cred?.uazapi_url ? cred.uazapi_url : Deno.env.get('UAZAPI_URL')
  const uazapiToken = cred?.is_active && cred?.uazapi_token ? cred.uazapi_token : Deno.env.get('UAZAPI_TOKEN')
  if (!uazapiUrl || !uazapiToken) {
    console.warn('Sem credencial Uazapi disponível (nem por loja, nem global) — notificação não enviada')
    return
  }

  const message = [
    `📄 *${docLabel} gerado*`,
    ``,
    `👤 Candidato: ${candidateName}`,
    link ? `🔗 ${link}` : '',
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch(`${uazapiUrl}/send/text?token=${encodeURIComponent(uazapiToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text: message }),
    })
    if (!res.ok) console.warn('Falha ao enviar WhatsApp (non-blocking):', await res.text())
  } catch (err) {
    console.warn('Erro ao enviar WhatsApp (non-blocking):', err)
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('CONTRACT_AUTOMATION_SECRET')
  if (!expectedSecret || req.headers.get('x-automation-secret') !== expectedSecret) {
    return json({ error: 'Forbidden' }, 403)
  }

  try {
    const { process_id, intent } = await req.json() as { process_id?: string; intent?: Intent }
    if (!process_id || !intent) return json({ error: 'process_id e intent são obrigatórios' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, supabaseService)

    const { data: processo, error: processoErr } = await serviceClient
      .from('employee_processes')
      .select('id, store_id, candidates(name, whatsapp, assignee_id), stores(name, legal_name, cnpj, legal_address)')
      .eq('id', process_id)
      .single()
    if (processoErr || !processo) return json({ error: 'Processo não encontrado' }, 404)

    // ── Idempotência: já gerado? ────────────────────────────────────
    const { data: existing } = await serviceClient
      .from('employee_contracts')
      .select('id')
      .eq('process_id', process_id)
      .eq('contract_type', intent)
      .maybeSingle()
    if (existing) return json({ skipped: true, reason: 'already_generated' })

    const { data: contractData } = await serviceClient
      .from('employee_contract_data')
      .select('*')
      .eq('process_id', process_id)
      .maybeSingle()

    const missingFields = REQUIRED_FIELDS[intent].filter((f) => !contractData?.[f])
    if (missingFields.length > 0) {
      return json({ skipped: true, reason: 'missing_fields', fields: missingFields })
    }

    const { data: template, error: templateErr } = await serviceClient
      .from('contract_templates')
      .select('google_doc_id, is_active')
      .eq('contract_type', intent)
      .maybeSingle()
    if (templateErr || !template || !template.is_active) {
      return json({ skipped: true, reason: 'template_not_configured' })
    }

    const rootFolderId = Deno.env.get('GOOGLE_CONTRACTS_ROOT_FOLDER_ID')
    if (!rootFolderId) return json({ error: 'Pasta raiz de contratos no Drive não configurada' }, 500)

    const candidateName = processo.candidates?.name ?? ''
    const store = (processo.stores ?? { name: '', legal_name: null, cnpj: null, legal_address: null }) as StoreRow

    const accessToken = await getGoogleAccessToken()
    const unitFolderId = await findOrCreateFolder(accessToken, store.name, rootFolderId)
    const candidateFolderId = await findOrCreateFolder(accessToken, candidateName, unitFolderId)

    let fieldMap: FieldMap
    let termStart: string | null = null
    let termEnd: string | null = null
    let docLabel: string

    if (intent === 'formacao') {
      termStart = todayISO()
      termEnd = addDaysISO(termStart, 10)
      fieldMap = buildFormacaoFieldMap({
        store, candidateName, candidateWhatsapp: processo.candidates?.whatsapp ?? '',
        contractData: contractData!, termStart, termEnd,
      })
      docLabel = 'Contrato de Formação'
    } else {
      const { data: formacaoContract } = await serviceClient
        .from('employee_contracts')
        .select('term_start, term_end')
        .eq('process_id', process_id)
        .eq('contract_type', 'formacao')
        .maybeSingle()
      fieldMap = buildDesligamentoFieldMap({
        store, candidateName, cpf: (contractData?.cpf as string) || '',
        cursoInicio: formacaoContract?.term_start ?? null, cursoFim: formacaoContract?.term_end ?? null,
      })
      docLabel = 'Comunicação de Desligamento do Curso'
    }

    const docName = `${candidateName} - ${docLabel}`
    const newDocId = await copyTemplate(accessToken, template.google_doc_id, docName, candidateFolderId)
    await replacePlaceholders(accessToken, newDocId, fieldMap)
    const googleDocUrl = await getWebViewLink(accessToken, newDocId)

    const { data: contractRow, error: insertErr } = await serviceClient
      .from('employee_contracts')
      .insert({ process_id, contract_type: intent, file_url: googleDocUrl, term_start: termStart, term_end: termEnd })
      .select('id')
      .single()
    if (insertErr) {
      console.error('Insert employee_contracts error:', insertErr.message)
      return json({ error: 'Erro ao registrar o contrato gerado' }, 500)
    }

    // ── Notifica o responsável vinculado ao candidato (best-effort) ────
    const assigneeId = processo.candidates?.assignee_id
    if (assigneeId) {
      const { data: responsavel } = await serviceClient
        .from('profiles')
        .select('whatsapp_number')
        .eq('id', assigneeId)
        .maybeSingle()
      if (responsavel?.whatsapp_number) {
        await sendWhatsAppNotification(serviceClient, processo.store_id, responsavel.whatsapp_number, candidateName, docLabel, googleDocUrl)
      }
    }

    return json({ success: true, contract_id: contractRow.id, google_doc_url: googleDocUrl })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500)
  }
})
