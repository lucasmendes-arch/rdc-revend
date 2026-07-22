// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGoogleAccessToken, findOrCreateFolder, copyTemplate, replacePlaceholders, getWebViewLink,
  decomposeDatePtBR, formatDateBR, todayISO, addDaysISO, type FieldMap,
} from '../_shared/googleDrive.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

const ALLOWED_ORIGINS = ['https://rdc-os.vercel.app']

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const isLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
  const allowed = ALLOWED_ORIGINS.includes(origin) || isLocal ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(req ? corsHeaders(req) : {}) },
  })
}

type ContractType = 'formacao' | 'prestacao_servico'

// Campos exigidos por tipo de contrato — mesma regra de
// src/lib/dpConstants.ts (REQUIRED_CONTRACT_DATA_FIELDS). Duplicado aqui
// porque edge functions (Deno) não compartilham build com o frontend;
// manter os dois em sincronia se a regra mudar.
const REQUIRED_FIELDS_BY_TYPE: Record<ContractType, string[]> = {
  formacao: ['cpf', 'birth_date', 'address', 'email'],
  // 'prestacao_servico' ainda não tem template real confirmado — fora de
  // escopo desta rodada ("por partes"). Mantido só pra não quebrar a
  // resolução de contractType existente.
  prestacao_servico: ['cpf', 'rg', 'birth_date', 'marital_status', 'nationality', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'],
}

function buildFormacaoFieldMap(input: {
  store: { legal_name: string | null; cnpj: string | null; legal_address: string | null; name: string }
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
    // Anexo I — preenchido fisicamente depois (frequência do curso).
    '{{carga_horaria_cumprida}}': '',
    '{{data_declaracao}}': '',
    '{{dia_declaracao}}': '',
    '{{mes_declaracao}}': '',
    '{{ano_declaracao}}': '',
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401, req)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401, req)

    const { data: hasAccess, error: accessErr } = await userClient.rpc('has_rh_access')
    if (accessErr || !hasAccess) return json({ error: 'Acesso negado' }, 403, req)

    const { process_id, term_start, term_end } = await req.json()
    if (!process_id) return json({ error: 'process_id é obrigatório' }, 400, req)

    const serviceClient = createClient(supabaseUrl, supabaseService)

    const { data: processo, error: processoErr } = await serviceClient
      .from('employee_processes')
      .select('id, employment_type, current_stage, role_title, candidates(name, whatsapp), stores(name, legal_name, cnpj, legal_address)')
      .eq('id', process_id)
      .single()
    if (processoErr || !processo) return json({ error: 'Processo não encontrado' }, 404, req)

    // ── Resolve contract_type a partir do estágio/tipo de vínculo ──────
    let contractType: ContractType | null = null
    if (processo.employment_type === 'mei') {
      contractType = ['contrato_formacao', 'formacao', 'decisao_formacao'].includes(processo.current_stage)
        ? 'formacao'
        : 'prestacao_servico'
    }
    if (!contractType) {
      return json({ error: 'Este tipo de vínculo (CLT) ainda não tem template de contrato configurado' }, 400, req)
    }

    const { data: contractData } = await serviceClient
      .from('employee_contract_data')
      .select('*')
      .eq('process_id', process_id)
      .maybeSingle()
    if (!contractData) {
      return json({ error: 'Preencha os dados pessoais do colaborador (CPF, endereço etc.) antes de gerar o contrato' }, 400, req)
    }

    const missingFields = REQUIRED_FIELDS_BY_TYPE[contractType].filter((f) => !contractData[f])
    if (missingFields.length > 0) {
      return json({ error: `Faltam dados obrigatórios pra este tipo de contrato: ${missingFields.join(', ')}` }, 400, req)
    }

    const { data: existing } = await serviceClient
      .from('employee_contracts')
      .select('id')
      .eq('process_id', process_id)
      .eq('contract_type', contractType)
      .maybeSingle()
    if (existing) {
      return json({ error: 'Já existe um contrato desse tipo gerado pra este processo' }, 400, req)
    }

    const { data: template, error: templateErr } = await serviceClient
      .from('contract_templates')
      .select('google_doc_id, is_active')
      .eq('contract_type', contractType)
      .maybeSingle()
    if (templateErr || !template || !template.is_active) {
      return json({ error: `Template de contrato "${contractType}" não configurado` }, 400, req)
    }

    const rootFolderId = Deno.env.get('GOOGLE_CONTRACTS_ROOT_FOLDER_ID')
    if (!rootFolderId) return json({ error: 'Pasta raiz de contratos no Drive não configurada' }, 500, req)

    const candidateName = processo.candidates?.name ?? ''
    const store = processo.stores ?? { name: '', legal_name: null, cnpj: null, legal_address: null }

    const accessToken = await getGoogleAccessToken()
    const unitFolderId = await findOrCreateFolder(accessToken, store.name, rootFolderId)
    const candidateFolderId = await findOrCreateFolder(accessToken, candidateName, unitFolderId)

    const docName = `${candidateName} - Contrato de Formação`
    const newDocId = await copyTemplate(accessToken, template.google_doc_id, docName, candidateFolderId)

    const termStart = term_start || todayISO()
    const termEnd = term_end || addDaysISO(termStart, 10)

    const fieldMap = buildFormacaoFieldMap({
      store, candidateName, candidateWhatsapp: processo.candidates?.whatsapp ?? '', contractData, termStart, termEnd,
    })
    await replacePlaceholders(accessToken, newDocId, fieldMap)
    const googleDocUrl = await getWebViewLink(accessToken, newDocId)

    const { data: contractRow, error: insertErr } = await serviceClient
      .from('employee_contracts')
      .insert({
        process_id,
        contract_type: contractType,
        file_url: googleDocUrl,
        term_start: termStart,
        term_end: termEnd,
      })
      .select('id')
      .single()
    if (insertErr) {
      console.error('Insert employee_contracts error:', insertErr.message)
      return json({ error: 'Erro ao registrar o contrato gerado' }, 500, req)
    }

    return json({ success: true, contract_id: contractRow.id, google_doc_url: googleDocUrl }, 200, req)
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500, req)
  }
})
