// Painel de automações — compartilhado entre RH (candidatos) e DP (processos
// de contratação). Extraído de src/pages/rh/Automacoes.tsx sem mudança de
// comportamento: o que era específico do candidato virou o objeto de config
// (AutomationEntityConfig), o resto é idêntico.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader, Plus, Pencil, Trash2, GripVertical, X, ShieldCheck } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import StyledSelect from '@/components/ui/styled-select'
import ColorSelect from '@/components/rh/ColorSelect'
import ConditionValueInput from './ConditionValueInput'
import {
  CONDITION_OP_LABELS,
  type Automation, type AutomationAction, type AutomationEntityConfig, type AutomationVariable,
  type Condition, type ConditionOp, type RhTag, type SystemUser, type WhatsappInstance,
  type WhatsappTemplate,
} from './types'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring'
const labelClass = 'block text-xs font-semibold text-muted-foreground uppercase mb-1'

// Variáveis livres são globais (não têm entidade) — as duas telas leem a mesma
// lista, então a query key também é uma só.
export function useAutomationVariables() {
  return useQuery<AutomationVariable[]>({
    queryKey: ['rh-automation-variables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_variables').select('*').order('sort_order')
      if (error) throw error
      return (data || []) as AutomationVariable[]
    },
  })
}

// Instâncias nunca vêm por SELECT — a tabela é invisível via PostgREST e a RPC
// devolve só os 4 últimos dígitos do token.
export function useWhatsappInstances() {
  return useQuery<WhatsappInstance[]>({
    queryKey: ['rh-whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_whatsapp_instances')
      if (error) throw error
      return (data || []) as WhatsappInstance[]
    },
  })
}

export function PlaceholderHint({ fixedPlaceholders }: { fixedPlaceholders: string[] }) {
  const { data: variables = [] } = useAutomationVariables()
  return (
    <p className="text-[11px] text-muted-foreground mt-1 break-words">
      Placeholders: {fixedPlaceholders.join(' ')}
      {variables.length > 0 && ` ${variables.map((v) => `{var.${v.key}}`).join(' ')}`}
    </p>
  )
}

