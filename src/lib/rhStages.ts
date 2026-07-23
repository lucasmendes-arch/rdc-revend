// Etapas do funil de candidatos (RH) — fonte única de verdade do frontend
// pra valor, label, cor e ordem. Espelha o CHECK de `candidates.stage` /
// `automations.trigger_stage` no banco (ver docs/SCHEMA.md): mexer aqui sem
// migration correspondente grava valor que o banco rejeita.
//
// Antes ficava tudo local em `pages/rh/Candidatos.tsx`, o que deixava o
// select de etapa da tela de Automações sem cor e com opções defasadas
// (etapas já removidas do banco). Qualquer tela nova que mostre etapa deve
// importar daqui em vez de redeclarar a lista.

export type Stage =
  | 'pendente' | 'conversa_iniciada' | 'entrevista_marcada' | 'no_show'
  | 'decisao_necessaria' | 'selecionado' | 'em_teste'
  | 'contratado' | 'concluido_arquivado'
  | 'descartado' | 'banco_de_talentos'

// Uma cor própria por etapa (não por grupo) — mas seguindo uma progressão:
// tons frios/neutros no início do funil, amarelo/laranja nos pontos de
// atenção (no-show, decisão necessária), rampa de verde ganhando força
// conforme aproxima do sucesso, cinza-quente no arquivamento neutro, e a
// família vermelho/rosa/violeta nas saídas (cada uma com tom distinto).
export const STAGE_COLORS: Record<Stage, { accent: string; bg: string }> = {
  pendente: { accent: '#64748B', bg: '#F1F5F9' },
  conversa_iniciada: { accent: '#2563EB', bg: '#DBEAFE' },
  entrevista_marcada: { accent: '#0284C7', bg: '#E0F2FE' },
  no_show: { accent: '#D97706', bg: '#FEF3C7' },
  decisao_necessaria: { accent: '#EA580C', bg: '#FFEDD5' },
  selecionado: { accent: '#65A30D', bg: '#ECFCCB' },
  em_teste: { accent: '#DB2777', bg: '#FCE7F3' },
  contratado: { accent: '#0D9488', bg: '#CCFBF1' },
  concluido_arquivado: { accent: '#78716C', bg: '#F5F5F4' },
  descartado: { accent: '#DC2626', bg: '#FEE2E2' },
  banco_de_talentos: { accent: '#7C3AED', bg: '#EDE9FE' },
}

export function getStageColors(stage: Stage) {
  return STAGE_COLORS[stage]
}

// Ordem de exibição das colunas do kanban — pedida explicitamente pelo
// usuário, com as saídas intercaladas no fluxo (não agrupadas à parte).
// Continuam aceitando drop vindo de qualquer coluna, sem transição restrita.
// 'sem_contratacao', 'em_formacao' e 'em_contratacao' removidas do banco por
// completo em 2026-07-22 (pedido do usuário, sem uso real); 'em_teste'
// adicionada em 2026-07-23. 'contratado' é coluna (desde 2026-07-22) — soltar
// um card nela dispara o popup de contratação (ver requestStageChange em
// Candidatos.tsx), igual ao botão "Contratar" no card/modal de detalhe; a
// etapa em si só é gravada de fato pela RPC promote_candidate_to_dp quando o
// popup é confirmado, nunca direto.
export const STAGE_COLUMNS: { stage: Stage; label: string }[] = [
  { stage: 'pendente', label: 'Pendente' },
  { stage: 'conversa_iniciada', label: 'Conversa Iniciada' },
  { stage: 'entrevista_marcada', label: 'Entrevista Marcada' },
  { stage: 'no_show', label: 'No-show' },
  { stage: 'decisao_necessaria', label: 'Decisão Necessária' },
  { stage: 'selecionado', label: 'Selecionado' },
  { stage: 'em_teste', label: 'Em Teste' },
  { stage: 'descartado', label: 'Descartado' },
  { stage: 'banco_de_talentos', label: 'Banco de Talentos' },
  { stage: 'contratado', label: 'Contratado' },
  { stage: 'concluido_arquivado', label: 'Arquivado' },
]

// Opções prontas pro ColorSelect (variant="dot"), na mesma ordem do kanban —
// estrutura compatível com ColorSelectOption sem o lib depender do componente.
export const STAGE_SELECT_OPTIONS: { value: Stage; label: string; color: string }[] =
  STAGE_COLUMNS.map((col) => ({ value: col.stage, label: col.label, color: STAGE_COLORS[col.stage].accent }))

const STAGE_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  STAGE_COLUMNS.map((col) => [col.stage, col.label]),
)

// Label de uma etapa vinda do banco como string solta (histórico de
// atividade, por exemplo) — cai no próprio valor se a etapa não existir mais.
export function stageLabel(value: string | null | undefined): string {
  if (!value) return ''
  return STAGE_LABEL_BY_VALUE[value] || value
}

// Cor de destaque de uma etapa vinda como string solta — `null` quando a
// etapa não existe mais (a UI cai no estilo neutro em vez de quebrar).
export function stageAccent(value: string | null | undefined): string | null {
  if (!value) return null
  return STAGE_COLORS[value as Stage]?.accent ?? null
}
