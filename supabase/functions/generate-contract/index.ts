// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGoogleAccessToken, findOrCreateFolder, copyTemplate, replacePlaceholders, getWebViewLink,
  decomposeDatePtBR, formatDateBR, formatCPF, formatCNPJ, formatPhoneBR, formatPercent, todayISO, meiLegalName,
  addBusinessDaysISO, FORMACAO_COURSE_BUSINESS_DAYS, partnerTermEndISO,
  resolveUnitFolderName, resolveContractLocal, getParentFolderId, listDocsInFolder, type FieldMap,
} from '../_shared/googleDrive.ts'
import { syncContractDataToCard } from '../_shared/contractSync.ts'
import { notifyContractGenerated } from '../_shared/contractNotify.ts'

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

type ContractType = 'formacao' | 'prestacao_servico' | 'distrato'

// Campos exigidos por tipo de contrato — mesma regra de
// src/lib/dpConstants.ts (REQUIRED_CONTRACT_DATA_FIELDS). Duplicado aqui
// porque edge functions (Deno) não compartilham build com o frontend;
// manter os dois em sincronia se a regra mudar.
const REQUIRED_FIELDS_BY_TYPE: Record<ContractType, string[]> = {
  formacao: ['cpf', 'birth_date', 'address'],
  // Conferido contra o template real do Contrato de Profissional Parceiro
  // (2026-08-22): pede CNPJ e qualificação civil do parceiro, e não menciona
  // conta bancária em lugar nenhum — a lista antiga (RG + dados bancários)
  // era um chute de quando não havia template. `legal_name` fica de fora de
  // propósito: vazio, a razão social é derivada do CNPJ + nome (regra fixa
  // de MEI, ver meiLegalName).
  prestacao_servico: ['cpf', 'cnpj', 'address', 'email', 'nationality', 'marital_status'],
  // Distrato (2026-08-25): o template qualifica o parceiro só como pessoa
  // jurídica (razão social + CNPJ + endereço) e cita o CPF de quem representa
  // o MEI — não repete nacionalidade/estado civil nem pede e-mail.
  // `legal_name` fica de fora pelo mesmo motivo da parceria (deriva do CNPJ).
  distrato: ['cpf', 'cnpj', 'address'],
}

// Dados da unidade exigidos por tipo de contrato, com o rótulo que o usuário
// vê no modal "Dados das lojas" — erro que diz "faltam dados da loja" sem
// dizer quais manda a pessoa caçar campo a campo. O distrato pede menos que a
// parceria: não menciona RG nem endereço do representante, nem o contato da
// unidade (o contrato de parceria é que faz a qualificação completa).
const STORE_FIELD_LABELS: Record<string, string> = {
  legal_name: 'Razão social',
  cnpj: 'CNPJ',
  legal_address: 'Endereço',
  representative_name: 'Representante legal',
  representative_cpf: 'CPF do representante',
  representative_rg: 'RG do representante',
  representative_address: 'Endereço do representante',
  email: 'E-mail da unidade',
  phone: 'Telefone da unidade',
  uf: 'UF (estado) da unidade',
}

const REQUIRED_STORE_FIELDS_BY_TYPE: Record<ContractType, string[]> = {
  // Formação nunca validou dados da unidade (o template usa só razão social,
  // CNPJ e endereço, e o contrato é gerado por automação) — mantido assim.
  formacao: [],
  prestacao_servico: [
    'legal_name', 'cnpj', 'legal_address', 'representative_name', 'representative_cpf',
    'representative_rg', 'representative_address', 'email', 'phone', 'uf',
  ],
  distrato: ['legal_name', 'cnpj', 'legal_address', 'representative_name', 'representative_cpf', 'uf'],
}

interface StoreRow {
  name: string
  slug: string
  uf: string | null
  legal_name: string | null
  cnpj: string | null
  legal_address: string | null
  representative_name: string | null
  representative_cpf: string | null
  representative_rg: string | null
  representative_address: string | null
  email: string | null
  phone: string | null
}

