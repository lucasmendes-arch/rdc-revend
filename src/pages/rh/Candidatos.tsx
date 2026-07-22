import { useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader, Plus, User, Phone, FileText, Image as ImageIcon, X, Paperclip,
  Store as StoreIcon, Zap, AlertTriangle, SlidersHorizontal, Calendar, Tag,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useFileUpload } from '@/hooks/useFileUpload'
import AdminLayout from '@/components/admin/AdminLayout'
import ColorSelect, { type ColorSelectOption } from '@/components/rh/ColorSelect'
import StyledSelect from '@/components/ui/styled-select'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPE_OPTIONS, type EmploymentType } from '@/lib/dpConstants'
import { useAdminTheme } from '@/contexts/AdminThemeContext'

type Stage =
  | 'pendente' | 'conversa_iniciada' | 'entrevista_marcada' | 'no_show'
  | 'decisao_necessaria' | 'selecionado' | 'em_formacao' | 'em_contratacao'
  | 'contratado' | 'concluido_arquivado'
  | 'descartado' | 'banco_de_talentos' | 'sem_contratacao'

interface Store { id: string; name: string }
// Cor da vaga vem do cargo vinculado (job_roles.color) — vaga manual sem
// cargo (job_role_id null) cai no default, mesmo valor default da coluna.
const DEFAULT_VAGA_COLOR = '#0D9488'
interface JobOpening {
  id: string
  role_title: string
  status: 'aberta' | 'fechada'
  stores: { name: string } | null
  job_roles: { color: string } | null
}
interface CandidateAnswer {
  value: string
  form_fields: { field_key: string; label: string; field_type: string; show_on_card: boolean } | null
}
interface CandidateTag { tags: { id: string; name: string; color: string } | null }
interface SystemUser { id: string; full_name: string | null; email: string; role: string; permissions: { can_manage_rh?: boolean } | null }
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
  start_date: string | null
  due_date: string | null
  assignee_id: string | null
  created_at: string
  stage_started_at: string
  job_openings: { id: string; role_title: string; status: string; job_roles: { color: string } | null } | null
  candidate_answers: CandidateAnswer[]
  candidate_tags: CandidateTag[]
}

