import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Loader, Plus, Zap, Tag as TagIcon, MessageSquare, KeyRound, Pencil, Trash2, GripVertical, X } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import ColorSelect from '@/components/rh/ColorSelect'
import { STAGE_SELECT_OPTIONS, stageAccent, stageLabel } from '@/lib/rhStages'

// ============================================================
// Tipos e constantes
// ============================================================

type TriggerType = 'candidate_created' | 'stage_changed' | 'due_date_reached'
type ActionType = 'change_stage' | 'add_tag' | 'remove_tag' | 'change_due_date' | 'change_assignee' | 'send_whatsapp' | 'add_comment'
type ConditionField = 'candidate.age' | 'candidate.stage' | 'job_opening.role_title' | 'store.name' | 'store.slug'
type ConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

interface Condition { field: ConditionField; op: ConditionOp; value: string }

interface Automation {
  id: string
  name: string
  description: string | null
  trigger_type: TriggerType
  trigger_stage: string | null
  trigger_conditions: Condition[]
  is_active: boolean
  sort_order: number
}

interface AutomationAction {
  id: string
  automation_id: string
  sort_order: number
  action_type: ActionType
  action_config: Record<string, unknown>
}

interface RhTag { id: string; name: string; slug: string; color: string }
interface WhatsappTemplate { id: string; name: string; body: string; is_active: boolean }
interface RhStore { id: string; name: string; slug: string }
interface SystemUser { id: string; full_name: string | null }
interface CredentialStatus { configured: boolean; is_active: boolean; uazapi_url: string | null; token_last4: string | null; updated_at: string | null }

const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  candidate_created: 'Candidato criado',
  stage_changed: 'Candidato entra na etapa',
  due_date_reached: 'Prazo (due date) chega',
}

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  change_stage: 'Mudar etapa',
  add_tag: 'Adicionar tag',
  remove_tag: 'Remover tag',
  change_due_date: 'Mudar prazo (due date)',
  change_assignee: 'Mudar responsável',
  send_whatsapp: 'Enviar WhatsApp',
  add_comment: 'Adicionar comentário',
}

const CONDITION_FIELD_LABELS: Record<ConditionField, string> = {
  'candidate.age': 'Idade do candidato',
  'candidate.stage': 'Etapa do candidato',
  'job_opening.role_title': 'Cargo da vaga',
  'store.name': 'Nome da loja',
  'store.slug': 'Slug da loja',
}

const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: 'é igual a', neq: 'é diferente de', gt: 'é maior que', gte: 'é maior ou igual a',
  lt: 'é menor que', lte: 'é menor ou igual a', in: 'está em (separado por vírgula)', contains: 'contém',
}

const EMPTY_AUTOMATION = { name: '', description: '', trigger_type: 'stage_changed' as TriggerType, trigger_stage: '', trigger_conditions: [] as Condition[] }
const EMPTY_TAG = { name: '', color: '#6B7280' }
const EMPTY_TEMPLATE = { name: '', body: '' }

const TABS = [
  { key: 'automacoes', label: 'Automações', icon: Zap },
  { key: 'tags', label: 'Tags', icon: TagIcon },
  { key: 'templates', label: 'Modelos WhatsApp', icon: MessageSquare },
  { key: 'credenciais', label: 'Credenciais WhatsApp', icon: KeyRound },
] as const
type TabKey = typeof TABS[number]['key']

const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring'
const labelClass = 'block text-xs font-semibold text-muted-foreground uppercase mb-1'

function slugify(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// ============================================================
// Página
// ============================================================

export default function RhAutomacoes() {
  const [tab, setTab] = useState<TabKey>('automacoes')

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Construtor de Automações</h1>
          <p className="text-sm text-muted-foreground mt-1">Regras que rodam sozinhas quando um candidato muda de etapa, é criado ou tem um prazo vencido</p>
        </div>
        <div className="px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === key ? 'border-gold-text text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        {tab === 'automacoes' && <AutomationsTab />}
        {tab === 'tags' && <TagsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'credenciais' && <CredentialsTab />}
      </div>
    </AdminLayout>
  )
}

// ============================================================
// Aba: Automações
// ============================================================