const EMPTY_STORE: StoreRow = {
  name: '', slug: '', uf: null, legal_name: null, cnpj: null, legal_address: null,
  representative_name: null, representative_cpf: null, representative_rg: null,
  representative_address: null, email: null, phone: null,
}

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
    // Anexo I — preenchido fisicamente depois (frequência do curso).
    '{{carga_horaria_cumprida}}': '',
    '{{data_declaracao}}': '',
    '{{dia_declaracao}}': '',
    '{{mes_declaracao}}': '',
    '{{ano_declaracao}}': '',
  }
}

// Contrato de Parceria (Lei 13.352/2016) — 24 placeholders, confirmados
// lendo o template real no Drive em 2026-08-22. Diferente do de formação,
// este qualifica as DUAS partes: a unidade entra com razão social, CNPJ,
// endereço e o representante que assina; o parceiro entra como pessoa
// jurídica (MEI) além de pessoa física.
function buildParceriaFieldMap(input: {
  store: StoreRow
  candidateName: string
  candidateWhatsapp: string
  contractData: Record<string, unknown>
  roleTitle: string
  retentionPercentage: number | string | null
  productCommissionPercentage: number | string | null
  termStart: string
}): FieldMap {
  const {
    store, candidateName, candidateWhatsapp, contractData, roleTitle,
    retentionPercentage, productCommissionPercentage, termStart,
  } = input
  return {
    // ── Salão ────────────────────────────────────────────────────────
    '{{razao_social_salao}}': store.legal_name || '',
    '{{cnpj_salao}}': formatCNPJ(store.cnpj),
    '{{endereco_salao}}': store.legal_address || '',
    '{{representante_salao}}': store.representative_name || '',
    '{{cpf_representante_salao}}': formatCPF(store.representative_cpf),
    '{{rg_representante_salao}}': store.representative_rg || '',
    '{{endereco_representante_salao}}': store.representative_address || '',
    '{{email_salao}}': store.email || '',
    '{{telefone_salao}}': formatPhoneBR(store.phone),
    // ── Profissional ─────────────────────────────────────────────────
    // Vazia, deriva da regra da Receita (raiz do CNPJ + nome em caixa
    // alta) em vez de exigir digitação.
    '{{razao_social_profissional}}': (contractData.legal_name as string)
      || meiLegalName((contractData.cnpj as string) || null, candidateName),
    '{{cnpj_profissional}}': formatCNPJ((contractData.cnpj as string) || null),
    '{{endereco_profissional}}': (contractData.address as string) || '',
    '{{nome_profissional}}': candidateName,
    '{{nacionalidade_profissional}}': (contractData.nationality as string) || '',
    '{{estado_civil_profissional}}': (contractData.marital_status as string) || '',
    '{{cpf_profissional}}': formatCPF((contractData.cpf as string) || null),
    '{{email_profissional}}': (contractData.email as string) || '',
    '{{telefone_profissional}}': formatPhoneBR(candidateWhatsapp),
    // ── Comercial ────────────────────────────────────────────────────
    '{{atividade_profissional}}': roleTitle,
    '{{percentual_retencao_salao}}': formatPercent(retentionPercentage),
    '{{percentual_comissao_produtos}}': formatPercent(productCommissionPercentage),
    // ── Fecho ────────────────────────────────────────────────────────
    // Data única (dd/mm/aaaa), não decomposta em dia/mês/ano como no
    // contrato de formação — o template escreve "Data: {{data_assinatura}}".
    '{{local}}': resolveContractLocal(store),
    '{{data_assinatura}}': formatDateBR(termStart),
  }
}

