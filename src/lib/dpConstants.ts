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
// 'contrato_formacao' (cargo sem experiência exigida) ou direto em
// 'contratacao', a partir do cargo da vaga do candidato.
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
  // exigida passam por contrato_formacao/formacao/decisao_formacao antes de
  // 'contratacao'; processos de cargo com experiência exigida nascem direto
  // em 'contratacao'. Os dois tipos passam por acompanhamento_90d.
  mei: [
    { stage: 'contrato_formacao', label: 'Contrato de Formação', accent: '#64748B', bg: '#F1F5F9' },
    { stage: 'formacao', label: 'Formação', accent: '#7C3AED', bg: '#EDE9FE' },
    { stage: 'decisao_formacao', label: 'Decisão (Formação)', accent: '#EA580C', bg: '#FFEDD5' },
    { stage: 'contratacao', label: 'Contratação', accent: '#2563EB', bg: '#DBEAFE' },
    { stage: 'acompanhamento_90d', label: 'Acompanhamento 90d', accent: '#65A30D', bg: '#ECFCCB' },
    { stage: 'efetivado', label: 'Efetivado', accent: '#16A34A', bg: '#DCFCE7' },
    { stage: 'encerrado', label: 'Encerrado', accent: '#DC2626', bg: '#FEE2E2' },
  ],
}

export function getStageColumn(employmentType: EmploymentType, stage: string): StageColumn | undefined {
  return STAGE_COLUMNS_BY_EMPLOYMENT_TYPE[employmentType].find((c) => c.stage === stage)
}

// União ordenada das colunas de CLT + MEI, pra visão combinada "Todos" —
// segue o funil geral (formação exclusiva do MEI primeiro, contratação
// compartilhada, experiência/decisão exclusivas do CLT, acompanhamento
// exclusivo do MEI, efetivado/encerrado compartilhados). Um processo só
// pode ser arrastado entre colunas do seu próprio employment_type
// (validado em Contratacao.tsx) — as colunas exclusivas do outro tipo
// ficam visíveis mas não são destino válido.
export const ALL_STAGE_COLUMNS: StageColumn[] = [
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.mei[0], // contrato_formacao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.mei[1], // formacao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.mei[2], // decisao_formacao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[0], // contratacao (compartilhada)
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[1], // experiencia
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[2], // decisao
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.mei[4], // acompanhamento_90d
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[3], // efetivado (compartilhada)
  STAGE_COLUMNS_BY_EMPLOYMENT_TYPE.clt[4], // encerrado (compartilhada)
]

// Checklist fixa de documentos — mesmos slugs em src/lib/dpConstants.ts e no
// CHECK/RPC do banco. MEI sem/com experiência usam a mesma lista.
export type DocumentSlug =
  | 'rg_cpf' | 'comprovante_residencia' | 'ctps' | 'pis_pasep' | 'titulo_eleitor'
  | 'comprovante_escolaridade' | 'foto_3x4' | 'aso_admissional' | 'dados_bancarios' | 'cnpj_ccmei'

export const DOCUMENT_CHECKLIST_LABELS: Record<DocumentSlug, string> = {
  rg_cpf: 'RG e CPF',
  comprovante_residencia: 'Comprovante de residência',
  ctps: 'Carteira de Trabalho (CTPS)',
  pis_pasep: 'PIS/PASEP',
  titulo_eleitor: 'Título de eleitor',
  comprovante_escolaridade: 'Comprovante de escolaridade',
  foto_3x4: 'Foto 3x4',
  aso_admissional: 'Exame admissional (ASO)',
  dados_bancarios: 'Dados bancários',
  cnpj_ccmei: 'Cartão CNPJ (CCMEI)',
}

export type DocumentStatus = 'pendente' | 'enviado' | 'aprovado'

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
}

export type ContractType = 'formacao' | 'prestacao_servico' | 'clt'

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  formacao: 'Contrato de formação',
  prestacao_servico: 'Prestação de serviço',
  clt: 'CLT',
}
