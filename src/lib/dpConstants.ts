// Constantes do módulo Departamento Pessoal (DP) — fluxo de admissão por
// employment_type e checklist fixa de documentos. Não configurável pelo
// usuário nesta etapa (pode virar construtor, nos moldes de form_fields,
// numa etapa futura). Identificadores técnicos em inglês (tabelas/colunas,
// mesma convenção de candidates/job_openings); valores de negócio
// (current_stage, document_type etc.) continuam em português, mesmo padrão
// de candidates.stage. Espelha o CHECK do banco
// (20260718000013_dp_english_names_and_contratacao_checklist.sql).

// Só 'clt' ou 'mei' — não existe diferença de tipo de contratação entre
// "MEI com/sem experiência". Experiência é característica do CARGO
// (job_roles.requires_experience), não uma escolha manual aqui: o backend
// (promote_candidate_to_dp) decide sozinho se o processo nasce em
// 'formacao' (cargo sem experiência exigida) ou direto em 'contratacao', a
// partir do cargo da vaga do candidato. Etapa 'contrato_formacao' removida
// (20260724000003) — 'formacao' passou a ser a etapa inicial da trilha.
export type EmploymentType = 'clt' | 'mei'

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  clt: 'CLT',
  mei: 'MEI',
}

export const EMPLOYMENT_TYPE_OPTIONS: EmploymentType[] = ['clt', 'mei']

export interface StageColumn {
  stage: string
  label: string
  accent: string
  bg: string
}

// "contratacao" concentra o checklist de documentos + exame admissional
// (já coberto por aso_admissional em employee_documents) + assinatura de
// contrato (aba própria, employee_contracts) + onboarding/treinamento
// (flags booleanas em employee_processes) — não são etapas de kanban
// separadas, só um checklist dentro dessa etapa única.
export const STAGE_COLUMNS_BY_EMPLOYMENT_TYPE: Record<EmploymentType, StageColumn[]> = {
  clt: [
    { stage: 'contratacao', label: 'Contratação', accent: '#2563EB', bg: '#DBEAFE' },
    { stage: 'experiencia', label: 'Experiência', accent: '#65A30D', bg: '#ECFCCB' },
    { stage: 'decisao', label: 'Decisão', accent: '#EA580C', bg: '#FFEDD5' },
    { stage: 'efetivado', label: 'Efetivado', accent: '#16A34A', bg: '#DCFCE7' },
    { stage: 'encerrado', label: 'Encerrado', accent: '#DC2626', bg: '#FEE2E2' },
  ],
  // União dos dois fluxos possíveis — processos de cargo sem experiência
  // exigida passam por formacao/decisao_formacao antes de 'contratacao';
  // processos de cargo com experiência exigida nascem direto em
  // 'contratacao'. Etapa 'acompanhamento_90d' removida (20260724000006) —
  // 'contratacao' leva direto pra efetivado/encerrado.
  mei: [
    { stage: 'formacao', label: 'Curso de Formação', accent: '#7C3AED', bg: '#EDE9FE' },
    { stage: 'decisao_formacao', label: 'Decisão (Formação)', accent: '#EA580C', bg: '#FFEDD5' },
    { stage: 'contratacao', label: 'Contratação', accent: '#2563EB', bg: '#DBEAFE' },
    { stage: 'efetivado', label: 'Efetivado', accent: '#16A34A', bg: '#DCFCE7' },
    { stage: 'encerrado', label: 'Encerrado', accent: '#DC2626', bg: '#FEE2E2' },
  ],
}

export function getStageColumn(employmentType: EmploymentType, stage: string): StageColumn | undefined {
  return STAGE_COLUMNS_BY_EMPLOYMENT_TYPE[employmentType].find((c) => c.stage === stage)
}

const DAY_MS = 24 * 60 * 60 * 1000

type ExperienceProcess = {
  employment_type: EmploymentType
  activated_at: string | null
  experience_renewed_at?: string | null
}

export interface ExperienceInfo {
  label: string
  endDate: Date
}

// Tag + prazo do período de experiência exibidos ao lado do nome em
// Colaboradores.tsx e no header do ProcessoDetailModal — activated_at é
// sempre meia-noite UTC (RPC/promoção só recebem a data, sem hora), então
// somar dias inteiros preserva isso.
// - MEI: janela única e informal de 90d (não existe mais etapa de kanban
//   pra isso, ver 20260724000006), sem renovação — dispara sozinha.
// - CLT: contrato de experiência real de 45d, renovável uma vez por mais
//   45d via botão no card (experience_renewed_at) — janela final de 90d
//   contados da efetivação, não 45d contados da renovação (mesmo teto do
//   MEI, só que em 2 tags separadas: "1/2" antes de renovar, "2/2" depois).
export function getExperienceInfo(p: ExperienceProcess): ExperienceInfo | null {
  if (!p.activated_at) return null
  const activatedMs = new Date(p.activated_at).getTime()
  if (p.employment_type === 'mei') {
    return { label: 'Exp. 90d', endDate: new Date(activatedMs + 90 * DAY_MS) }
  }
  if (p.employment_type === 'clt') {
    if (p.experience_renewed_at) {
      return { label: 'Exp. 45d 2/2', endDate: new Date(activatedMs + 90 * DAY_MS) }
    }
    return { label: 'Exp. 45d 1/2', endDate: new Date(activatedMs + 45 * DAY_MS) }
  }
  return null
}