function AutomationCard({
  automation, config, expanded, onToggleExpand, onToggleActive, onDelete, onEdit,
}: {
  automation: Automation
  config: AutomationEntityConfig
  expanded: boolean
  onToggleExpand: () => void
  onToggleActive: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: automation.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const queryClient = useQueryClient()
  const actionsKey = [`${config.queryPrefix}-automation-actions`, automation.id]
  const { data: actions = [] } = useQuery<AutomationAction[]>({
    queryKey: actionsKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_actions').select('*').eq('automation_id', automation.id).order('sort_order')
      if (error) throw error
      return (data || []) as AutomationAction[]
    },
    enabled: expanded,
  })

  const reorderActions = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const { error } = await supabase.rpc('admin_reorder_automation_actions', { updates })
      if (error) throw error
    },
    onError: (err) => {
      toast.error(`Erro ao reordenar ações: ${err instanceof Error ? err.message : 'desconhecido'}`)
      queryClient.invalidateQueries({ queryKey: actionsKey })
    },
  })

  function handleActionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = actions.findIndex((a) => a.id === active.id)
    const newIndex = actions.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(actions, oldIndex, newIndex)
    queryClient.setQueryData(actionsKey, reordered)
    reorderActions.mutate(reordered.map((a, i) => ({ id: a.id, sort_order: i })))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const accent = automation.trigger_stage ? config.stageAccent(automation.trigger_stage) : null

  return (
    <div ref={setNodeRef} style={style} className={`bg-card rounded-xl border overflow-hidden ${expanded ? 'border-ring shadow-md' : 'border-border shadow-sm'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-surface-alt/50">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0" aria-label="Arrastar">
          <GripVertical className="w-4 h-4" />
        </button>
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={onToggleExpand}>
          <span className="font-medium text-sm text-foreground truncate">{automation.name}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-alt text-muted-foreground shrink-0">
            {config.triggerTypeLabels[automation.trigger_type] ?? automation.trigger_type}
          </span>
          {automation.trigger_stage && (
            // Etapa sempre com a cor dela (mesma paleta do kanban) — etapa que
            // não existe mais no banco cai no estilo neutro.
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 truncate"
              style={accent
                ? { backgroundColor: `${accent}22`, color: accent }
                : { backgroundColor: 'var(--surface-alt)', color: 'var(--muted-foreground)' }}
            >
              {config.stageLabel(automation.trigger_stage)}
            </span>
          )}
          {automation.requires_confirmation && (
            <span
              className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-warning-subtle text-warning shrink-0"
              title="Só executa depois de confirmação no kanban"
            >
              <ShieldCheck className="w-2.5 h-2.5" /> Confirmação
            </span>
          )}
        </button>
        <button
          onClick={onToggleActive}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${automation.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
        >
          {automation.is_active ? 'Ativa' : 'Inativa'}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground hover:text-foreground shrink-0" title="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 shrink-0" title="Excluir">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-3">
          {actions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhuma ação — clique em editar pra adicionar.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActionDragEnd}>
              <SortableContext items={actions.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-1.5">
                  {actions.map((action, i) => (
                    <ActionRow key={action.id} action={action} index={i} config={config} />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}

function ActionRow({ action, index, config }: { action: AutomationAction; index: number; config: AutomationEntityConfig }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: action.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-alt/60 text-xs">
      <button {...attributes} {...listeners} className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0">
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="font-mono text-muted-foreground shrink-0">{index + 1}.</span>
      <span className="font-medium text-foreground">{config.actionTypeLabels[action.action_type] ?? action.action_type}</span>
    </li>
  )
}

function ActionConfigEditor({
  actionType, config, entityConfig, tags, templates, systemUsers, instances, onChange,
}: {
  actionType: string
  config: Record<string, unknown>
  entityConfig: AutomationEntityConfig
  tags: RhTag[]
  templates: WhatsappTemplate[]
  systemUsers: SystemUser[]
  instances: WhatsappInstance[]
  onChange: (config: Record<string, unknown>) => void
}) {
  // Mudar etapa: o seletor sai da config da entidade (etapas do funil de RH ou
  // do kanban de contratação).
  if (actionType === entityConfig.changeStageActionType) {
    return (
      <ColorSelect
        variant="dot"
        value={(config.stage as string) || ''}
        onChange={(v) => onChange({ stage: v })}
        options={entityConfig.stageOptions}
        placeholder="Selecione a etapa"
      />
    )
  }
  if (actionType === 'add_tag' || actionType === 'remove_tag') {
    return (
      <StyledSelect
        value={(config.tag_id as string) || ''}
        onChange={(v) => onChange({ tag_id: v })}
        options={tags.map((t) => ({ value: t.id, label: t.name }))}
        emptyLabel="Selecione a tag"
      />
    )
  }
  if (actionType === 'change_due_date') {
    const mode = (config.mode as string) || 'relative_days'
    return (
      <div className="flex gap-2">
        <StyledSelect
          value={mode}
          onChange={(v) => onChange({ mode: v, days: config.days })}
          options={[
            { value: 'relative_days', label: 'Dias a partir de agora' },
            { value: 'clear', label: 'Limpar prazo' },
          ]}
          searchable={false}
        />
        {mode === 'relative_days' && (
          <input
            type="number" min={0} placeholder="dias" value={(config.days as number) ?? ''}
            onChange={(e) => onChange({ mode, days: Number(e.target.value) })}
            className={`${inputClass} w-24`}
          />
        )}
      </div>
    )
  }
  if (actionType === 'change_assignee') {
    const clear = Boolean(config.clear)
    return (
      <div className="flex gap-2 items-center">
        <StyledSelect
          value={clear ? '__clear__' : (config.assignee_id as string) || ''}
          onChange={(v) => onChange(v === '__clear__' ? { clear: true } : { assignee_id: v })}
          options={[
            { value: '__clear__', label: 'Remover responsável' },
            ...systemUsers.map((u) => ({ value: u.id, label: u.full_name || 'Sem nome' })),
          ]}
          emptyLabel="Selecione o responsável"
        />
      </div>
    )
  }
  if (actionType === 'send_whatsapp') {
    return (
      <div className="space-y-2">
        <StyledSelect
          value={(config.template_id as string) || ''}
          onChange={(v) => onChange({ ...config, template_id: v })}
          options={templates.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))}
          emptyLabel="Selecione o modelo"
        />
        <div>
          <StyledSelect
            value={(config.whatsapp_instance_id as string) || ''}
            onChange={(v) => onChange({ ...config, whatsapp_instance_id: v })}
            options={instances.filter((i) => i.is_active).map((i) => ({ value: i.id, label: i.name }))}
            emptyLabel="Instância da loja (padrão)"
            placeholder="Instância da loja (padrão)"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Sem escolher, usa a instância da loja do candidato — e, se ela não tiver, a global.
          </p>
        </div>
      </div>
    )
  }
  // add_comment (RH) e add_timeline_note (DP): mesmo editor de texto.
  return (
    <div>
      <textarea
        value={(config.text as string) || ''}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        placeholder="Ex: avançou pra {new_stage}"
        className={inputClass}
      />
      <PlaceholderHint fixedPlaceholders={entityConfig.fixedPlaceholders} />
    </div>
  )
}

function AutomationEditorModal({
  automation, config, onClose,
}: {
  automation: Automation | null
  config: AutomationEntityConfig
  onClose: () => void
}) {
  useEscapeToClose(onClose)
  const queryClient = useQueryClient()
  const isEdit = !!automation
  const [form, setForm] = useState(automation ? {
    name: automation.name, description: automation.description || '',
    trigger_type: automation.trigger_type, trigger_stage: automation.trigger_stage || '',
    trigger_conditions: automation.trigger_conditions || [],
    trigger_config: automation.trigger_config || {},
    requires_confirmation: automation.requires_confirmation ?? false,
  } : {
    name: '', description: '', trigger_type: config.defaultTriggerType, trigger_stage: '',
    trigger_conditions: [] as Condition[], trigger_config: {} as Record<string, unknown>,
    requires_confirmation: false,
  })
  const [actions, setActions] = useState<{ id?: string; action_type: string; action_config: Record<string, unknown> }[]>([])

  const { data: tags = [] } = useQuery<RhTag[]>({
    queryKey: ['rh-tags'], queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name')
      if (error) throw error
      return (data || []) as RhTag[]
    },
  })
  const { data: templates = [] } = useQuery<WhatsappTemplate[]>({
    queryKey: ['rh-whatsapp-templates'], queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_templates').select('*').order('name')
      if (error) throw error
      return (data || []) as WhatsappTemplate[]
    },
  })
  // get_assignable_rh_users() devolve só id + nome, já filtrado por
  // has_rh_access() no servidor — get_system_users() virou admin-only no
  // checkup de 2026-07-23 (expunha e-mail/WhatsApp de toda a equipe).
  const { data: systemUsers = [] } = useQuery<SystemUser[]>({
    queryKey: ['rh-assignable-users'], queryFn: async () => {
      const { data, error } = await supabase.rpc('get_assignable_rh_users')
      if (error) throw error
      return (data || []) as SystemUser[]
    },
  })
  const { data: instances = [] } = useWhatsappInstances()

  useQuery<AutomationAction[]>({
    queryKey: [`${config.queryPrefix}-automation-actions-edit`, automation?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_actions').select('*').eq('automation_id', automation!.id).order('sort_order')
      if (error) throw error
      setActions((data || []).map((a) => ({ id: a.id, action_type: a.action_type as string, action_config: a.action_config as Record<string, unknown> })))
      return (data || []) as AutomationAction[]
    },
    enabled: !!automation,
  })

  const usesStage = config.stageTriggerTypes.includes(form.trigger_type)
  const stageOptional = (config.optionalStageTriggerTypes || []).includes(form.trigger_type)
  const triggerConfigFields = config.triggerConfigFields?.[form.trigger_type] || []

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        entity: config.entity,
        trigger_type: form.trigger_type,
        trigger_stage: usesStage ? (form.trigger_stage || null) : null,
        trigger_conditions: form.trigger_conditions,
        trigger_config: triggerConfigFields.length > 0 ? form.trigger_config : {},
        requires_confirmation: config.supportsConfirmation ? form.requires_confirmation : false,
      }
      let automationId = automation?.id
      if (isEdit) {
        const { error } = await supabase.from('automations').update(payload).eq('id', automationId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('automations').insert(payload).select().single()
        if (error) throw error
        automationId = data.id
      }

      // Substitui as ações inteiras (simples e previsível: apaga e recria na ordem atual)
      await supabase.from('automation_actions').delete().eq('automation_id', automationId)
      if (actions.length > 0) {
        const { error } = await supabase.from('automation_actions').insert(
          actions.map((a, i) => ({ automation_id: automationId, sort_order: i, action_type: a.action_type, action_config: a.action_config }))
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${config.queryPrefix}-automations`] })
      queryClient.invalidateQueries({ queryKey: [`${config.queryPrefix}-automation-actions`] })
      toast.success(isEdit ? 'Automação atualizada' : 'Automação criada')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome da automação'); return }
    if (usesStage && !stageOptional && !form.trigger_stage) { toast.error('Selecione a etapa do gatilho'); return }
    for (const field of triggerConfigFields) {
      if (field.type === 'select' && !form.trigger_config[field.key]) {
        toast.error(`Selecione: ${field.label}`); return
      }
    }
    saveMutation.mutate()
  }

  function addCondition() {
    setForm({ ...form, trigger_conditions: [...form.trigger_conditions, { field: config.defaultConditionField, op: 'eq' as ConditionOp, value: '' }] })
  }
  function updateCondition(i: number, patch: Partial<Condition>) {
    const next = form.trigger_conditions.slice()
    const merged = { ...next[i], ...patch }

    // Trocar o operador muda a FORMA do valor: "está em" guarda array (é o que
    // jsonb_array_elements_text espera no motor), o resto guarda string.
    if (patch.op) {
      merged.value = patch.op === 'in'
        ? (Array.isArray(merged.value) ? merged.value : merged.value ? [merged.value] : [])
        : (Array.isArray(merged.value) ? merged.value[0] ?? '' : merged.value)
    }
    // Trocar o campo invalida o valor anterior — etapa de candidato não é
    // valor de cargo, e um valor herdado só geraria regra que nunca casa.
    if (patch.field && patch.field !== next[i].field) {
      merged.value = merged.op === 'in' ? [] : ''
    }

    next[i] = merged
    setForm({ ...form, trigger_conditions: next })
  }
  function removeCondition(i: number) {
    setForm({ ...form, trigger_conditions: form.trigger_conditions.filter((_, idx) => idx !== i) })
  }

  function addAction() {
    setActions([...actions, { action_type: config.defaultActionType, action_config: {} }])
  }
  function updateAction(i: number, patch: Partial<{ action_type: string; action_config: Record<string, unknown> }>) {
    const next = actions.slice()
    next[i] = { ...next[i], ...patch }
    setActions(next)
  }
  function removeAction(i: number) {
    setActions(actions.filter((_, idx) => idx !== i))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-foreground mb-5">{isEdit ? 'Editar automação' : 'Nova automação'}</h2>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nome *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Boas-vindas na conversa iniciada" />
          </div>
          <div>
            <label className={labelClass}>Descrição</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Gatilho</label>
              <StyledSelect
                value={form.trigger_type}
                onChange={(v) => setForm({ ...form, trigger_type: v, trigger_stage: '', trigger_config: {} })}
                options={Object.entries(config.triggerTypeLabels).map(([value, label]) => ({ value, label }))}
                searchable={false}
              />
            </div>
            {usesStage && (
              <div>
                <label className={labelClass}>Etapa{stageOptional && ' (opcional)'}</label>
                <ColorSelect
                  variant="dot"
                  value={form.trigger_stage}
                  onChange={(v) => setForm({ ...form, trigger_stage: v })}
                  options={config.stageOptions}
                  placeholder={stageOptional ? 'Qualquer etapa' : 'Selecione'}
                />
              </div>
            )}
          </div>

          {/* Config extra do gatilho (só existe onde a entidade declara) */}
          {triggerConfigFields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {triggerConfigFields.map((field) => (
                <div key={field.key}>
                  <label className={labelClass}>{field.label}</label>
                  {field.type === 'select' ? (
                    <StyledSelect
                      value={(form.trigger_config[field.key] as string) || ''}
                      onChange={(v) => setForm({ ...form, trigger_config: { ...form.trigger_config, [field.key]: v } })}
                      options={field.options || []}
                      emptyLabel={field.placeholder || 'Selecione'}
                      searchable={false}
                    />
                  ) : (
                    <input
                      type="number"
                      value={(form.trigger_config[field.key] as number) ?? ''}
                      onChange={(e) => setForm({ ...form, trigger_config: { ...form.trigger_config, [field.key]: e.target.value === '' ? '' : Number(e.target.value) } })}
                      className={inputClass}
                      placeholder={field.placeholder}
                    />
                  )}
                  {field.help && <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Só faz sentido onde existe um kanban que intercepta o movimento —
              gatilho por data/prazo roda sem ninguém na tela. */}
          {config.supportsConfirmation && config.stageTriggerTypes.includes(form.trigger_type) && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-surface-alt/40 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_confirmation}
                onChange={(e) => setForm({ ...form, requires_confirmation: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-border accent-ink-700 shrink-0"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Pedir confirmação antes de executar
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Ao mover o card pra esta etapa, o kanban mostra a mensagem já preenchida e só executa depois do "Confirmar".
                  Etapa mudada por qualquer outro caminho não dispara a automação — fica registrada como bloqueada no histórico.
                </span>
              </span>
            </label>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelClass} mb-0`}>Condições (opcional, todas precisam bater)</label>
              <button onClick={addCondition} className="text-xs font-semibold text-gold-text hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {form.trigger_conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap gap-1.5 items-center">
                  <StyledSelect
                    value={c.field}
                    onChange={(v) => updateCondition(i, { field: v })}
                    options={Object.entries(config.conditionFieldLabels).map(([value, label]) => ({ value, label }))}
                    className="flex-1"
                    searchable={false}
                  />
                  <StyledSelect
                    value={c.op}
                    onChange={(v) => updateCondition(i, { op: v as ConditionOp })}
                    options={Object.entries(CONDITION_OP_LABELS).map(([value, label]) => ({ value, label }))}
                    className="flex-1"
                    searchable={false}
                  />
                  <ConditionValueInput
                    condition={c}
                    config={config}
                    inputClass={inputClass}
                    onChange={(value) => updateCondition(i, { value })}
                  />
                  <button onClick={() => removeCondition(i)} className="p-1.5 text-muted-foreground hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelClass} mb-0`}>Ações (executadas em ordem)</label>
              <button onClick={addAction} className="text-xs font-semibold text-gold-text hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar ação
              </button>
            </div>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-border bg-surface-alt/40 space-y-2">
                  <div className="flex gap-1.5 items-center">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{i + 1}.</span>
                    <StyledSelect
                      value={a.action_type}
                      onChange={(v) => updateAction(i, { action_type: v, action_config: {} })}
                      options={Object.entries(config.actionTypeLabels).map(([value, label]) => ({ value, label }))}
                      className="flex-1"
                    />
                    <button onClick={() => removeAction(i)} className="p-1.5 text-muted-foreground hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                  <ActionConfigEditor
                    actionType={a.action_type} config={a.action_config} entityConfig={config}
                    tags={tags} templates={templates} systemUsers={systemUsers} instances={instances}
                    onChange={(cfg) => updateAction(i, { action_config: cfg })}
                  />
                </div>
              ))}
              {actions.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhuma ação adicionada ainda.</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70">
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function AutomationsPanel({ config }: { config: AutomationEntityConfig }) {
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Automation | null | 'new'>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Automation | null>(null)

  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const listKey = [`${config.queryPrefix}-automations`]

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: listKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('automations').select('*').eq('entity', config.entity).order('sort_order')
      if (error) throw error
      return (data || []) as Automation[]
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (a: Automation) => {
      const { error } = await supabase.from('automations').update({ is_active: !a.is_active }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    onError: (err) => toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey })
      toast.success('Automação excluída')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const { error } = await supabase.rpc('admin_reorder_automations', { updates })
      if (error) throw error
    },
    onError: (err) => {
      toast.error(`Erro ao reordenar: ${err instanceof Error ? err.message : 'desconhecido'}`)
      queryClient.invalidateQueries({ queryKey: listKey })
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = automations.findIndex((a) => a.id === active.id)
    const newIndex = automations.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(automations, oldIndex, newIndex)
    queryClient.setQueryData(listKey, reordered)
    reorderMutation.mutate(reordered.map((a, i) => ({ id: a.id, sort_order: i })))
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setEditing('new')} className="flex items-center gap-2 px-3 py-2 rounded-lg btn-action text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova automação
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12"><Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" /></div>
      ) : automations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nenhuma automação cadastrada ainda.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={automations.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2.5">
              {automations.map((a) => (
                <AutomationCard
                  key={a.id}
                  automation={a}
                  config={config}
                  expanded={expandedId === a.id}
                  onToggleExpand={() => setExpandedId((prev) => (prev === a.id ? null : a.id))}
                  onToggleActive={() => toggleActive.mutate(a)}
                  onDelete={() => setDeleteConfirm(a)}
                  onEdit={() => setEditing(a)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editing && <AutomationEditorModal automation={editing === 'new' ? null : editing} config={config} onClose={() => setEditing(null)} />}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Excluir automação</h2>
            <p className="text-sm text-muted-foreground mb-5">"{deleteConfirm.name}" será removida, junto com suas ações.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-70">
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