function getAnswerValue(c: Candidate, fieldKey: string): string | undefined {
  return c.candidate_answers.find((a) => a.form_fields?.field_key === fieldKey)?.value
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

// Preferência de exibição dos elementos "built-in" do card — puramente
// visual (não é dado de negócio), então fica em localStorage, por
// navegador/usuário, igual a uma preferência de view. Campos personalizados
// do formulário continuam controlados por form_fields.show_on_card (banco).
const CARD_PREFS_STORAGE_KEY = 'rdc-rh-candidatos-card-prefs'
interface CardFieldPrefs { responsavel: boolean; dataFim: boolean; anexos: boolean; tags: boolean }
const DEFAULT_CARD_PREFS: CardFieldPrefs = { responsavel: true, dataFim: true, anexos: true, tags: true }
const CARD_PREF_LABELS: [keyof CardFieldPrefs, string][] = [
  ['responsavel', 'Responsável'],
  ['dataFim', 'Data fim'],
  ['anexos', 'Anexos'],
  ['tags', 'Tags'],
]

function loadCardPrefs(): CardFieldPrefs {
  try {
    const raw = localStorage.getItem(CARD_PREFS_STORAGE_KEY)
    if (!raw) return DEFAULT_CARD_PREFS
    return { ...DEFAULT_CARD_PREFS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CARD_PREFS
  }
}

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

function fileNameFromUrl(url: string) {
  try {
    const clean = url.split('?')[0]
    const last = clean.split('/').pop() || 'arquivo'
    return decodeURIComponent(last)
  } catch {
    return 'arquivo'
  }
}

// Card de anexo estilo ClickUp: thumbnail + nome do arquivo truncado + ação
// de remover. `image` renderiza o preview real; `doc` (currículo) usa um
// tile com ícone já que não geramos thumbnail de PDF/DOC no cliente.
function AttachmentCard({ url, kind, onRemove }: { url: string; kind: 'image' | 'doc'; onRemove: () => void }) {
  const name = fileNameFromUrl(url)
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block h-20 w-full bg-surface-alt flex items-center justify-center overflow-hidden">
        {kind === 'image' ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <FileText className="w-7 h-7 text-muted-foreground" />
        )}
      </a>
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border/60">
        <span className="text-[11px] text-muted-foreground truncate flex-1" title={name}>{name}</span>
        <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 shrink-0" title="Remover e escolher outro">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function isDueDateOverdue(c: Candidate) {
  if (!c.due_date) return false
  return new Date(c.due_date + 'T00:00:00') < new Date(new Date().toDateString())
}

function relativeDateStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const QUICK_DATE_OPTIONS: { label: string; days: number }[] = [
  { label: 'Hoje', days: 0 },
  { label: 'Amanhã', days: 1 },
  { label: 'Próxima semana', days: 7 },
  { label: '2 semanas', days: 14 },
  { label: '4 semanas', days: 28 },
]

// Editor inline da Data fim, clicável direto no card do kanban — mesmo
// stopPropagation do ColorSelect compacto (card é arrastável via dnd-kit).
function QuickDatePopover({ value, onChange, overdue }: { value: string | null; onChange: (v: string | null) => void; overdue: boolean }) {
  const [open, setOpen] = useState(false)
  const stop = (e: SyntheticEvent) => e.stopPropagation()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={stop}
          onClick={stop}
          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
        >
          <Calendar className="w-2.5 h-2.5 shrink-0" />
          {value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data fim'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start" onClick={stop} onPointerDown={stop}>
        <div className="space-y-0.5 mb-2">
          {QUICK_DATE_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => { onChange(relativeDateStr(o.days)); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-surface-alt transition-colors"
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={value || ''}
          onChange={(e) => { onChange(e.target.value || null); setOpen(false) }}
          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false) }}
            className="w-full mt-1.5 text-left px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Remover data
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
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
  candidate, onOpen, assigneeName, cardPrefs, jobOpeningOptions, onJobOpeningChange, onDueDateChange,
}: {
  candidate: Candidate
  onOpen: (c: Candidate) => void
  assigneeName: string | undefined
  cardPrefs: CardFieldPrefs
  jobOpeningOptions: ColorSelectOption[]
  onJobOpeningChange: (candidateId: string, jobOpeningId: string) => void
  onDueDateChange: (candidateId: string, value: string | null) => void
}) {
  // Sem `transform` aqui: quem "voa" com o cursor é só o DragOverlay. O
  // original fica parado no lugar, só esmaecido (isDragging) — aplicar o
  // transform nos dois ao mesmo tempo duplicava o movimento e criava um
  // rastro visível quando os dois perdiam sincronia num arraste rápido.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: candidate.id })
  const { accent } = getStageColors(candidate.stage)
  const dueOverdue = isDueDateOverdue(candidate)
  const style = { borderLeftColor: accent }

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
      {dueOverdue && (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold shadow" title="Data fim já passou">
          <AlertTriangle className="w-2.5 h-2.5" /> Atrasado
        </div>
      )}
      <CandidatePhoto candidate={candidate} />
      <div className="p-2.5 space-y-1.5">
        <p className="text-[13px] font-semibold text-foreground truncate">{candidate.name}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <ColorSelect
            compact
            variant="pill"
            value={candidate.job_opening_id}
            onChange={(v) => onJobOpeningChange(candidate.id, v)}
            options={jobOpeningOptions}
            placeholder={candidate.job_openings?.role_title || 'Vaga removida'}
          />
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            candidate.source === 'manual' ? 'bg-slate-100 text-slate-600' : 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
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
        {cardPrefs.tags && candidate.candidate_tags.some((ct) => ct.tags) && (
          <div className="flex items-center gap-1 flex-wrap">
            <Tag className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
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
        {(() => {
          const showAssignee = cardPrefs.responsavel && !!assigneeName
          const showDueDate = cardPrefs.dataFim
          const showAttach = cardPrefs.anexos && attachmentCount(candidate) > 0
          if (!showAssignee && !showDueDate && !showAttach) return null
          return (
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                {showAssignee && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 truncate max-w-full" title={assigneeName}>
                    {assigneeName}
                  </span>
                )}
                {showDueDate && (
                  <QuickDatePopover
                    value={candidate.due_date}
                    onChange={(v) => onDueDateChange(candidate.id, v)}
                    overdue={dueOverdue}
                  />
                )}
              </div>
              {showAttach && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 flex items-center gap-0.5 shrink-0">
                  <Paperclip className="w-2.5 h-2.5" /> {attachmentCount(candidate)}
                </span>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function StageColumn({
  stage, label, candidates, onOpen, onAddClick, addDisabled, assigneeNames, cardPrefs,
  jobOpeningOptions, onJobOpeningChange, onDueDateChange,
}: {
  stage: Stage
  label: string
  candidates: Candidate[]
  onOpen: (c: Candidate) => void
  onAddClick: () => void
  addDisabled: boolean
  assigneeNames: Map<string, string>
  cardPrefs: CardFieldPrefs
  jobOpeningOptions: ColorSelectOption[]
  onJobOpeningChange: (candidateId: string, jobOpeningId: string) => void
  onDueDateChange: (candidateId: string, value: string | null) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const { isDark } = useAdminTheme()
  const { accent, bg } = getStageColors(stage)
  // Modo dark: os pastéis sólidos (pensados pra fundo claro) viram um bloco
  // quase branco sobre o painel escuro — troca por um tingimento translúcido
  // do próprio accent, que se funde ao fundo escuro em vez de destoar dele.
  const columnBg = isDark ? `${accent}1A` : bg
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
        style={{ backgroundColor: columnBg, borderColor: isOver ? accent : undefined }}
        className={`space-y-2 min-h-[80px] rounded-2xl border p-1.5 transition-colors ${isOver ? '' : 'border-dashed border-border/70'}`}
      >
        {candidates.map((c) => (
          <CandidateCard
            key={c.id} candidate={c} onOpen={onOpen}
            assigneeName={c.assignee_id ? assigneeNames.get(c.assignee_id) : undefined}
            cardPrefs={cardPrefs}
            jobOpeningOptions={jobOpeningOptions}
            onJobOpeningChange={onJobOpeningChange}
            onDueDateChange={onDueDateChange}
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
  const [startDateDraft, setStartDateDraft] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [jobOpeningDraft, setJobOpeningDraft] = useState('')
  const [cardPrefs, setCardPrefs] = useState<CardFieldPrefs>(loadCardPrefs)
  const [createOpen, setCreateOpen] = useState(false)
  const [promoteCandidate, setPromoteCandidate] = useState<Candidate | null>(null)
  const [promoteEmploymentType, setPromoteEmploymentType] = useState<EmploymentType>('clt')
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
      let query = supabase.from('job_openings').select('id, role_title, status, stores(name), job_roles(color)').order('role_title')
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
        .select('id, job_opening_id, name, age, whatsapp, stage, source, photo_url, resume_url, notes, start_date, due_date, assignee_id, created_at, stage_started_at, job_openings!inner(id, role_title, status, store_id, job_roles(color)), candidate_answers(value, form_fields(field_key, label, field_type, show_on_card)), candidate_tags(tags(id, name, color))')
        .order('created_at', { ascending: false })
      if (storeId) query = query.eq('job_openings.store_id', storeId)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Candidate[]
    },
    staleTime: 15 * 1000,
  })

  const { data: systemUsers = [] } = useQuery<SystemUser[]>({
    queryKey: ['rh-system-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_system_users')
      if (error) throw error
      return (data || []) as SystemUser[]
    },
    staleTime: 5 * 60 * 1000,
  })
  const assigneeNames = useMemo(() => new Map(systemUsers.map((u) => [u.id, u.full_name || u.email])), [systemUsers])
  // Responsável só pode ser alguém com acesso ao RH (admin/administrativo ou
  // permissão granular can_manage_rh) — mesma regra de has_rh_access() no
  // backend. Colaborador de loja (role=salao sem a permissão) fica de fora.
  const rhAssignableUsers = useMemo(
    () => systemUsers.filter((u) => u.role === 'admin' || u.role === 'administrativo' || u.permissions?.can_manage_rh === true),
    [systemUsers]
  )

  const { data: allJobOpenings = [] } = useQuery<JobOpening[]>({
    queryKey: ['rh-job-openings-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('job_openings').select('id, role_title, status, stores(name), job_roles(color)').order('role_title')
      if (error) throw error
      return (data || []) as unknown as JobOpening[]
    },
    staleTime: 30 * 1000,
  })
  const jobOpeningOptions = useMemo<ColorSelectOption[]>(
    () => allJobOpenings.map((j) => ({
      value: j.id,
      label: `${j.role_title}${j.stores?.name ? ` — ${j.stores.name}` : ''}${j.status === 'fechada' ? ' (fechada)' : ''}`,
      color: j.job_roles?.color || DEFAULT_VAGA_COLOR,
    })),
    [allJobOpenings]
  )

  const { data: rhTags = [] } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ['rh-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('id, name, color').order('name')
      if (error) throw error
      return (data || []) as { id: string; name: string; color: string }[]
    },
    staleTime: 30 * 1000,
  })

  // Chave própria (não 'rh-form-fields', usada em Formulario.tsx com select
  // mais amplo) — evita os dois componentes disputarem o formato do cache.
  // is_system_field=false só: nome/whatsapp não são orientados por
  // candidate_answers (colunas dedicadas) e vaga_id já tem badge própria
  // sempre visível — alternar o show_on_card desses 3 nunca muda o card.
  const { data: formFields = [] } = useQuery<{ id: string; label: string; show_on_card: boolean }[]>({
    queryKey: ['rh-form-fields-toggle'],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_fields').select('id, label, show_on_card').eq('is_system_field', false).order('sort_order')
      if (error) throw error
      return (data || []) as { id: string; label: string; show_on_card: boolean }[]
    },
    staleTime: 30 * 1000,
  })

  const toggleFormFieldCard = useMutation({
    mutationFn: async ({ id, showOnCard }: { id: string; showOnCard: boolean }) => {
      const { error } = await supabase.from('form_fields').update({ show_on_card: showOnCard }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-form-fields-toggle'] })
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
    },
    onError: (err) => toast.error(`Erro ao atualizar campo: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function updateCardPref(key: keyof CardFieldPrefs, value: boolean) {
    setCardPrefs((prev) => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(CARD_PREFS_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

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

  // Candidatos já promovidos pro Departamento Pessoal — somem da coluna
  // "Contratado" do kanban ativo do RH (o registro do candidato continua
  // intacto no banco, só a exibição aqui é filtrada).
  const { data: promotedRows = [] } = useQuery<{ candidate_id: string }[]>({
    queryKey: ['dp-promoted-candidate-ids'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employee_processes').select('candidate_id')
      if (error) throw error
      return (data || []) as { candidate_id: string }[]
    },
    staleTime: 15 * 1000,
  })
  const promotedIds = useMemo(() => new Set(promotedRows.map((r) => r.candidate_id)), [promotedRows])

  const candidatesByStage = useMemo(() => {
    const map = new Map<Stage, Candidate[]>()
    ALL_COLUMNS.forEach((col) => map.set(col.stage, []))
    candidates.forEach((c) => {
      if (c.stage === 'contratado' && promotedIds.has(c.id)) return
      map.get(c.stage)?.push(c)
    })
    return map
  }, [candidates, promotedIds])

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

  const promoteToDp = useMutation({
    mutationFn: async ({ id, employmentType }: { id: string; employmentType: EmploymentType }) => {
      const { error } = await supabase.rpc('promote_candidate_to_dp', {
        p_candidate_id: id,
        p_employment_type: employmentType,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      queryClient.invalidateQueries({ queryKey: ['dp-promoted-candidate-ids'] })
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      toast.success('Candidato promovido para o Departamento Pessoal')
      setPromoteCandidate(null)
      setDetailCandidate(null)
    },
    onError: (err) => toast.error(`Erro ao promover: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Vaga/Data início/Data fim/Responsável/Observações são editados como
  // rascunho local e só persistem quando o usuário clica em "Salvar
  // Alterações" — um único UPDATE, em vez de um botão por campo.
  const saveCandidateChanges = useMutation({
    mutationFn: async ({ id, patch }: {
      id: string
      patch: { job_opening_id: string; start_date: string | null; due_date: string | null; assignee_id: string | null; notes: string | null }
    }) => {
      const { error } = await supabase.from('candidates').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] })
      toast.success('Alterações salvas')
    },
    onError: (err) => toast.error(`Erro ao salvar alterações: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Edição direta no card do kanban (Vaga/Data fim) — aplica na hora, sem
  // botão de salvar, igual arrastar de etapa ou alternar tag.
  const quickUpdateCandidate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('candidates').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-candidates', storeId] }),
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function handleCardJobOpeningChange(candidateId: string, jobOpeningId: string) {
    quickUpdateCandidate.mutate({ id: candidateId, patch: { job_opening_id: jobOpeningId } })
  }

  function handleCardDueDateChange(candidateId: string, value: string | null) {
    quickUpdateCandidate.mutate({ id: candidateId, patch: { due_date: value } })
  }

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
    setStartDateDraft(c.start_date || '')
    setDueDateDraft(c.due_date || '')
    setAssigneeDraft(c.assignee_id || '')
    setJobOpeningDraft(c.job_opening_id)
  }

  function closeDetail() {
    setDetailCandidate(null)
    setNotesDraft('')
    setStartDateDraft('')
    setDueDateDraft('')
    setAssigneeDraft('')
    setJobOpeningDraft('')
  }

  function handleDragStart(event: DragStartEvent) {
    const c = candidates.find((cand) => cand.id === event.active.id)
    setActiveCandidate(c || null)
  }

  // Transição pra "Contratado" precisa do tipo_vinculo antes de commitar —
  // abre o modal de promoção em vez de mover o card direto. Cancelar não
  // altera nada: a etapa só muda dentro da RPC promote_candidate_to_dp.
  function requestStageChange(candidate: Candidate, newStage: Stage) {
    if (candidate.stage === newStage) return
    if (newStage === 'contratado' && !promotedIds.has(candidate.id)) {
      setPromoteCandidate(candidate)
      setPromoteEmploymentType('clt')
      return
    }
    updateStage.mutate({ id: candidate.id, stage: newStage })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCandidate(null)
    const { active, over } = event
    if (!over) return
    const newStage = over.id as Stage
    const candidate = candidates.find((c) => c.id === active.id)
    if (!candidate) return
    requestStageChange(candidate, newStage)
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
            <Link
              to="/admin/rh/automacoes"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt transition-colors"
              title="Automações do processo seletivo"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Automações</span>
            </Link>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt transition-colors"
                  title="Personalizar campos exibidos no card"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">Personalizar cartão</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Elementos do card</p>
                <div className="space-y-2.5 mb-4">
                  {CARD_PREF_LABELS.map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm text-foreground">{label}</span>
                      <Switch checked={cardPrefs[key]} onCheckedChange={(v) => updateCardPref(key, v)} />
                    </label>
                  ))}
                </div>
                {formFields.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Campos do formulário</p>
                    <div className="space-y-2.5 max-h-56 overflow-y-auto">
                      {formFields.map((f) => (
                        <label key={f.id} className="flex items-center justify-between gap-3 cursor-pointer">
                          <span className="text-sm text-foreground truncate">{f.label}</span>
                          <Switch
                            checked={f.show_on_card}
                            onCheckedChange={(v) => toggleFormFieldCard.mutate({ id: f.id, showOnCard: v })}
                          />
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
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
        <div className="px-4 sm:px-6 flex gap-1 border-t border-border overflow-x-auto scrollbar-none">
          <button onClick={() => setStoreId('')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              storeId === ''
                ? 'border-gold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <StoreIcon className="w-4 h-4" />Todas as unidades
          </button>
          {stores.map((s) => (
            <button key={s.id} onClick={() => setStoreId(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                storeId === s.id
                  ? 'border-gold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {s.name}
            </button>
          ))}
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
                  assigneeNames={assigneeNames}
                  cardPrefs={cardPrefs}
                  jobOpeningOptions={jobOpeningOptions}
                  onJobOpeningChange={handleCardJobOpeningChange}
                  onDueDateChange={handleCardDueDateChange}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
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
                <StyledSelect
                  value={createForm.job_opening_id}
                  onChange={(v) => setCreateForm({ ...createForm, job_opening_id: v })}
                  options={jobOpenings.map((j) => ({
                    value: j.id,
                    label: `${j.role_title}${!storeId && j.stores?.name ? ` — ${j.stores.name}` : ''}${j.status === 'fechada' ? ' (fechada)' : ''}`,
                  }))}
                />
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
                <ColorSelect
                  variant="dot"
                  value={detailCandidate.stage}
                  onChange={(value) => {
                    const stage = value as Stage
                    requestStageChange(detailCandidate, stage)
                    if (stage !== 'contratado' || promotedIds.has(detailCandidate.id)) {
                      setDetailCandidate({ ...detailCandidate, stage })
                    }
                  }}
                  options={ALL_COLUMNS.map((col) => ({ value: col.stage, label: col.label, color: getStageColors(col.stage).accent }))}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Alternativa ao arrastar no kanban — útil no mobile.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Vaga</label>
                <ColorSelect
                  variant="pill"
                  value={jobOpeningDraft}
                  onChange={setJobOpeningDraft}
                  options={allJobOpenings.map((j) => ({
                    value: j.id,
                    label: `${j.role_title}${j.stores?.name ? ` — ${j.stores.name}` : ''}${j.status === 'fechada' ? ' (fechada)' : ''}`,
                    color: j.job_roles?.color || DEFAULT_VAGA_COLOR,
                  }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Foto</p>
                  <input ref={detailPhotoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDetailPhotoChange(f) }} />
                  {detailCandidate.photo_url ? (
                    <AttachmentCard
                      url={detailCandidate.photo_url}
                      kind="image"
                      onRemove={() => updateAttachment.mutate({ id: detailCandidate.id, field: 'photo_url', url: null })}
                    />
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
                    <AttachmentCard
                      url={detailCandidate.resume_url}
                      kind="doc"
                      onRemove={() => updateAttachment.mutate({ id: detailCandidate.id, field: 'resume_url', url: null })}
                    />
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
                  <label className="block text-sm font-medium text-foreground mb-1">Data início</label>
                  <input
                    type="date"
                    value={startDateDraft}
                    onChange={(e) => setStartDateDraft(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Data fim</label>
                  <input
                    type="date"
                    value={dueDateDraft}
                    onChange={(e) => setDueDateDraft(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Responsável</label>
                  <StyledSelect
                    value={assigneeDraft}
                    onChange={setAssigneeDraft}
                    options={rhAssignableUsers.map((u) => ({ value: u.id, label: u.full_name || u.email }))}
                    emptyLabel="Sem responsável"
                    placeholder="Sem responsável"
                  />
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
              </div>

              {(() => {
                const hasDraftChanges =
                  jobOpeningDraft !== detailCandidate.job_opening_id ||
                  startDateDraft !== (detailCandidate.start_date || '') ||
                  dueDateDraft !== (detailCandidate.due_date || '') ||
                  assigneeDraft !== (detailCandidate.assignee_id || '') ||
                  notesDraft !== (detailCandidate.notes || '')
                return (
                  <button
                    onClick={() => saveCandidateChanges.mutate({
                      id: detailCandidate.id,
                      patch: {
                        job_opening_id: jobOpeningDraft,
                        start_date: startDateDraft || null,
                        due_date: dueDateDraft || null,
                        assignee_id: assigneeDraft || null,
                        notes: notesDraft.trim() || null,
                      },
                    })}
                    disabled={saveCandidateChanges.isPending || !hasDraftChanges}
                    className="w-full px-4 py-2.5 rounded-lg btn-action text-sm font-medium disabled:opacity-50"
                  >
                    {saveCandidateChanges.isPending ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal: promoção pro Departamento Pessoal (transição RH → DP) */}
      {promoteCandidate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setPromoteCandidate(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-1">Contratar {promoteCandidate.name}</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Selecione o tipo de vínculo — o candidato passa a ser gerenciado no módulo Departamento Pessoal, mantendo o histórico de recrutamento.
            </p>
            <label className="block text-sm font-medium text-foreground mb-1">Tipo de vínculo *</label>
            <StyledSelect
              value={promoteEmploymentType}
              onChange={(v) => setPromoteEmploymentType(v as EmploymentType)}
              options={EMPLOYMENT_TYPE_OPTIONS.map((tv) => ({ value: tv, label: EMPLOYMENT_TYPE_LABELS[tv] }))}
              className="mb-5"
              searchable={false}
            />
            <div className="flex gap-3">
              <button
                onClick={() => promoteToDp.mutate({ id: promoteCandidate.id, employmentType: promoteEmploymentType })}
                disabled={promoteToDp.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
              >
                {promoteToDp.isPending ? 'Contratando...' : 'Confirmar contratação'}
              </button>
              <button onClick={() => setPromoteCandidate(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