// Só controla se a tag ainda deve aparecer (janela corrente) — a data em si
// continua exibida na coluna "Fim Experiência" mesmo depois de vencida, não
// é regra de negócio crítica, só um aviso visual.
export function isExperienceTagActive(p: ExperienceProcess): boolean {
  const info = getExperienceInfo(p)
  return !!info && Date.now() < info.endDate.getTime()
}

// União ordenada das colunas de CLT + MEI, pra visão combinada "Todos" —
// segue o funil geral (formação exclusiva do MEI primeiro, contratação
// compartilhada, experiência/decisão exclusivas do CLT, efetivado/encerrado
// compartilhados). Um processo só pode ser arrastado entre colunas do seu
// próprio employment_type (validado em Contratacao.tsx) — as colunas
// exclusivas do outro tipo ficam visíveis mas não são destino válido.
export const ALL_STAGE_COLUMNS: StageColumn[] = [
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.mei[0], // formacao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.mei[1], // decisao_formacao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[0], // contratacao (compartilhada)
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[1], // experiencia
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[2], // decisao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[3], // efetivado (compartilhada)
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[4], // encerrado (compartilhada)
]

// Checklist fixa de documentos — só o que é de fato um arquivo escaneado.
// `foto_3x4` removida (20260724000003) — o candidato já tem foto de perfil
// (candidates.photo_url) trazida do funil de RH, redundante pedir de novo.
// `rg_cpf`/`comprovante_residencia`/`dados_bancarios`/`cnpj_ccmei` removidos
// (20260724000004) — viraram campos de texto (rg/cpf/address/pix_key/cnpj em
// employee_contract_data), não fazem mais parte deste checklist de arquivo.
export type DocumentSlug =
  | 'ctps' | 'pis_pasep' | 'titulo_eleitor' | 'comprovante_escolaridade' | 'aso_admissional'

export const DOCUMENT_CHECKLIST_LABELS: Record<DocumentSlug, string> = {
  ctps: 'Carteira de Trabalho (CTPS)',
  pis_pasep: 'PIS/PASEP',
  titulo_eleitor: 'Título de eleitor',
  comprovante_escolaridade: 'Comprovante de escolaridade',
  aso_admissional: 'Exame admissional (ASO)',
}

export type DocumentStatus = 'pendente' | 'enviado' | 'aprovado'

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
}

export type ContractType = 'formacao' | 'prestacao_servico' | 'clt' | 'desligamento_formacao'

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  formacao: 'Contrato de formação',
  prestacao_servico: 'Contrato de Profissional Parceiro',
  clt: 'CLT',
  desligamento_formacao: 'Desligamento do curso',
}

// Mesma regra usada pela edge function generate-contract (não há template de
// CLT ainda — geração automática fica restrita a MEI). Mantida aqui só pra
// dar um preview ao usuário antes de gerar; a fonte de verdade real do
// contract_type gravado é sempre a resolução feita no servidor.
// 'desligamento_formacao' não entra aqui — não é uma etapa "de repouso"
// (como formação/prestação), é disparado automaticamente pelo evento de
// desligamento durante a formação (trigger em employee_processes, ver
// migration 20260722000005), não por um current_stage estável.
export function resolveAutoContractType(employmentType: EmploymentType, currentStage: string): ContractType | null {
  if (employmentType !== 'mei') return null
  return ['formacao', 'decisao_formacao'].includes(currentStage)
    ? 'formacao'
    : 'prestacao_servico'
}

// Duração do curso de formação, em dias ÚTEIS (sábado e domingo não contam),
// com o próprio dia de início valendo como primeiro dia útil: começando na
// segunda 10/08, o décimo dia útil é a sexta 21/08.
//
// Cópia da regra que vive em supabase/functions/_shared/googleDrive.ts, que é
// quem de fato grava term_end no contrato — Deno não compartilha build com o
// Vite. Aqui serve só pra prever a data na tela de contratação; mudou uma,
// mude a outra. Feriados não entram na conta (ver comentário na edge function).
export const FORMACAO_COURSE_BUSINESS_DAYS = 10

export function addBusinessDaysISO(iso: string, businessDays: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  let counted = 0
  for (;;) {
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) counted++
    if (counted >= businessDays) break
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return date.toISOString().slice(0, 10)
}

