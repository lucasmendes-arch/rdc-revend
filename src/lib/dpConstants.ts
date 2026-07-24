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
  prestacao_servico: 'Prestação de serviço',
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

export type ContractDataField =
  | 'cpf' | 'rg' | 'cnpj' | 'birth_date' | 'marital_status' | 'nationality' | 'address' | 'email'
  | 'bank_name' | 'bank_agency' | 'bank_account' | 'pix_key'

export const CONTRACT_DATA_FIELD_LABELS: Record<ContractDataField, string> = {
  cpf: 'CPF', rg: 'RG', cnpj: 'CNPJ', birth_date: 'Data de nascimento', marital_status: 'Estado civil',
  nationality: 'Nacionalidade', address: 'Endereço completo', email: 'E-mail',
  bank_name: 'Banco', bank_agency: 'Agência', bank_account: 'Conta', pix_key: 'Chave PIX',
}

// 'formacao' confirmado com os templates reais (Contrato de Formação +
// Desligamento, 2026-07-22) — não precisa de RG/estado civil/nacionalidade/
// dados bancários (curso gratuito, sem vínculo, sem pagamento). E-mail
// existe como campo (o template tem {{email}}) mas o usuário confirmou que
// não é obrigatório pra gerar — fica em branco no doc se não preenchido.
// 'prestacao_servico' continua um chute (sem template real ainda — "por
// partes", próxima rodada). 'desligamento_formacao' não pede nada além do
// que 'formacao' já exige (reaproveita CPF/nome já preenchidos).
export const REQUIRED_CONTRACT_DATA_FIELDS: Record<ContractType, ContractDataField[]> = {
  formacao: ['cpf', 'birth_date', 'address'],
  prestacao_servico: [
    'cpf', 'rg', 'birth_date', 'marital_status', 'nationality', 'address',
    'bank_name', 'bank_agency', 'bank_account', 'pix_key',
  ],
  clt: [],
  desligamento_formacao: [],
}
