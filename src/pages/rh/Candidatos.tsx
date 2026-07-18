import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader, Plus, User, Phone, FileText, Image as ImageIcon, X, Paperclip,
  Store as StoreIcon, Settings, AlertTriangle,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useFileUpload } from '@/hooks/useFileUpload'
import AdminLayout from '@/components/admin/AdminLayout'

type Stage =
  | 'pendente' | 'conversa_iniciada' | 'entrevista_marcada' | 'no_show'
  | 'decisao_necessaria' | 'selecionado' | 'em_formacao' | 'em_contratacao'
  | 'contratado' | 'concluido_arquivado'
  | 'descartado' | 'banco_de_talentos' | 'sem_contratacao'

interface Store { id: string; name: string }
interface JobOpening { id: string; role_title: string; status: 'aberta' | 'fechada'; stores: { name: string } | null }
interface CandidateAnswer {
  value: string
  form_fields: { field_key: string; label: string; field_type: string; show_on_card: boolean } | null
}
interface CandidateTag { tags: { id: string; name: string; color: string } | null }
interface ActivityRow {
  id: string
  event_type: string
  previous_stage: string | null
  new_stage: string | null
  automation_id: string | null
  metadata: Record<string, unknown>
  changed_at: string
}
interface Candidate {
  id: string
  job_opening_id: string
  name: string
  age: number | null
  whatsapp: string
  stage: Stage
  source: 'formulario' | 'manual'
  photo_url: string | null
  resume_url: string | null
  notes: string | null
  due_date: string | null
  assignee_id: string | null
  created_at: string
  stage_started_at: string
  job_openings: { id: string; role_title: string; status: string } | null
  candidate_answers: CandidateAnswer[]
  candidate_tags: CandidateTag[]
}

function getAnswerValue(c: Candidate, fieldKey: string): string | undefined {
  return c.candidate_answers.find((a) => a.form_fields?.field_key === fieldKey)?.value
}

// Prazo interno (não é campo de formulário): quantos dias em atraso o
// candidato está na etapa atual, dado o limite configurado pra essa etapa em
// stage_sla_days. stage_started_at é mantido pelo trigger do banco — atualiza
// sozinho toda vez que a etapa muda.
function daysOverdue(candidate: Candidate, slaDays: number | undefined): number {
  if (!slaDays) return 0
  const deadline = new Date(candidate.stage_started_at).getTime() + slaDays * 24 * 60 * 60 * 1000
  const diffMs = Date.now() - deadline
  return diffMs > 0 ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0
}

const STAGE_LABEL_BY_VALUE: Record<string, string> = {
  pendente: 'Pendente', conversa_iniciada: 'Conversa Iniciada', entrevista_marcada: 'Entrevista Marcada',
  no_show: 'No-show', decisao_necessaria: 'Decisão Necessária', selecionado: 'Selecionado',
  em_formacao: 'Em Formação', em_contratacao: 'Em Contratação', contratado: 'Contratado',
  concluido_arquivado: 'Arquivado', descartado: 'Descartado', banco_de_talentos: 'Banco de Talentos',
  sem_contratacao: 'Sem Contratação',
}

// Descrição curta de uma linha de candidate_stage_history — agora um log de
// atividade genérico (Fase 3 do motor de automações), não só mudança de etapa.
function describeActivity(row: { event_type: string; previous_stage: string | null; new_stage: string | null; metadata: Record<string, unknown> }): string {
  const m = row.metadata || {}
  switch (row.event_type) {
    case 'stage_change':
      return row.previous_stage
        ? `Mudou de "${STAGE_LABEL_BY_VALUE[row.previous_stage] || row.previous_stage}" para "${STAGE_LABEL_BY_VALUE[row.new_stage || ''] || row.new_stage}"`
        : 'Candidatura criada'
    case 'tag_added': return `Tag adicionada: ${m.tag_name || '—'}`
    case 'tag_removed': return `Tag removida: ${m.tag_name || '—'}`
    case 'due_date_changed': return m.new_due_date ? `Prazo alterado para ${new Date(String(m.new_due_date) + 'T00:00:00').toLocaleDateString('pt-BR')}` : 'Prazo removido'
    case 'assignee_changed': return m.new_assignee_id ? 'Responsável alterado' : 'Responsável removido'
    case 'whatsapp_sent': return m.success ? 'WhatsApp enviado' : `Falha ao enviar WhatsApp${m.error ? `: ${m.error}` : ''}`
    case 'comment_added': return String(m.text || '')
    case 'automation_error': return `Erro na automação${m.action_type ? ` (${m.action_type})` : ''}${m.error ? `: ${m.error}` : ''}`
    default: return row.event_type
  }
}