// Distrato do Contrato de Parceria — 13 placeholders, confirmados lendo o
// template real no Drive em 2026-08-25. É um subconjunto do contrato de
// parceria (mesmas duas partes, sem percentuais e sem qualificação civil),
// mais uma data que não existe em nenhum outro documento: a do contrato que
// está sendo desfeito ({{data_contrato}}).
function buildDistratoFieldMap(input: {
  store: StoreRow
  candidateName: string
  contractData: Record<string, unknown>
  originalContractDate: string | null
  termStart: string
}): FieldMap {
  const { store, candidateName, contractData, originalContractDate, termStart } = input
  return {
    // ── Salão ────────────────────────────────────────────────────────
    '{{razao_social_salao}}': store.legal_name || '',
    '{{cnpj_salao}}': formatCNPJ(store.cnpj),
    '{{endereco_salao}}': store.legal_address || '',
    '{{representante_salao}}': store.representative_name || '',
    '{{cpf_representante_salao}}': formatCPF(store.representative_cpf),
    // ── Profissional ─────────────────────────────────────────────────
    '{{razao_social_profissional}}': (contractData.legal_name as string)
      || meiLegalName((contractData.cnpj as string) || null, candidateName),
    '{{cnpj_profissional}}': formatCNPJ((contractData.cnpj as string) || null),
    '{{endereco_profissional}}': (contractData.address as string) || '',
    '{{nome_profissional}}': candidateName,
    '{{cpf_profissional}}': formatCPF((contractData.cpf as string) || null),
    // ── Fecho ────────────────────────────────────────────────────────
    // Data do contrato de parceria que está sendo distratado (cláusula 1.1).
    '{{data_contrato}}': formatDateBR(originalContractDate),
    '{{local}}': resolveContractLocal(store),
    '{{data_assinatura}}': formatDateBR(termStart),
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

    const {
      process_id, term_start, term_end, template_doc_id,
      contract_type: requestedType, original_contract_date,
    } = await req.json()
    if (!process_id) return json({ error: 'process_id é obrigatório' }, 400, req)
    // O tipo continua sendo resolvido no servidor; a única escolha aceita da
    // tela é 'distrato', porque encerrar o vínculo é um evento explícito e o
    // documento precisa sair ANTES da mudança de etapa (processo encerrado
    // some de /admin/dp/contratos, que é o caminho de retry).
    if (requestedType && requestedType !== 'distrato') {
      return json({ error: 'Tipo de contrato inválido — o tipo é resolvido pelo sistema' }, 400, req)
    }

    const serviceClient = createClient(supabaseUrl, supabaseService)

    const { data: processo, error: processoErr } = await serviceClient
      .from('employee_processes')
      .select('id, employment_type, current_stage, role_title, candidate_id, store_id, activated_at, drive_folder_url, candidates(name, whatsapp, job_opening_id, assignee_id), stores(name, slug, uf, legal_name, cnpj, legal_address, representative_name, representative_cpf, representative_rg, representative_address, email, phone)')
      .eq('id', process_id)
      .single()
    if (processoErr || !processo) return json({ error: 'Processo não encontrado' }, 404, req)

    // ── Resolve contract_type a partir do estágio/tipo de vínculo ──────
    let contractType: ContractType | null = null
    if (processo.employment_type === 'mei') {
      if (requestedType === 'distrato' || processo.current_stage === 'encerrado') {
        contractType = 'distrato'
      } else {
        contractType = ['contrato_formacao', 'formacao', 'decisao_formacao'].includes(processo.current_stage)
          ? 'formacao'
          : 'prestacao_servico'
      }
    }
    if (!contractType) {
      return json({ error: 'Este tipo de vínculo (CLT) ainda não tem template de contrato configurado' }, 400, req)
    }
    // Só se distrata quem chegou a ser parceiro. Encerramento durante a
    // formação tem documento próprio (Comunicação de Desligamento do Curso,
    // gerada pela automação) — e o card nesse caso nunca foi efetivado.
    if (contractType === 'distrato' && !processo.activated_at) {
      return json({
        error: 'Este processo nunca foi efetivado — desligamento durante a formação usa a Comunicação de Desligamento do Curso, não o distrato de parceria.',
      }, 400, req)
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
    const store = (processo.stores ?? EMPTY_STORE) as StoreRow

    // ── Contrato de parceria: dados que não vivem no processo ──────────
    // Percentuais saem da VAGA do candidato (snapshot da negociação
    // daquela unidade) e só caem no cargo quando a vaga é anterior a estas
    // colunas ou foi criada solta, sem cargo do catálogo.
    let retentionPercentage: number | string | null = null
    let productCommissionPercentage: number | string | null = null

    const missingStoreFields = REQUIRED_STORE_FIELDS_BY_TYPE[contractType]
      .filter((column) => !store[column as keyof StoreRow])
      .map((column) => STORE_FIELD_LABELS[column])
    if (missingStoreFields.length > 0) {
      const docNome = contractType === 'distrato' ? 'o distrato' : 'o contrato de parceria'
      return json({
        error: `Faltam dados da unidade ${store.name} pra gerar ${docNome} (${missingStoreFields.join(', ')}). Preencha em "Dados das lojas".`,
      }, 400, req)
    }

    if (contractType === 'prestacao_servico') {
      const jobOpeningId = processo.candidates?.job_opening_id
      if (jobOpeningId) {
        const { data: jobOpening } = await serviceClient
          .from('job_openings')
          .select('partner_retention_percentage, product_commission_percentage, job_roles(partner_retention_percentage, product_commission_percentage)')
          .eq('id', jobOpeningId)
          .maybeSingle()
        const role = jobOpening?.job_roles as
          { partner_retention_percentage: number | null; product_commission_percentage: number | null } | null
        retentionPercentage = jobOpening?.partner_retention_percentage ?? role?.partner_retention_percentage ?? null
        productCommissionPercentage = jobOpening?.product_commission_percentage ?? role?.product_commission_percentage ?? null
      }

      const missingPercentages = [
        retentionPercentage === null ? 'retenção do salão' : null,
        productCommissionPercentage === null ? 'comissão sobre produtos' : null,
      ].filter(Boolean)
      if (missingPercentages.length > 0) {
        return json({
          error: `Faltam percentuais do contrato de parceria (${missingPercentages.join(', ')}). Preencha na vaga do candidato ou no cargo em /admin/rh/cargos.`,
        }, 400, req)
      }
    }

    // ── Distrato: data do contrato que está sendo desfeito ─────────────
    // Precedência: o que veio da tela > a assinatura do contrato de parceria
    // gerado aqui > a data de efetivação (parceiro cadastrado de forma
    // retroativa nunca teve contrato gerado pelo sistema).
    let originalContractDate: string | null = null
    if (contractType === 'distrato') {
      if (original_contract_date) {
        originalContractDate = original_contract_date
      } else {
        const { data: parceria } = await serviceClient
          .from('employee_contracts')
          .select('term_start')
          .eq('process_id', process_id)
          .eq('contract_type', 'prestacao_servico')
          .maybeSingle()
        originalContractDate = parceria?.term_start
          || (processo.activated_at as string).slice(0, 10)
      }
    }

    const accessToken = await getGoogleAccessToken()
    const unitFolderId = await findOrCreateFolder(accessToken, resolveUnitFolderName(store.slug, store.name), rootFolderId)
    const candidateFolderId = await findOrCreateFolder(accessToken, candidateName, unitFolderId)
    const candidateFolderUrl = await getWebViewLink(accessToken, candidateFolderId)

    // ── Modelo base ────────────────────────────────────────────────────
    // O padrão vem de contract_templates; a tela pode escolher outro doc da
    // MESMA pasta (é assim que novos modelos aparecem, sem cadastro). A
    // pasta é revalidada aqui: sem isso, quem chamasse a function poderia
    // pedir a cópia de qualquer documento do Drive da conta.
    const templateDocId: string = template_doc_id || template.google_doc_id
    // A lista é consultada mesmo quando o modelo é o padrão: é dela que sai o
    // nome gravado junto do contrato (rastro legível de sob qual modelo a
    // pessoa assinou, já que o arquivo pode ser renomeado depois).
    const templatesFolderId = await getParentFolderId(accessToken, template.google_doc_id)
    const available = templatesFolderId ? await listDocsInFolder(accessToken, templatesFolderId) : []
    const chosen = available.find((d) => d.id === templateDocId)
    if (!chosen && templateDocId !== template.google_doc_id) {
      return json({ error: 'Modelo de contrato inválido — escolha um dos modelos da pasta de templates' }, 400, req)
    }
    const templateName: string | null = chosen?.name ?? null

    const DOC_LABELS: Record<ContractType, string> = {
      formacao: 'Contrato de Formação',
      prestacao_servico: 'Contrato Profissional Parceiro',
      distrato: 'Distrato de Contrato de Parceria',
    }
    const docLabel = DOC_LABELS[contractType]
    const docName = `${candidateName} - ${docLabel}`
    const newDocId = await copyTemplate(accessToken, templateDocId, docName, candidateFolderId)

    // Precedência: o que o usuário escolheu na tela > a data informada na
    // contratação (contract_start_date, só formação) > hoje.
    const termStart = term_start
      || (contractType === 'formacao' ? (contractData.contract_start_date as string) : null)
      || todayISO()
    // Formação dura 10 dias úteis; parceria dura 12 meses (cláusula 4.1 do
    // template). Data de fim informada à mão continua tendo prioridade.
    // Distrato não tem vigência — encerra, não começa nada: term_end fica NULL.
    const termEnd = contractType === 'distrato'
      ? (term_end || null)
      : term_end || (contractType === 'formacao'
        ? addBusinessDaysISO(termStart, FORMACAO_COURSE_BUSINESS_DAYS)
        : partnerTermEndISO(termStart))

    let fieldMap: FieldMap
    if (contractType === 'formacao') {
      fieldMap = buildFormacaoFieldMap({
        store, candidateName, candidateWhatsapp: processo.candidates?.whatsapp ?? '', contractData, termStart, termEnd: termEnd as string,
      })
    } else if (contractType === 'distrato') {
      fieldMap = buildDistratoFieldMap({ store, candidateName, contractData, originalContractDate, termStart })
    } else {
      fieldMap = buildParceriaFieldMap({
        store, candidateName, candidateWhatsapp: processo.candidates?.whatsapp ?? '', contractData,
        roleTitle: processo.role_title ?? '', retentionPercentage, productCommissionPercentage, termStart,
      })
    }
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
        template_doc_id: templateDocId,
        template_name: templateName,
      })
      .select('id')
      .single()
    if (insertErr) {
      console.error('Insert employee_contracts error:', insertErr.message)
      return json({ error: 'Erro ao registrar o contrato gerado' }, 500, req)
    }

    // Mesma sincronia da geração automática: pasta do Drive, idade e vigência
    // voltam pro card em vez de ficarem só no documento.
    await syncContractDataToCard(serviceClient, {
      processId: process_id,
      candidateId: processo.candidate_id,
      currentDriveFolderUrl: processo.drive_folder_url,
      folderUrl: candidateFolderUrl,
      formacao: contractType === 'formacao'
        ? { birthDate: (contractData.birth_date as string) ?? null, termStart, termEnd }
        : null,
    })

    // Mesmo aviso da geração automática (WhatsApp do responsável pelo
    // candidato, com o link do documento) — a confirmação não pode depender
    // de qual dos dois caminhos gerou o contrato. Best-effort: o contrato já
    // está gravado, falha aqui só vira log.
    await notifyContractGenerated(serviceClient, {
      assigneeId: processo.candidates?.assignee_id,
      storeId: processo.store_id,
      candidateName,
      docLabel,
      link: googleDocUrl,
    })

    return json({ success: true, contract_id: contractRow.id, google_doc_url: googleDocUrl }, 200, req)
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500, req)
  }
})