function AutomationCard({
  automation, expanded, onToggleExpand, onToggleActive, onDelete, onEdit,
}: {
  automation: Automation
  expanded: boolean
  onToggleExpand: () => void
  onToggleActive: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: automation.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const queryClient = useQueryClient()
  const { data: actions = [] } = useQuery<AutomationAction[]>({
    queryKey: ['rh-automation-actions', automation.id],
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
      queryClient.invalidateQueries({ queryKey: ['rh-automation-actions', automation.id] })
    },
  })

  function handleActionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = actions.findIndex((a) => a.id === active.id)
    const newIndex = actions.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(actions, oldIndex, newIndex)
    queryClient.setQueryData(['rh-automation-actions', automation.id], reordered)
    reorderActions.mutate(reordered.map((a, i) => ({ id: a.id, sort_order: i })))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  return (
    <div ref={setNodeRef} style={style} className={`bg-white rounded-xl border overflow-hidden ${expanded ? 'border-ring shadow-md' : 'border-border shadow-sm'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-surface-alt/50">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0" aria-label="Arrastar">
          <GripVertical className="w-4 h-4" />
        </button>
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={onToggleExpand}>
          <span className="font-medium text-sm text-foreground truncate">{automation.name}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-alt text-muted-foreground shrink-0">
            {TRIGGER_TYPE_LABELS[automation.trigger_type]}
          </span>
          {automation.trigger_stage && (
            // Etapa sempre com a cor dela (mesma paleta do kanban) — etapa
            // que não existe mais no banco cai no estilo neutro.
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 truncate"
              style={stageAccent(automation.trigger_stage)
                ? { backgroundColor: `${stageAccent(automation.trigger_stage)}22`, color: stageAccent(automation.trigger_stage)! }
                : { backgroundColor: 'var(--surface-alt)', color: 'var(--muted-foreground)' }}
            >
              {stageLabel(automation.trigger_stage)}
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
                    <ActionRow key={action.id} action={action} index={i} />
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

function ActionRow({ action, index }: { action: AutomationAction; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: action.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-alt/60 text-xs">
      <button {...attributes} {...listeners} className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0">
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="font-mono text-muted-foreground shrink-0">{index + 1}.</span>
      <span className="font-medium text-foreground">{ACTION_TYPE_LABELS[action.action_type]}</span>
    </li>
  )
}

function ActionConfigEditor({
  actionType, config, tags, templates, systemUsers, onChange,
}: {
  actionType: ActionType
  config: Record<string, unknown>
  tags: RhTag[]
  templates: WhatsappTemplate[]
  systemUsers: SystemUser[]
  onChange: (config: Record<string, unknown>) => void
}) {
  if (actionType === 'change_stage') {
    return (
      <ColorSelect
        variant="dot"
        value={(config.stage as string) || ''}
        onChange={(v) => onChange({ stage: v })}
        options={STAGE_SELECT_OPTIONS}
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
      <StyledSelect
        value={(config.template_id as string) || ''}
        onChange={(v) => onChange({ template_id: v })}
        options={templates.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))}
        emptyLabel="Selecione o modelo"
      />
    )
  }
  // add_comment
  return (
    <div>
      <textarea
        value={(config.text as string) || ''}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        placeholder="Ex: Candidato avançou pra {new_stage}"
        className={inputClass}
      />
      <p className="text-[11px] text-muted-foreground mt-1">Placeholders: {'{candidate_name} {job_role_title} {store_name} {new_stage} {previous_stage}'}</p>
    </div>
  )
}

function AutomationEditorModal({
  automation, onClose,
}: {
  automation: Automation | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!automation
  const [form, setForm] = useState(automation ? {
    name: automation.name, description: automation.description || '',
    trigger_type: automation.trigger_type, trigger_stage: automation.trigger_stage || '',
    trigger_conditions: automation.trigger_conditions || [],
  } : EMPTY_AUTOMATION)
  const [actions, setActions] = useState<{ id?: string; action_type: ActionType; action_config: Record<string, unknown> }[]>([])

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

  useQuery<AutomationAction[]>({
    queryKey: ['rh-automation-actions-edit', automation?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_actions').select('*').eq('automation_id', automation!.id).order('sort_order')
      if (error) throw error
      setActions((data || []).map((a) => ({ id: a.id, action_type: a.action_type as ActionType, action_config: a.action_config as Record<string, unknown> })))
      return (data || []) as AutomationAction[]
    },
    enabled: !!automation,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        trigger_type: form.trigger_type,
        trigger_stage: form.trigger_type === 'stage_changed' ? form.trigger_stage : null,
        trigger_conditions: form.trigger_conditions,
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
      queryClient.invalidateQueries({ queryKey: ['rh-automations'] })
      queryClient.invalidateQueries({ queryKey: ['rh-automation-actions'] })
      toast.success(isEdit ? 'Automação atualizada' : 'Automação criada')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome da automação'); return }
    if (form.trigger_type === 'stage_changed' && !form.trigger_stage) { toast.error('Selecione a etapa do gatilho'); return }
    saveMutation.mutate()
  }

  function addCondition() {
    setForm({ ...form, trigger_conditions: [...form.trigger_conditions, { field: 'candidate.age', op: 'eq', value: '' }] })
  }
  function updateCondition(i: number, patch: Partial<Condition>) {
    const next = form.trigger_conditions.slice()
    next[i] = { ...next[i], ...patch }
    setForm({ ...form, trigger_conditions: next })
  }
  function removeCondition(i: number) {
    setForm({ ...form, trigger_conditions: form.trigger_conditions.filter((_, idx) => idx !== i) })
  }

  function addAction() {
    setActions([...actions, { action_type: 'change_stage', action_config: {} }])
  }
  function updateAction(i: number, patch: Partial<{ action_type: ActionType; action_config: Record<string, unknown> }>) {
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
                onChange={(v) => setForm({ ...form, trigger_type: v as TriggerType, trigger_stage: '' })}
                options={Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                searchable={false}
              />
            </div>
            {form.trigger_type === 'stage_changed' && (
              <div>
                <label className={labelClass}>Etapa</label>
                <ColorSelect
                  variant="dot"
                  value={form.trigger_stage}
                  onChange={(v) => setForm({ ...form, trigger_stage: v })}
                  options={STAGE_SELECT_OPTIONS}
                  placeholder="Selecione"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelClass} mb-0`}>Condições (opcional, todas precisam bater)</label>
              <button onClick={addCondition} className="text-xs font-semibold text-gold-text hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {form.trigger_conditions.map((c, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <StyledSelect
                    value={c.field}
                    onChange={(v) => updateCondition(i, { field: v as ConditionField })}
                    options={Object.entries(CONDITION_FIELD_LABELS).map(([value, label]) => ({ value, label }))}
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
                  <input type="text" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} className={`${inputClass} flex-1`} placeholder="valor" />
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
                      onChange={(v) => updateAction(i, { action_type: v as ActionType, action_config: {} })}
                      options={Object.entries(ACTION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                      className="flex-1"
                    />
                    <button onClick={() => removeAction(i)} className="p-1.5 text-muted-foreground hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                  <ActionConfigEditor
                    actionType={a.action_type} config={a.action_config} tags={tags} templates={templates} systemUsers={systemUsers}
                    onChange={(config) => updateAction(i, { action_config: config })}
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

function AutomationsTab() {
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Automation | null | 'new'>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Automation | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ['rh-automations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('automations').select('*').order('sort_order')
      if (error) throw error
      return (data || []) as Automation[]
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (a: Automation) => {
      const { error } = await supabase.from('automations').update({ is_active: !a.is_active }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-automations'] }),
    onError: (err) => toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-automations'] })
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
      queryClient.invalidateQueries({ queryKey: ['rh-automations'] })
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = automations.findIndex((a) => a.id === active.id)
    const newIndex = automations.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(automations, oldIndex, newIndex)
    queryClient.setQueryData(['rh-automations'], reordered)
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

      {editing && <AutomationEditorModal automation={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

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

// ============================================================
// Aba: Tags
// ============================================================

function TagsTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_TAG)
  const [deleteConfirm, setDeleteConfirm] = useState<RhTag | null>(null)

  const { data: tags = [], isLoading } = useQuery<RhTag[]>({
    queryKey: ['rh-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name')
      if (error) throw error
      return (data || []) as RhTag[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), slug: slugify(form.name), color: form.color }
      if (editingId) {
        const { error } = await supabase.from('tags').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tags').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-tags'] })
      toast.success(editingId ? 'Tag atualizada' : 'Tag criada')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-tags'] })
      toast.success('Tag excluída')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function closeModal() { setModalOpen(false); setEditingId(null); setForm(EMPTY_TAG) }
  function openEdit(t: RhTag) { setEditingId(t.id); setForm({ name: t.name, color: t.color }); setModalOpen(true) }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg btn-action text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova tag
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12"><Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" /></div>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nenhuma tag cadastrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span className="flex-1 text-sm font-medium text-foreground">{t.name}</span>
              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => setDeleteConfirm(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-4">{editingId ? 'Editar tag' : 'Nova tag'}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nome *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Urgente" />
              </div>
              <div>
                <label className={labelClass}>Cor</label>
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full h-10 rounded-lg border border-border cursor-pointer" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { if (!form.name.trim()) { toast.error('Informe o nome da tag'); return } saveMutation.mutate() }}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={closeModal} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Excluir tag</h2>
            <p className="text-sm text-muted-foreground mb-5">"{deleteConfirm.name}" será removida de todos os candidatos que a têm.</p>
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

// ============================================================
// Aba: Modelos WhatsApp
// ============================================================

function TemplatesTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_TEMPLATE)
  const [deleteConfirm, setDeleteConfirm] = useState<WhatsappTemplate | null>(null)

  const { data: templates = [], isLoading } = useQuery<WhatsappTemplate[]>({
    queryKey: ['rh-whatsapp-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_templates').select('*').order('name')
      if (error) throw error
      return (data || []) as WhatsappTemplate[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), body: form.body.trim() }
      if (editingId) {
        const { error } = await supabase.from('whatsapp_templates').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('whatsapp_templates').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-templates'] })
      toast.success(editingId ? 'Modelo atualizado' : 'Modelo criado')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const toggleActive = useMutation({
    mutationFn: async (t: WhatsappTemplate) => {
      const { error } = await supabase.from('whatsapp_templates').update({ is_active: !t.is_active }).eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-templates'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-templates'] })
      toast.success('Modelo excluído')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function closeModal() { setModalOpen(false); setEditingId(null); setForm(EMPTY_TEMPLATE) }
  function openEdit(t: WhatsappTemplate) { setEditingId(t.id); setForm({ name: t.name, body: t.body }); setModalOpen(true) }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg btn-action text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo modelo
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12"><Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" /></div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nenhum modelo cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="px-3 py-2.5 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex-1 text-sm font-medium text-foreground">{t.name}</span>
                <button onClick={() => toggleActive.mutate(t)} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {t.is_active ? 'Ativo' : 'Inativo'}
                </button>
                <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDeleteConfirm(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{t.body}</p>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-foreground mb-4">{editingId ? 'Editar modelo' : 'Novo modelo'}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nome *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Boas-vindas" />
              </div>
              <div>
                <label className={labelClass}>Mensagem *</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className={inputClass} placeholder="Oi {candidate_name}! Vimos seu interesse na vaga de {job_role_title}..." />
                <p className="text-[11px] text-muted-foreground mt-1">Placeholders: {'{candidate_name} {job_role_title} {store_name} {new_stage} {previous_stage}'}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { if (!form.name.trim() || !form.body.trim()) { toast.error('Preencha nome e mensagem'); return } saveMutation.mutate() }}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={closeModal} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Excluir modelo</h2>
            <p className="text-sm text-muted-foreground mb-5">"{deleteConfirm.name}" será removido. Automações que o usam vão parar de enviar até serem reconfiguradas.</p>
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

// ============================================================
// Aba: Credenciais WhatsApp por loja
// ============================================================

function CredentialEditModal({ store, onClose }: { store: RhStore; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_store_whatsapp_credential', {
        p_store_id: store.id, p_uazapi_url: url.trim(), p_uazapi_token: token.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-whatsapp-credential-status', store.id] })
      toast.success('Credencial salva')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-foreground mb-1">Credencial Uazapi</h2>
        <p className="text-xs text-muted-foreground mb-4">{store.name}</p>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>URL da instância</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://minha-instancia.uazapi.com" />
          </div>
          <div>
            <label className={labelClass}>Token</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={inputClass} placeholder="Token da instância" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => { if (!url.trim() || !token.trim()) { toast.error('Preencha URL e token'); return } saveMutation.mutate() }}
            disabled={saveMutation.isPending}
            className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70"
          >
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function CredentialStoreRow({ store }: { store: RhStore }) {
  const [editing, setEditing] = useState(false)
  const { data: status, isLoading } = useQuery<CredentialStatus>({
    queryKey: ['rh-whatsapp-credential-status', store.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_store_whatsapp_credential_status', { p_store_id: store.id })
      if (error) throw error
      return data as CredentialStatus
    },
  })

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
      <span className="flex-1 text-sm font-medium text-foreground">{store.name}</span>
      {isLoading ? (
        <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : status?.configured ? (
        <span className="text-xs text-muted-foreground font-mono">•••{status.token_last4}</span>
      ) : (
        <span className="text-xs text-muted-foreground">Usa a instância global (não configurada por loja)</span>
      )}
      <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
      {editing && <CredentialEditModal store={store} onClose={() => setEditing(false)} />}
    </div>
  )
}

function CredentialsTab() {
  const { data: stores = [], isLoading } = useQuery<RhStore[]>({
    queryKey: ['rh-stores-with-slug'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, slug').order('name')
      if (error) throw error
      return (data || []) as RhStore[]
    },
  })

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Sem credencial configurada, o envio de WhatsApp da automação usa a instância global do negócio. Configure aqui só se a loja tiver um número próprio.
      </p>
      {isLoading ? (
        <div className="text-center py-12"><Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" /></div>
      ) : (
        <div className="space-y-2">
          {stores.map((s) => <CredentialStoreRow key={s.id} store={s} />)}
        </div>
      )}
    </div>
  )
}