function formatAnswerValue(a: CandidateAnswer): string {
  if (a.form_fields?.field_type === 'data' && a.value) {
    const [y, m, d] = a.value.split('-')
    if (y && m && d) return `${d}/${m}/${y}`
  }
  if (a.form_fields?.field_type === 'checkbox') {
    return a.value.split('; ').join(', ')
  }
  return a.value
}

// Ordem de exibição das colunas — pedida explicitamente pelo usuário, com as
// saídas intercaladas no fluxo (não mais agrupadas à parte). Continuam
// aceitando drop vindo de qualquer coluna, sem transição restrita.
const ALL_COLUMNS: { stage: Stage; label: string }[] = [
  { stage: 'pendente', label: 'Pendente' },
  { stage: 'conversa_iniciada', label: 'Conversa Iniciada' },
  { stage: 'entrevista_marcada', label: 'Entrevista Marcada' },
  { stage: 'no_show', label: 'No-show' },
  { stage: 'decisao_necessaria', label: 'Decisão Necessária' },
  { stage: 'selecionado', label: 'Selecionado' },
  { stage: 'descartado', label: 'Descartado' },
  { stage: 'em_formacao', label: 'Em Formação' },
  { stage: 'em_contratacao', label: 'Em Contratação' },
  { stage: 'banco_de_talentos', label: 'Banco de Talentos' },
  { stage: 'sem_contratacao', label: 'Sem Contratação' },
  { stage: 'contratado', label: 'Contratado' },
  { stage: 'concluido_arquivado', label: 'Arquivado' },
]

const EMPTY_CREATE_FORM = { job_opening_id: '', name: '', age: '', whatsapp: '' }

// Uma cor própria por etapa (não por grupo) — mas seguindo uma progressão:
// tons frios/neutros no início do funil, amarelo/laranja nos pontos de
// atenção (no-show, decisão necessária), rampa de verde ganhando força
// conforme aproxima do sucesso, cinza-quente no arquivamento neutro, e a
// família vermelho/rosa/violeta nas 3 saídas (cada uma com tom distinto).
const STAGE_COLORS: Record<Stage, { accent: string; bg: string }> = {
  pendente: { accent: '#64748B', bg: '#F1F5F9' },
  conversa_iniciada: { accent: '#2563EB', bg: '#DBEAFE' },
  entrevista_marcada: { accent: '#0284C7', bg: '#E0F2FE' },
  no_show: { accent: '#D97706', bg: '#FEF3C7' },
  decisao_necessaria: { accent: '#EA580C', bg: '#FFEDD5' },
  selecionado: { accent: '#65A30D', bg: '#ECFCCB' },
  em_formacao: { accent: '#16A34A', bg: '#DCFCE7' },
  em_contratacao: { accent: '#059669', bg: '#D1FAE5' },
  contratado: { accent: '#0D9488', bg: '#CCFBF1' },
  concluido_arquivado: { accent: '#78716C', bg: '#F5F5F4' },
  descartado: { accent: '#DC2626', bg: '#FEE2E2' },
  banco_de_talentos: { accent: '#7C3AED', bg: '#EDE9FE' },
  sem_contratacao: { accent: '#DB2777', bg: '#FCE7F3' },
}

