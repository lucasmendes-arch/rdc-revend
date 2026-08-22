// Geração automática de contrato — disparada pelo Postgres (trigger em
// employee_processes/employee_contract_data, via pg_net), não por um
// usuário logado. Ver migration 20260722000005 e o plano da feature.
// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGoogleAccessToken, findOrCreateFolder, copyTemplate, replacePlaceholders, getWebViewLink,
  decomposeDatePtBR, formatDateBR, formatCPF, formatPhoneBR, todayISO,
  addBusinessDaysISO, FORMACAO_COURSE_BUSINESS_DAYS,
  resolveUnitFolderName, resolveContractLocal, type FieldMap,
} from '../_shared/googleDrive.ts'
import { timingSafeEqual } from '../_shared/timingSafe.ts'
import { syncContractDataToCard } from '../_shared/contractSync.ts'
import { notifyContractGenerated } from '../_shared/contractNotify.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Intent = 'formacao' | 'desligamento_formacao'

const REQUIRED_FIELDS: Record<Intent, string[]> = {
  formacao: ['cpf', 'birth_date', 'address'],
  desligamento_formacao: [],
}

interface StoreRow { name: string; slug: string; uf: string | null; legal_name: string | null; cnpj: string | null; legal_address: string | null }

function buildFormacaoFieldMap(input: {
  store: StoreRow
  candidateName: string
  candidateWhatsapp: string
  contractData: Record<string, unknown>
  termStart: string
  termEnd: string
}): FieldMap {
  const { store, candidateName, candidateWhatsapp, contractData, termStart, termEnd } = input
  // Assinatura na data de início da vigência, não no dia em que o arquivo foi
  // gerado — contrato feito com atraso precisa sair datado do início do curso.
  const { dia, mes, ano } = decomposeDatePtBR(termStart)
  return {
    // Placeholders reais confirmados baixando o .txt do doc gerado
    // (2026-07-23) — a leitura via "natural language representation" tinha
    // escondido os sufixos _salao/_profissional. Ver plano da feature.
    '{{razao_social_salao}}': store.legal_name || '',
    '{{cnpj_salao}}': store.cnpj || '',
    '{{endereco_salao}}': store.legal_address || '',
    '{{nome_profissional}}': candidateName,
    '{{cpf_profissional}}': formatCPF((contractData.cpf as string) || null),
    '{{data_nascimento_profissional}}': formatDateBR((contractData.birth_date as string) || null),
    '{{endereco_profissional}}': (contractData.address as string) || '',
    '{{telefone_profissional}}': formatPhoneBR(candidateWhatsapp),
    '{{email_profissional}}': (contractData.email as string) || '',
    '{{local}}': resolveContractLocal(store),
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
    '{{cpf}}': formatCPF(cpf),
    '{{data_inicio_curso}}': formatDateBR(cursoInicio),
    '{{data_fim_curso}}': formatDateBR(cursoFim),
    '{{local}}': resolveContractLocal(store),
    '{{data_desligamento}}': formatDateBR(todayISO()),
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('CONTRACT_AUTOMATION_SECRET')
  const providedSecret = req.headers.get('x-automation-secret')
  // Comparação em tempo constante (checkup 2026-07-23) — `!==` vaza pelo
  // tempo de resposta quantos caracteres do prefixo o atacante acertou.
  if (!expectedSecret || !providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
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
      .select('id, store_id, candidate_id, drive_folder_url, candidates(name, whatsapp, assignee_id), stores(name, slug, uf, legal_name, cnpj, legal_address)')
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
    const store = (processo.stores ?? { name: '', slug: '', uf: null, legal_name: null, cnpj: null, legal_address: null }) as StoreRow

    const accessToken = await getGoogleAccessToken()
    const unitFolderId = await findOrCreateFolder(accessToken, resolveUnitFolderName(store.slug, store.name), rootFolderId)
    const candidateFolderId = await findOrCreateFolder(accessToken, candidateName, unitFolderId)
    // A pasta da pessoa é criada aqui e em lugar nenhum mais — sem gravar o
    // link, a aba Documentos do card fica com um campo vazio que só alguém
    // caçando a pasta no Drive consegue preencher.
    const candidateFolderUrl = await getWebViewLink(accessToken, candidateFolderId)

    let fieldMap: FieldMap
    let termStart: string | null = null
    let termEnd: string | null = null
    let docLabel: string

    if (intent === 'formacao') {
      // Data informada na contratação; `hoje` só como fallback pra processos
      // anteriores à coluna contract_start_date (20260814000001).
      termStart = (contractData?.contract_start_date as string) || todayISO()
      termEnd = addBusinessDaysISO(termStart, FORMACAO_COURSE_BUSINESS_DAYS)
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

    await syncContractDataToCard(serviceClient, {
      processId: process_id,
      candidateId: processo.candidate_id,
      currentDriveFolderUrl: processo.drive_folder_url,
      folderUrl: candidateFolderUrl,
      formacao: intent === 'formacao'
        ? { birthDate: (contractData?.birth_date as string) ?? null, termStart, termEnd }
        : null,
    })

    // ── Notifica o responsável vinculado ao candidato (best-effort) ────
    await notifyContractGenerated(serviceClient, {
      assigneeId: processo.candidates?.assignee_id,
      storeId: processo.store_id,
      candidateName,
      docLabel,
      link: googleDocUrl,
    })

    return json({ success: true, contract_id: contractRow.id, google_doc_url: googleDocUrl })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500)
  }
})
