import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, GripVertical, Lock, ExternalLink, FileText } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import FormFieldRenderer, { FieldType, FormFieldConfig } from '@/components/rh/FormFieldRenderer'

interface FieldRow extends FormFieldConfig {
  show_on_card: boolean
  updated_at: string
}

interface JobRoleOption {
  id: string
  title: string
  is_active: boolean
}

const TYPE_LABELS: Record<FieldType, string> = {
  texto: 'Texto',
  texto_longo: 'Texto longo (várias linhas)',
  numero: 'Número',
  telefone: 'Telefone',
  select: 'Seleção (uma opção)',
  checkbox: 'Múltipla escolha (várias opções)',
  data: 'Data',
  upload_imagem: 'Upload de imagem',
  upload_imagens: 'Upload de várias imagens (até 5)',
  upload_arquivo: 'Upload de arquivo',
}

const OPTIONS_TYPES: FieldType[] = ['select', 'checkbox']

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g')

function slugify(label: string) {
  return label
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'campo'
}

const EMPTY_CREATE_FORM = { field_type: 'texto' as FieldType, label: '' }

// Card "Build", nos moldes do ClickUp Forms: no estado fechado mostra o
// campo exatamente como vai aparecer pro candidato (via FormFieldRenderer em
// modo leitura); clicar abre a edição inline — pergunta, texto de apoio,
// placeholder e obrigatório, que é o que o candidato realmente vê e usa.
function BuildFieldCard({
  field, expanded, onToggleExpand, onDelete, onFieldUpdate, onToggleRequired, onToggleCard, jobRoles,
}: {
  field: FieldRow
  expanded: boolean
  onToggleExpand: () => void
  onDelete: (f: FieldRow) => void
  onFieldUpdate: (id: string, patch: Record<string, unknown>) => void
  onToggleRequired: (f: FieldRow) => void
  onToggleCard: (f: FieldRow) => void
  jobRoles: JobRoleOption[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [optionsDraft, setOptionsDraft] = useState((field.options || []).join('\n'))

  function saveText(key: 'question_text' | 'help_text' | 'placeholder' | 'label', value: string) {
    const trimmed = value.trim()
    const current = (field[key] as string | null) || null
    if (trimmed === (current || '')) return
    onFieldUpdate(field.id, { [key]: trimmed || null })
  }

  return (
    <div ref={setNodeRef} style={style} className={`bg-card rounded-lg border overflow-hidden transition-colors ${expanded ? "border-ink-300 ring-1 ring-ring/30" : "border-border shadow-xs"}`}>
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border bg-surface">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0" aria-label="Arrastar">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-[11.5px] font-medium px-1.5 py-0.5 rounded-sm bg-muted text-ink-600 truncate min-w-0">{TYPE_LABELS[field.field_type]}</span>
        <span className="text-[11.5px] font-medium px-1.5 py-0.5 rounded-sm bg-muted text-ink-600 shrink-0 whitespace-nowrap">Etapa {field.step}</span>
        {field.is_system_field && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
        <span className="hidden sm:block text-[11.5px] text-muted-foreground truncate flex-1 font-mono">{field.field_key}</span>
        <button
          type="button"
          onClick={() => onToggleCard(field)}
          className={`ml-auto sm:ml-0 text-[11.5px] font-medium px-1.5 py-0.5 rounded-sm border shrink-0 whitespace-nowrap transition-colors ${field.show_on_card ? 'bg-success-subtle text-success border-success-border' : 'bg-transparent text-muted-foreground border-border hover:text-foreground'}`}
          title="Aparece no card do Kanban"
        >
          No card
        </button>
        <button
          onClick={() => !field.is_system_field && onDelete(field)}
          disabled={field.is_system_field}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-danger-subtle text-muted-foreground hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
          title={field.is_system_field ? 'Campo de sistema — não pode ser apagado (usado pelo kanban e pelas automações)' : 'Apagar'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {!expanded ? (
        <div className="p-4 cursor-pointer hover:bg-surface/60 transition-colors" onClick={onToggleExpand}>
          <FormFieldRenderer field={field} value="" onChange={() => {}} readOnly jobOpenings={[]} />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div>
            <label className="field-label">Pergunta</label>
            <input
              key={`q-${field.id}`}
              type="text"
              defaultValue={field.question_text || ''}
              onBlur={(e) => saveText('question_text', e.target.value)}
              placeholder={field.label}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div>
            <label className="field-label">Texto de apoio</label>
            <input
              key={`h-${field.id}`}
              type="text"
              defaultValue={field.help_text || ''}
              onBlur={(e) => saveText('help_text', e.target.value)}
              placeholder='Ex: Escreva aqui o seu nome completo'
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-[12px] text-muted-foreground mt-1">Aparece abaixo da pergunta, como uma dica pro candidato.</p>
          </div>

          <div>
            <label className="field-label">Texto dentro do campo (placeholder)</label>
            <input
              key={`p-${field.id}`}
              type="text"
              defaultValue={field.placeholder || ''}
              onBlur={(e) => saveText('placeholder', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {OPTIONS_TYPES.includes(field.field_type) && (
            <div>
              <label className="field-label">Opções <span className="font-normal text-muted-foreground">(uma por linha)</span></label>
              <textarea
                value={optionsDraft}
                onChange={(e) => setOptionsDraft(e.target.value)}
                onBlur={() => onFieldUpdate(field.id, { options: optionsDraft.split('\n').map((o) => o.trim()).filter(Boolean) })}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder={'Sim\nNão'}
              />
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer w-fit" title={field.is_system_field ? 'Campo de sistema — sempre obrigatório' : undefined}>
              <input
                type="checkbox"
                checked={field.required}
                disabled={field.is_system_field}
                onChange={() => onToggleRequired(field)}
                className="w-4 h-4 rounded border-border accent-ink-900"
              />
              <span className="text-[13px] font-medium text-foreground">Obrigatório</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground">Etapa</span>
              <input
                type="number"
                min={1}
                value={field.step}
                onChange={(e) => {
                  const step = parseInt(e.target.value, 10)
                  if (!isNaN(step) && step > 0) onFieldUpdate(field.id, { step })
                }}
                className="w-16 h-8 px-2 rounded-md border border-input bg-background text-foreground text-base md:text-sm text-center tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
          <p className="text-[12px] text-muted-foreground -mt-2">Perguntas com a mesma etapa aparecem juntas na mesma tela do formulário público.</p>

          {!field.is_system_field && jobRoles.length > 0 && (
            <div className="pt-3 border-t border-border">
              <label className="field-label">Mostrar apenas para os cargos</label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {jobRoles.map((role) => {
                  const selected = field.visible_for_job_role_ids || []
                  const checked = selected.includes(role.id)
                  return (
                    <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selected.filter((id) => id !== role.id) : [...selected, role.id]
                          onFieldUpdate(field.id, { visible_for_job_role_ids: next.length ? next : null })
                        }}
                        className="w-4 h-4 rounded border-border accent-ink-900"
                      />
                      <span className="text-[13px] text-foreground">{role.title}{!role.is_active ? ' (inativo)' : ''}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">
                Nenhum cargo marcado = pergunta aparece pra qualquer vaga. Vagas sem cargo vinculado no catálogo nunca mostram uma pergunta restrita por cargo.
              </p>
            </div>
          )}

          <details className="pt-3 border-t border-border">
            <summary className="text-[13px] font-medium text-muted-foreground hover:text-foreground cursor-pointer py-1">Avançado</summary>
            <div className="pt-2 space-y-3">
              <div>
                <label className="field-label">Label interna</label>
                <input
                  key={`l-${field.id}`}
                  type="text"
                  defaultValue={field.label}
                  onBlur={(e) => saveText('label', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p className="text-[12px] text-muted-foreground mt-1">Nome curto usado no card do Kanban e nas respostas — não é o que o candidato vê.</p>
              </div>
              <div>
                <label className="field-label">Tipo</label>
                <StyledSelect
                  value={field.field_type}
                  disabled={field.is_system_field}
                  onChange={(v) => onFieldUpdate(field.id, { field_type: v })}
                  options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                  searchable={false}
                />
                {field.is_system_field && <p className="text-[12px] text-muted-foreground mt-1">Campo de sistema — tipo travado.</p>}
              </div>
            </div>
          </details>

          <div className="flex justify-end pt-1">
            <Button size="sm" variant="secondary" onClick={onToggleExpand}>Concluir edição</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RhFormulario() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<FieldRow | null>(null)

  useEscapeToClose(closeCreate, createOpen)
  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const { data: fields = [], isLoading } = useQuery<FieldRow[]>({
    queryKey: ['rh-form-fields'],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_fields').select('*').order('sort_order')
      if (error) throw error
      return (data || []) as FieldRow[]
    },
    staleTime: 15 * 1000,
  })

  // Config é global, mas o link público é por unidade — deixa escolher qual
  // unidade abrir (mesmas 5 lojas do módulo, qualquer uma serve pra conferir).
  const { data: stores = [] } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ['rh-stores-with-slug'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, slug').order('name')
      if (error) throw error
      return (data || []) as { id: string; name: string; slug: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })
  const [previewStoreSlug, setPreviewStoreSlug] = useState('')
  const effectivePreviewSlug = previewStoreSlug || stores[0]?.slug || ''

  const { data: jobRoles = [] } = useQuery<JobRoleOption[]>({
    queryKey: ['rh-job-roles-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('job_roles').select('id, title, is_active').order('title')
      if (error) throw error
      return (data || []) as JobRoleOption[]
    },
    staleTime: 30 * 1000,
  })

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('form_fields').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-form-fields'] }),
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const existingKeys = new Set(fields.map((f) => f.field_key))
      let key = slugify(createForm.label)
      let suffix = 2
      while (existingKeys.has(key)) { key = `${slugify(createForm.label)}_${suffix}`; suffix++ }

      const { data, error } = await supabase.from('form_fields').insert({
        field_key: key,
        label: createForm.label.trim(),
        field_type: createForm.field_type,
        sort_order: fields.length,
      }).select().single()
      if (error) throw error
      return data as FieldRow
    },
    onSuccess: (newField) => {
      queryClient.invalidateQueries({ queryKey: ['rh-form-fields'] })
      toast.success('Campo criado')
      setExpandedId(newField.id)
      closeCreate()
    },
    onError: (err) => toast.error(`Erro ao criar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('form_fields').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-form-fields'] })
      toast.success('Campo apagado')
      setDeleteConfirm(null)
    },
    onError: (err) => toast.error(`Erro ao apagar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const { error } = await supabase.rpc('admin_update_form_field_sort_orders', { updates })
      if (error) throw error
    },
    onError: (err) => {
      toast.error(`Erro ao reordenar: ${err instanceof Error ? err.message : 'desconhecido'}`)
      queryClient.invalidateQueries({ queryKey: ['rh-form-fields'] })
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    const reordered = arrayMove(fields, oldIndex, newIndex)
    queryClient.setQueryData(['rh-form-fields'], reordered)
    reorderMutation.mutate(reordered.map((f, i) => ({ id: f.id, sort_order: i })))
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateForm(EMPTY_CREATE_FORM)
  }

  function handleCreate() {
    if (!createForm.label.trim()) { toast.error('Informe a label do campo'); return }
    createMutation.mutate()
  }

  return (
    <AdminLayout>
      <AdminPage
        title="Formulário de candidatura"
        description="Clique em uma pergunta pra editar — é a visão exata de como o candidato vê o formulário"
        width="narrow"
        actions={
          <>
            <StyledSelect
              variant="inline"
              value={effectivePreviewSlug}
              onChange={setPreviewStoreSlug}
              options={stores.map((s) => ({ value: s.slug, label: s.name }))}
            />
            <Button variant="secondary" asChild>
              <a
                href={effectivePreviewSlug ? `/candidatura/${effectivePreviewSlug}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={!effectivePreviewSlug ? 'pointer-events-none opacity-50' : undefined}
                title="Abrir formulário público em nova aba"
                aria-label="Abrir formulário"
              >
                <ExternalLink />
                <span className="hidden sm:inline">Abrir formulário</span>
              </a>
            </Button>
            <Button onClick={() => setCreateOpen(true)} aria-label="Nova pergunta">
              <Plus />
              <span className="hidden sm:inline">Nova pergunta</span>
            </Button>
          </>
        }
      >
        {isLoading ? (
          <PageLoading label="Carregando formulário…" />
        ) : fields.length === 0 ? (
          <Panel>
            <EmptyState
              icon={FileText}
              title="Nenhuma pergunta no formulário"
              description="Adicione a primeira pergunta do formulário de candidatura."
              action={<Button onClick={() => setCreateOpen(true)}><Plus />Nova pergunta</Button>}
            />
          </Panel>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {fields.map((field) => (
                  <BuildFieldCard
                    key={field.id}
                    field={field}
                    expanded={expandedId === field.id}
                    onToggleExpand={() => setExpandedId((prev) => (prev === field.id ? null : field.id))}
                    onDelete={setDeleteConfirm}
                    onFieldUpdate={(id, patch) => updateField.mutate({ id, patch })}
                    onToggleRequired={(f) => updateField.mutate({ id: f.id, patch: { required: !f.required } })}
                    onToggleCard={(f) => updateField.mutate({ id: f.id, patch: { show_on_card: !f.show_on_card } })}
                    jobRoles={jobRoles}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </AdminPage>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={closeCreate} />
          <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-4">Nova pergunta</h2>

            <div className="space-y-4">
              <div>
                <label className="field-label">Tipo *</label>
                <StyledSelect
                  value={createForm.field_type}
                  onChange={(v) => setCreateForm({ ...createForm, field_type: v as FieldType })}
                  options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                  searchable={false}
                />
              </div>

              <div>
                <label className="field-label">Label *</label>
                <Input
                  type="text"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                  placeholder="Ex: Foto"
                />
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  Nome curto — a pergunta, texto de apoio e opções você configura depois, clicando no card.
                  {createForm.label.trim() && <> Identificador interno: <span className="font-mono">{slugify(createForm.label)}</span></>}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={closeCreate}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando…' : 'Criar pergunta'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Apagar pergunta?</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              "{deleteConfirm.label}" será removida do formulário. Respostas já enviadas por candidatos pra essa pergunta também serão apagadas.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Apagando…' : 'Apagar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
