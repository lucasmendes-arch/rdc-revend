// Vocabulário de automação por entidade.
//
// O motor no banco é um só (tabelas `automations`/`automation_actions`, com a
// coluna `entity` separando as regras), então a tela também é uma só: o RH e o
// DP montam o mesmo painel passando conjuntos diferentes de gatilhos, ações,
// campos de condição e etapas. Sem isso seriam ~700 linhas duplicadas que
// divergiriam no primeiro ajuste feito só de um lado.

import type { ColorSelectOption } from '@/components/rh/ColorSelect'

export type AutomationEntity = 'candidate' | 'process'

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

export interface Condition { field: string; op: ConditionOp; value: string }

export interface Automation {
  id: string
  name: string
  description: string | null
  entity: AutomationEntity
  trigger_type: string
  trigger_stage: string | null
  trigger_conditions: Condition[]
  trigger_config: Record<string, unknown>
  is_active: boolean
  requires_confirmation: boolean
  sort_order: number
}

export interface AutomationAction {
  id: string
  automation_id: string
  sort_order: number
  action_type: string
  action_config: Record<string, unknown>
}

export interface RhTag { id: string; name: string; slug: string; color: string }
export interface WhatsappTemplate { id: string; name: string; body: string; is_active: boolean }
export interface SystemUser { id: string; full_name: string | null }
export interface WhatsappInstance { id: string; name: string; uazapi_url: string; token_last4: string; is_active: boolean; updated_at: string }
export interface AutomationVariable { id: string; key: string; label: string; value: string | null; help_text: string | null; sort_order: number }

// Campo extra de configuração do gatilho (trigger_config), declarado por tipo
// de gatilho — é assim que "parado há N dias" e "data de referência" existem no
// DP sem o painel precisar conhecer o DP.
export interface TriggerConfigField {
  key: string
  label: string
  type: 'select' | 'number'
  options?: { value: string; label: string }[]
  placeholder?: string
  help?: string
}

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: 'é igual a', neq: 'é diferente de', gt: 'é maior que', gte: 'é maior ou igual a',
  lt: 'é menor que', lte: 'é menor ou igual a', in: 'está em (separado por vírgula)', contains: 'contém',
}

export interface AutomationEntityConfig {
  entity: AutomationEntity
  /** Prefixo das query keys do react-query — mantém os caches de RH e DP separados. */
  queryPrefix: string
  triggerTypeLabels: Record<string, string>
  actionTypeLabels: Record<string, string>
  conditionFieldLabels: Record<string, string>
  /** Gatilhos que têm uma etapa associada (obrigatória ou não). */
  stageTriggerTypes: string[]
  /** Gatilhos em que a etapa é opcional — no DP, "parado em qualquer etapa". */
  optionalStageTriggerTypes?: string[]
  /** Campos de trigger_config por tipo de gatilho. */
  triggerConfigFields?: Record<string, TriggerConfigField[]>
  /** Opções de etapa (com cor) usadas no gatilho e na ação de mudar etapa. */
  stageOptions: ColorSelectOption[]
  stageAccent: (stage: string) => string | null
  stageLabel: (stage: string) => string
  /** Ação que muda etapa nesta entidade — recebe o seletor de etapas. */
  changeStageActionType: string
  defaultTriggerType: string
  defaultActionType: string
  defaultConditionField: string
  /** requires_confirmation só existe onde há um kanban que intercepta o movimento. */
  supportsConfirmation: boolean
  fixedPlaceholders: string[]
}
