// Vocabulário concreto das duas entidades que o painel de automações atende.
// Os valores precisam bater com os CHECKs do banco (20260719000001 pro RH,
// 20260814000002/4 pro DP) — mudou lá, muda aqui.

import { STAGE_SELECT_OPTIONS, stageAccent, stageLabel } from '@/lib/rhStages'
import { ALL_STAGE_COLUMNS } from '@/lib/dpConstants'
import type { AutomationEntityConfig } from './types'

// ============================================================
// Candidato (RH) — o motor original
// ============================================================

export const CANDIDATE_AUTOMATION_CONFIG: AutomationEntityConfig = {
  entity: 'candidate',
  queryPrefix: 'rh',
  triggerTypeLabels: {
    candidate_created: 'Candidato criado',
    stage_changed: 'Candidato entra na etapa',
    due_date_reached: 'Prazo (due date) chega',
  },
  actionTypeLabels: {
    change_stage: 'Mudar etapa',
    add_tag: 'Adicionar tag',
    remove_tag: 'Remover tag',
    change_due_date: 'Mudar prazo (due date)',
    change_assignee: 'Mudar responsável',
    send_whatsapp: 'Enviar WhatsApp',
    add_comment: 'Adicionar comentário',
  },
  conditionFieldLabels: {
    'candidate.age': 'Idade do candidato',
    'candidate.stage': 'Etapa do candidato',
    'job_opening.role_title': 'Cargo da vaga',
    'store.name': 'Nome da loja',
    'store.slug': 'Slug da loja',
  },
  stageTriggerTypes: ['stage_changed'],
  stageOptions: STAGE_SELECT_OPTIONS,
  stageAccent,
  stageLabel,
  changeStageActionType: 'change_stage',
  defaultTriggerType: 'stage_changed',
  defaultActionType: 'change_stage',
  defaultConditionField: 'candidate.age',
  supportsConfirmation: true,
  fixedPlaceholders: [
    '{candidate_name}', '{candidate_first_name}', '{job_role_title}',
    '{store_name}', '{store_maps_link}', '{new_stage}', '{previous_stage}',
  ],
}

// ============================================================
// Processo de contratação (DP)
// ============================================================

// Etapas do kanban de Contratação, união de CLT + MEI — mesma lista e mesmas
// cores usadas no kanban, pra etapa aparecer igual nos dois lugares.
const PROCESS_STAGE_OPTIONS = ALL_STAGE_COLUMNS.map((col) => ({
  value: col.stage,
  label: col.label,
  color: col.accent,
}))

const PROCESS_STAGE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_STAGE_COLUMNS.map((col) => [col.stage, col.label]),
)
const PROCESS_STAGE_ACCENTS: Record<string, string> = Object.fromEntries(
  ALL_STAGE_COLUMNS.map((col) => [col.stage, col.accent]),
)

export const PROCESS_AUTOMATION_CONFIG: AutomationEntityConfig = {
  entity: 'process',
  queryPrefix: 'dp',
  triggerTypeLabels: {
    process_stage_changed: 'Processo entra na etapa',
    process_date_reached: 'Data de referência chega',
    process_stage_timeout: 'Processo parado na etapa',
  },
  actionTypeLabels: {
    change_process_stage: 'Mudar etapa',
    send_whatsapp: 'Enviar WhatsApp',
    add_timeline_note: 'Anotar na linha do tempo',
  },
  conditionFieldLabels: {
    'process.employment_type': 'Tipo de vínculo (clt/mei)',
    'process.stage': 'Etapa do processo',
    'process.role_title': 'Cargo',
    'store.name': 'Nome da loja',
    'store.slug': 'Slug da loja',
  },
  stageTriggerTypes: ['process_stage_changed', 'process_stage_timeout'],
  // Em "parado na etapa", deixar em branco vale como "qualquer etapa" — o
  // dispatcher trata trigger_stage NULL assim.
  optionalStageTriggerTypes: ['process_stage_timeout'],
  triggerConfigFields: {
    process_date_reached: [
      {
        key: 'date_source',
        label: 'Data de referência',
        type: 'select',
        options: [
          { value: 'contract_term_end', label: 'Fim do curso de formação' },
          { value: 'experience_end', label: 'Fim do período de experiência' },
          { value: 'due_date', label: 'Prazo do processo' },
        ],
      },
      {
        key: 'offset_days',
        label: 'Deslocamento (dias)',
        type: 'number',
        placeholder: '0',
        help: 'Negativo antecipa: -2 dispara 2 dias antes da data.',
      },
    ],
    process_stage_timeout: [
      {
        key: 'days',
        label: 'Dias parado',
        type: 'number',
        placeholder: '5',
        help: 'Conta desde a entrada na etapa. Voltar pra etapa reinicia a contagem.',
      },
    ],
  },
  stageOptions: PROCESS_STAGE_OPTIONS,
  stageAccent: (stage) => PROCESS_STAGE_ACCENTS[stage] ?? null,
  stageLabel: (stage) => PROCESS_STAGE_LABELS[stage] || stage,
  changeStageActionType: 'change_process_stage',
  defaultTriggerType: 'process_stage_changed',
  defaultActionType: 'add_timeline_note',
  defaultConditionField: 'process.employment_type',
  // Não há popup de confirmação no kanban de Contratação (o do RH vive em
  // Candidatos.tsx, ligado a move_candidate_stage_confirmed).
  supportsConfirmation: false,
  fixedPlaceholders: [
    '{candidate_name}', '{candidate_first_name}', '{job_role_title}',
    '{store_name}', '{new_stage}', '{previous_stage}',
  ],
}