// Vigência do contrato de parceria: 12 meses contados da assinatura, menos
// um dia (assinado 22/08/2026 → vale até 21/08/2027). Espelha
// PARCERIA_TERM_MONTHS/partnerTermEndISO em _shared/googleDrive.ts, que é
// quem de fato grava term_end — aqui serve pra prever a data na tela.
export const PARCERIA_TERM_MONTHS = 12

export function partnerTermEndISO(termStart: string): string {
  const [y, m, d] = termStart.split('-').map(Number)
  const targetMonthIndex = m - 1 + PARCERIA_TERM_MONTHS
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  // Fim de mês: 31/01 + 12 meses cai em 31/01, mas 29/02 num ano não
  // bissexto precisa recuar pro último dia real do mês.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const date = new Date(Date.UTC(targetYear, targetMonth, Math.min(d, lastDay)))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export type ContractDataField =
  | 'cpf' | 'rg' | 'cnpj' | 'legal_name' | 'birth_date' | 'marital_status' | 'nationality' | 'address' | 'email'
  | 'bank_name' | 'bank_agency' | 'bank_account' | 'pix_key'

// Nacionalidade e estado civil entram no contrato como adjetivo dentro da
// frase ("Fulana, brasileira, solteira, inscrita no CPF...") — o valor
// guardado JÁ é a forma flexionada que sai no documento.
//
// Nacionalidade: só o caso comum na lista, o resto é digitado (decisão do
// usuário) — uma lista de nacionalidades seria longa e quase nunca usada.
export const NATIONALITY_DEFAULT = 'brasileiro(a)'

// Quatro opções, na forma "(a)" — mesmo padrão da nacionalidade. Chegou a
// ter os pares flexionados (solteira/solteiro/casada/...), mas 11 itens num
// dropdown pra escolher entre quatro estados civis é atrito à toa.
export const MARITAL_STATUS_OPTIONS = [
  'solteiro(a)',
  'casado(a)',
  'divorciado(a)',
  'viúvo(a)',
] as const

// value = o texto que vai pro documento; label = o mesmo com inicial
// maiúscula, só pra leitura na tela.
export function toSelectOptions(values: readonly string[]) {
  return values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))
}

// Razão social de MEI segue uma regra fixa da Receita: raiz do CNPJ (os 8
// primeiros dígitos, pontuados) + nome civil em maiúsculas — ex.
// "68.727.533 JAMILY TAVARES DA SILVA". Por isso o campo não precisa ser
// digitado: dá pra derivar do CNPJ que já está cadastrado. Só cai no nome
// puro quando o CNPJ ainda não foi informado.
//
// Cópia da regra que vive em supabase/functions/_shared/googleDrive.ts, que
// é quem de fato preenche o contrato — Deno não compartilha build com o
// Vite. Aqui serve pra sugerir o valor na tela; mudou uma, mude a outra.
export function meiLegalName(cnpj: string | null | undefined, name: string): string {
  const digits = (cnpj || '').replace(/\D/g, '')
  const upperName = name.trim().toUpperCase()
  if (digits.length < 8) return upperName
  const root = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}`
  return `${root} ${upperName}`
}

export const CONTRACT_DATA_FIELD_LABELS: Record<ContractDataField, string> = {
  cpf: 'CPF', rg: 'RG', cnpj: 'CNPJ', legal_name: 'Razão social (MEI)',
  birth_date: 'Data de nascimento', marital_status: 'Estado civil',
  nationality: 'Nacionalidade', address: 'Endereço completo', email: 'E-mail',
  bank_name: 'Banco', bank_agency: 'Agência', bank_account: 'Conta', pix_key: 'Chave PIX',
}

// 'formacao' confirmado com os templates reais (Contrato de Formação +
// Desligamento, 2026-07-22) — não precisa de RG/estado civil/nacionalidade/
// dados bancários (curso gratuito, sem vínculo, sem pagamento). E-mail
// existe como campo (o template tem {{email}}) mas o usuário confirmou que
// não é obrigatório pra gerar — fica em branco no doc se não preenchido.
// 'prestacao_servico' conferido com o template real do Contrato de
// Profissional Parceiro (2026-08-22): qualifica o parceiro como pessoa
// jurídica (CNPJ) e como pessoa física (nacionalidade/estado civil), e não
// menciona conta bancária em lugar nenhum — a lista antiga, com RG e dados
// bancários, era chute de quando não havia template. Razão social fica fora
// dos obrigatórios: vazia, a geração usa o nome do candidato.
// 'desligamento_formacao' não pede nada além do
// que 'formacao' já exige (reaproveita CPF/nome já preenchidos).
export const REQUIRED_CONTRACT_DATA_FIELDS: Record<ContractType, ContractDataField[]> = {
  formacao: ['cpf', 'birth_date', 'address'],
  prestacao_servico: ['cpf', 'cnpj', 'address', 'email', 'nationality', 'marital_status'],
  clt: [],
  desligamento_formacao: [],
}