function getStageColors(stage: Stage) {
  return STAGE_COLORS[stage]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function attachmentCount(c: Candidate) {
  return (c.photo_url ? 1 : 0) + (c.resume_url ? 1 : 0)
}

function isDueDateOverdue(c: Candidate) {
  if (!c.due_date) return false
  return new Date(c.due_date + 'T00:00:00') < new Date(new Date().toDateString())
}

function CandidatePhoto({ candidate }: { candidate: Pick<Candidate, 'photo_url' | 'name'> }) {
  return (
    <div className="h-[120px] w-full bg-slate-100 shrink-0">
      {candidate.photo_url ? (
        <img src={candidate.photo_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-lg font-bold text-slate-400">{initials(candidate.name)}</span>
        </div>
      )}
    </div>
  )
}

function CandidateCard({
  candidate, onOpen, slaDays, assigneeName,
}: {
  candidate: Candidate
  onOpen: (c: Candidate) => void
  slaDays: number | undefined
  assigneeName: string | undefined
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: candidate.id })
  const { accent } = getStageColors(candidate.stage)
  const overdue = daysOverdue(candidate, slaDays)
  const dueOverdue = isDueDateOverdue(candidate)
  const style = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : null),
    borderLeftColor: accent,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onOpen(candidate)}
      className={`relative bg-white rounded-lg border border-border/60 border-l-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {overdue > 0 && (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold shadow" title={`${overdue} dia(s) além do prazo desta etapa`}>
          <AlertTriangle className="w-2.5 h-2.5" /> {overdue}d
        </div>
      )}
      <CandidatePhoto candidate={candidate} />
      <div className="p-2.5 space-y-1.5">
        <p className="text-[13px] font-semibold text-foreground truncate">{candidate.name}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#CCFBF1] text-[#0D9488] truncate max-w-full">
            {candidate.job_openings?.role_title || 'Vaga removida'}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            candidate.source === 'manual' ? 'bg-slate-100 text-slate-600' : 'bg-[#EDE9FE] text-[#7C3AED]'
          }`}>
            {candidate.source === 'manual' ? 'Manual' : 'Formulário'}
          </span>
        </div>
        {candidate.candidate_answers.some((a) => a.form_fields?.show_on_card) && (
          <div className="flex items-center gap-1 flex-wrap">
            {candidate.candidate_answers.filter((a) => a.form_fields?.show_on_card).map((a) => (
              <span key={a.form_fields!.field_key} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-surface-alt text-muted-foreground truncate max-w-full">
                {a.form_fields!.label}: {formatAnswerValue(a)}
              </span>
            ))}
          </div>
        )}
        {candidate.candidate_tags.some((ct) => ct.tags) && (
          <div className="flex items-center gap-1 flex-wrap">
            {candidate.candidate_tags.filter((ct) => ct.tags).map((ct) => (
              <span
                key={ct.tags!.id}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full truncate max-w-full"
                style={{ backgroundColor: `${ct.tags!.color}22`, color: ct.tags!.color }}
              >
                {ct.tags!.name}
              </span>
            ))}
          </div>
        )}
        {(assigneeName || candidate.due_date || attachmentCount(candidate) > 0) && (
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {assigneeName && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 truncate max-w-full" title={assigneeName}>
                  {assigneeName}
                </span>
              )}
              {candidate.due_date && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${dueOverdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                  {new Date(candidate.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            {attachmentCount(candidate) > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 flex items-center gap-0.5 shrink-0">
                <Paperclip className="w-2.5 h-2.5" /> {attachmentCount(candidate)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StageColumn({
  stage, label, candidates, onOpen, onAddClick, addDisabled, slaDays, assigneeNames,
}: {
  stage: Stage
  label: string
  candidates: Candidate[]
  onOpen: (c: Candidate) => void
  onAddClick: () => void
  addDisabled: boolean
  slaDays: number | undefined
  assigneeNames: Map<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const { accent, bg } = getStageColors(stage)
  return (
    <section className="w-56 shrink-0 space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <h2 className="text-[11px] font-bold uppercase tracking-wide truncate text-muted-foreground">
          {label}
        </h2>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-alt text-muted-foreground shrink-0">
          {candidates.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        style={{ backgroundColor: bg, borderColor: isOver ? accent : undefined }}
        className={`space-y-2 min-h-[80px] rounded-2xl border p-1.5 transition-colors ${isOver ? '' : 'border-dashed border-border/70'}`}
      >
        {candidates.map((c) => (
          <CandidateCard
            key={c.id} candidate={c} onOpen={onOpen} slaDays={slaDays}
            assigneeName={c.assignee_id ? assigneeNames.get(c.assignee_id) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={onAddClick}
          disabled={addDisabled}
          title={addDisabled ? 'Cadastre uma vaga nesta unidade primeiro' : undefined}
          className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-border/70 text-[11px] font-medium text-muted-foreground hover:border-border hover:bg-surface-alt transition-colors disabled:opacity-40 disabled:hover:border-border/70 disabled:hover:bg-transparent"
        >
          <Plus className="w-3 h-3" /> Cadastrar candidato
        </button>
      </div>
    </section>
  )
}

export default function RhCandidatos() {
  const queryClient = useQueryClient()
  const [storeId, setStoreId] = useState<string>('')
  const [activeCandidate, setActiveCandidate] = useState<Candidate | null>(null)
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [slaConfigOpen, setSlaConfigOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [createPhotoFile, setCreatePhotoFile] = useState<File | null>(null)
  const [createResumeFile, setCreateResumeFile] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)
  const detailPhotoInputRef = useRef<HTMLInputElement>(null)
  const detailResumeInputRef = useRef<HTMLInputElement>(null)

  const { upload: uploadPhoto, uploading: uploadingPhoto } = useImageUpload()
  const { upload: uploadResume, uploading: uploadingResume } = useFileUpload()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['rh-stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as Store[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // storeId === '' é a view "Todas as unidades" — default de abertura da
  // tela, sem auto-selecionar a primeira loja.
  const { data: jobOpenings = [] } = useQuery<JobOpening[]>({
    queryKey: ['rh-job-openings-by-store', storeId],
    queryFn: async () => {
      let query = supabase.from('job_openings').select('id, role_title, status, stores(name)').order('role_title')
      if (storeId) query = query.eq('store_id', storeId)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as JobOpening[]
    },
    staleTime: 30 * 1000,
  })

  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ['rh-candidates', storeId],
    queryFn: async () => {
      let query = supabase
        .from('candidates')
        .select('id, job_opening_id, name, age, whatsapp, stage, source, photo_url, resume_url, notes, due_date, assignee_id, created_at, stage_started_at, job_openings!inner(id, role_title, status, store_id), candidate_answers(value, form_fields(field_key, label, field_type, show_on_card)), candidate_tags(tags(id, name, color))')
        .order('created_at', { ascending: false })
      if (storeId) query = query.eq('job_openings.store_id', storeId)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Candidate[]
    },
    staleTime: 15 * 1000,
  })

  const { data: slaRows = [] } = useQuery<{ stage: Stage; days: number }[]>({
    queryKey: ['rh-stage-sla-days'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stage_sla_days').select('stage, days')
      if (error) throw error
      return (data || []) as { stage: Stage; days: number }[]
    },
    staleTime: 60 * 1000,
  })

  const slaMap = useMemo(() => new Map(slaRows.map((r) => [r.stage, r.days])), [slaRows])

  const { data: systemUsers = [] } = useQuery<{ id: string; full_name: string | null; email: string }[]>({
    queryKey: ['rh-system-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_system_users')
      if (error) throw error
      return (data || []) as { id: string; full_name: string | null; email: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })
  const assigneeNames = useMemo(() => new Map(systemUsers.map((u) => [u.id, u.full_name || u.email])), [systemUsers])

  const { data: rhTags = [] } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ['rh-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('id, name, color').order('name')
      if (error) throw error
      return (data || []) as { id: string; name: string; color: string }[]
    },
    staleTime: 30 * 1000,
  })

  const { data: activity = [] } = useQuery<ActivityRow[]>({
    queryKey: ['rh-candidate-activity', detailCandidate?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_stage_history')
        .select('id, event_type, previous_stage, new_stage, automation_id, metadata, changed_at')
        .eq('candidate_id', detailCandidate!.id)
        .order('changed_at', { ascending: false })
      if (error) throw error
      return (data || []) as ActivityRow[]
    },
    enabled: !!detailCandidate,
  })

  const candidatesByStage = useMemo(() => {
    const map = new Map<Stage, Candidate[]>()
    ALL_COLUMNS.forEach((col) => map.set(col.stage, []))
    candidates.forEach((c) => map.get(c.stage)?.push(c))
    return map
  }, [candidates])

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await supabase.from('candidates').update({ stage }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['rh-candidates', storeId] })
      const previous = queryClient.getQueryData<Candidate[]>(['rh-candidates', storeId])
      queryClient.setQueryData<Candidate[]>(['rh-candidates', storeId], (old) =>
        (old || []).map((c) => (c.id === id ? { ...c, stage } : c))
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rh-candidates', storeId], context.previous)
      toast.error(`Erro ao mover candidato: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] }),
  })

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from('candidates').update({ notes: notes.trim() || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      toast.success('Observações salvas')
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateDueDate = useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string }) => {
      const { error } = await supabase.from('candidates').update({ due_date: dueDate || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      toast.success('Prazo salvo')
    },
    onError: (err) => toast.error(`Erro ao salvar prazo: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateAssignee = useMutation({
    mutationFn: async ({ id, assigneeId }: { id: string; assigneeId: string }) => {
      const { error } = await supabase.from('candidates').update({ assignee_id: assigneeId || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      toast.success('Responsável salvo')
    },
    onError: (err) => toast.error(`Erro ao salvar responsável: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const toggleTag = useMutation({
    mutationFn: async ({ candidateId, tagId, checked }: { candidateId: string; tagId: string; checked: boolean }) => {
      if (checked) {
        const { error } = await supabase.from('candidate_tags').insert({ candidate_id: candidateId, tag_id: tagId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('candidate_tags').delete().eq('candidate_id', candidateId).eq('tag_id', tagId)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] }),
    onError: (err) => toast.error(`Erro ao atualizar tag: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateSlaDays = useMutation({
    mutationFn: async ({ stage, days }: { stage: Stage; days: number }) => {
      const { error } = await supabase.from('stage_sla_days').update({ days }).eq('stage', stage)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-stage-sla-days'] })
      toast.success('Prazo atualizado')
    },
    onError: (err) => toast.error(`Erro ao salvar prazo: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateAttachment = useMutation({
    mutationFn: async ({ id, field, url }: { id: string; field: 'photo_url' | 'resume_url'; url: string | null }) => {
      const { error } = await supabase.from('candidates').update({ [field]: url }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      setDetailCandidate((prev) => (prev ? { ...prev, [vars.field]: vars.url } : prev))
      if (vars.url === null) {
        toast.success(vars.field === 'photo_url' ? 'Foto removida' : 'Currículo removido')
      } else {
        toast.success(vars.field === 'photo_url' ? 'Foto atualizada' : 'Currículo atualizado')
      }
    },
    onError: (err) => toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const createCandidate = useMutation({
    mutationFn: async () => {
      let photo_url: string | null = null
      let resume_url: string | null = null
      if (createPhotoFile) photo_url = await uploadPhoto(createPhotoFile, 'candidates/photos')
      if (createResumeFile) resume_url = await uploadResume(createResumeFile, 'candidates/resumes')

      const { error } = await supabase.from('candidates').insert({
        job_opening_id: createForm.job_opening_id,
        name: createForm.name.trim(),
        age: parseInt(createForm.age, 10),
        whatsapp: createForm.whatsapp.replace(/\D/g, ''),
        source: 'manual',
        photo_url,
        resume_url,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      toast.success('Candidato cadastrado')
      closeCreate()
    },
    onError: (err) => toast.error(`Erro ao cadastrar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function openCreate() {
    setCreateForm({ ...EMPTY_CREATE_FORM, job_opening_id: jobOpenings[0]?.id ?? '' })
    setCreatePhotoFile(null)
    setCreateResumeFile(null)
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateForm(EMPTY_CREATE_FORM)
    setCreatePhotoFile(null)
    setCreateResumeFile(null)
  }

  function handleCreateSave() {
    if (!createForm.job_opening_id) { toast.error('Selecione a vaga'); return }
    if (!createForm.name.trim()) { toast.error('Informe o nome'); return }
    const age = parseInt(createForm.age, 10)
    if (isNaN(age) || age <= 0) { toast.error('Idade inválida'); return }
    if (!createForm.whatsapp.trim()) { toast.error('Informe o WhatsApp'); return }
    createCandidate.mutate()
  }

  function openDetail(c: Candidate) {
    setDetailCandidate(c)
    setNotesDraft(c.notes || '')
    setDueDateDraft(c.due_date || '')
    setAssigneeDraft(c.assignee_id || '')
  }

  function closeDetail() {
    setDetailCandidate(null)
    setNotesDraft('')
    setDueDateDraft('')
    setAssigneeDraft('')
  }

  function handleDragStart(event: DragStartEvent) {
    const c = candidates.find((cand) => cand.id === event.active.id)
    setActiveCandidate(c || null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCandidate(null)
    const { active, over } = event
    if (!over) return
    const newStage = over.id as Stage
    const candidate = candidates.find((c) => c.id === active.id)
    if (!candidate || candidate.stage === newStage) return
    updateStage.mutate({ id: candidate.id, stage: newStage })
  }

  async function handleDetailPhotoChange(file: File) {
    if (!detailCandidate) return
    try {
      const url = await uploadPhoto(file, 'candidates/photos')
      updateAttachment.mutate({ id: detailCandidate.id, field: 'photo_url', url })
    } catch (err) {
      toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  async function handleDetailResumeChange(file: File) {
    if (!detailCandidate) return
    try {
      const url = await uploadResume(file, 'candidates/resumes')
      updateAttachment.mutate({ id: detailCandidate.id, field: 'resume_url', url })
    } catch (err) {
      toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Candidatos</h1>
            <p className="text-sm text-muted-foreground mt-1">Kanban do processo seletivo por unidade</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background">
              <StoreIcon className="w-4 h-4 text-muted-foreground" />
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="bg-transparent text-sm font-medium text-foreground focus:outline-none"
              >
                <option value="">Todas as unidades</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setSlaConfigOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt transition-colors"
              title="Configurar prazo (em dias) de cada etapa"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Prazos</span>
            </button>
            <button
              onClick={openCreate}
              disabled={jobOpenings.length === 0}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors disabled:opacity-50"
              title={jobOpenings.length === 0 ? 'Cadastre uma vaga primeiro' : undefined}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Cadastrar candidato</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando candidatos...</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {ALL_COLUMNS.map((col) => (
                <StageColumn
                  key={col.stage}
                  stage={col.stage}
                  label={col.label}
                  candidates={candidatesByStage.get(col.stage) || []}
                  onOpen={openDetail}
                  onAddClick={openCreate}
                  addDisabled={jobOpenings.length === 0}
                  slaDays={slaMap.get(col.stage)}
                  assigneeNames={assigneeNames}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCandidate ? (
                <div
                  className="bg-white rounded-lg border border-border/60 border-l-4 shadow-lg overflow-hidden w-56"
                  style={{ borderLeftColor: getStageColors(activeCandidate.stage).accent }}
                >
                  <CandidatePhoto candidate={activeCandidate} />
                  <div className="p-2.5">
                    <p className="text-[13px] font-semibold text-foreground truncate">{activeCandidate.name}</p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Modal: cadastro manual */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-foreground">Cadastrar candidato</h2>
              <button onClick={closeCreate} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Vaga *</label>
                <select
                  value={createForm.job_opening_id}
                  onChange={(e) => setCreateForm({ ...createForm, job_opening_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {jobOpenings.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.role_title}{!storeId && j.stores?.name ? ` — ${j.stores.name}` : ''}{j.status === 'fechada' ? ' (fechada)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Idade *</label>
                  <input
                    type="number"
                    min={1}
                    value={createForm.age}
                    onChange={(e) => setCreateForm({ ...createForm, age: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">WhatsApp *</label>
                  <input
                    type="text"
                    value={createForm.whatsapp}
                    onChange={(e) => setCreateForm({ ...createForm, whatsapp: e.target.value })}
                    placeholder="(27) 99999-9999"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Foto</label>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => setCreatePhotoFile(e.target.files?.[0] ?? null)} />
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt">
                    <ImageIcon className="w-4 h-4" /> {createPhotoFile ? createPhotoFile.name.slice(0, 14) : 'Selecionar'}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Currículo</label>
                  <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={(e) => setCreateResumeFile(e.target.files?.[0] ?? null)} />
                  <button type="button" onClick={() => resumeInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt">
                    <FileText className="w-4 h-4" /> {createResumeFile ? createResumeFile.name.slice(0, 14) : 'Selecionar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateSave}
                disabled={createCandidate.isPending || uploadingPhoto || uploadingResume}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
              >
                {createCandidate.isPending || uploadingPhoto || uploadingResume ? 'Salvando...' : 'Cadastrar'}
              </button>
              <button onClick={closeCreate} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalhe do candidato */}
      {detailCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeDetail} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-surface-alt border border-border flex items-center justify-center">
                  {detailCandidate.photo_url ? (
                    <img src={detailCandidate.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{detailCandidate.name}</h2>
                  <p className="text-xs text-muted-foreground">{detailCandidate.job_openings?.role_title}</p>
                </div>
              </div>
              <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">Idade</p>
                  <p className="text-foreground">
                    {(() => {
                      const age = detailCandidate.age ?? getAnswerValue(detailCandidate, 'idade')
                      return age ? `${age} anos` : '—'
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">WhatsApp</p>
                  <p className="text-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {detailCandidate.whatsapp}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Etapa</label>
                <select
                  value={detailCandidate.stage}
                  onChange={(e) => {
                    const stage = e.target.value as Stage
                    updateStage.mutate({ id: detailCandidate.id, stage })
                    setDetailCandidate({ ...detailCandidate, stage })
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ALL_COLUMNS.map((col) => (
                    <option key={col.stage} value={col.stage}>{col.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">Alternativa ao arrastar no kanban — útil no mobile.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Foto</p>
                  <input ref={detailPhotoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDetailPhotoChange(f) }} />
                  {detailCandidate.photo_url ? (
                    <div className="flex items-center gap-1.5">
                      <a href={detailCandidate.photo_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-surface-alt min-w-0">
                        <ImageIcon className="w-4 h-4 shrink-0" /> <span className="truncate">Ver foto</span>
                      </a>
                      <button type="button" onClick={() => updateAttachment.mutate({ id: detailCandidate.id, field: 'photo_url', url: null })}
                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                        title="Remover foto e escolher outra">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => detailPhotoInputRef.current?.click()} disabled={uploadingPhoto}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt disabled:opacity-60">
                      <ImageIcon className="w-4 h-4" /> {uploadingPhoto ? 'Enviando...' : 'Adicionar foto'}
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Currículo</p>
                  <input ref={detailResumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDetailResumeChange(f) }} />
                  {detailCandidate.resume_url ? (
                    <div className="flex items-center gap-1.5">
                      <a href={detailCandidate.resume_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-surface-alt min-w-0">
                        <FileText className="w-4 h-4 shrink-0" /> <span className="truncate">Ver currículo</span>
                      </a>
                      <button type="button" onClick={() => updateAttachment.mutate({ id: detailCandidate.id, field: 'resume_url', url: null })}
                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                        title="Remover currículo e escolher outro">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => detailResumeInputRef.current?.click()} disabled={uploadingResume}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt disabled:opacity-60">
                      <FileText className="w-4 h-4" /> {uploadingResume ? 'Enviando...' : 'Adicionar currículo'}
                    </button>
                  )}
                </div>
              </div>

              {detailCandidate.candidate_answers.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-1.5">Respostas do formulário</p>
                  <div className="space-y-1.5 text-sm bg-surface-alt rounded-lg p-3">
                    {detailCandidate.candidate_answers.map((a) => (
                      <div key={a.form_fields?.field_key || a.value} className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">{a.form_fields?.label || '—'}</span>
                        {a.form_fields?.field_type === 'upload_imagem' || a.form_fields?.field_type === 'upload_arquivo' ? (
                          <a href={a.value} target="_blank" rel="noopener noreferrer" className="text-right text-blue-600 hover:underline truncate">
                            Ver arquivo
                          </a>
                        ) : (
                          <span className="text-foreground text-right truncate">{formatAnswerValue(a)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Prazo (due date)</label>
                  <input
                    type="date"
                    value={dueDateDraft}
                    onChange={(e) => setDueDateDraft(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => updateDueDate.mutate({ id: detailCandidate.id, dueDate: dueDateDraft })}
                    disabled={updateDueDate.isPending}
                    className="mt-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-alt disabled:opacity-70"
                  >
                    {updateDueDate.isPending ? 'Salvando...' : 'Salvar prazo'}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Responsável</label>
                  <select
                    value={assigneeDraft}
                    onChange={(e) => setAssigneeDraft(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Sem responsável</option>
                    {systemUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => updateAssignee.mutate({ id: detailCandidate.id, assigneeId: assigneeDraft })}
                    disabled={updateAssignee.isPending}
                    className="mt-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-alt disabled:opacity-70"
                  >
                    {updateAssignee.isPending ? 'Salvando...' : 'Salvar responsável'}
                  </button>
                </div>
              </div>

              {rhTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {rhTags.map((t) => {
                      const checked = detailCandidate.candidate_tags.some((ct) => ct.tags?.id === t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag.mutate({ candidateId: detailCandidate.id, tagId: t.id, checked: !checked })}
                          className="text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors"
                          style={checked
                            ? { backgroundColor: `${t.color}22`, color: t.color, borderColor: t.color }
                            : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Atividade</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto bg-surface-alt rounded-lg p-3">
                  {activity.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem atividade registrada.</p>
                  ) : (
                    activity.map((row) => (
                      <div key={row.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="text-foreground">
                          {describeActivity(row)}
                          {row.automation_id && <span className="ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-100 text-violet-700">automação</span>}
                        </span>
                        <span className="text-muted-foreground shrink-0">{new Date(row.changed_at).toLocaleString('pt-BR')}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Observações</label>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Anotações sobre a entrevista, observações gerais..."
                />
                <button
                  onClick={() => updateNotes.mutate({ id: detailCandidate.id, notes: notesDraft })}
                  disabled={updateNotes.isPending}
                  className="mt-2 px-4 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-70"
                >
                  {updateNotes.isPending ? 'Salvando...' : 'Salvar observações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: prazo (dias) por etapa — controle interno, não é campo do formulário */}
      {slaConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setSlaConfigOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-foreground">Prazos por etapa</h2>
              <button onClick={() => setSlaConfigOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Quantos dias o operador tem pra avaliar o candidato em cada etapa antes de contar como atrasado no card. Conta a partir de quando o candidato entrou na etapa atual.
            </p>
            <div className="space-y-1.5">
              {ALL_COLUMNS.map((col) => (
                <div key={col.stage} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getStageColors(col.stage).accent }} />
                    <span className="text-sm text-foreground truncate">{col.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      defaultValue={slaMap.get(col.stage) ?? 3}
                      onBlur={(e) => {
                        const days = parseInt(e.target.value, 10)
                        if (!isNaN(days) && days > 0 && days !== slaMap.get(col.stage)) {
                          updateSlaDays.mutate({ stage: col.stage, days })
                        }
                      }}
                      className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground">dias</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
