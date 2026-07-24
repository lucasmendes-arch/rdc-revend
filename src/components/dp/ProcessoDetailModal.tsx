import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Phone, Camera, FileText, Image as ImageIcon, Tag, ChevronDown, ChevronRight, Paperclip, Calendar as CalendarIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import StyledSelect from '@/components/ui/styled-select'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  EMPLOYMENT_TYPE_LABELS, DOCUMENT_CHECKLIST_LABELS, DOCUMENT_STATUS_LABELS, CONTRACT_TYPE_LABELS,
  type DocumentStatus, type ContractType, type StageColumn,
} from '@/lib/dpConstants'
import type { Processo, TimelineEntry, DocumentRow, ContractRow, ContractPersonalData } from '@/lib/dpTypes'

const EMPTY_CONTRACT_FORM = { contract_type: 'clt' as ContractType, signature_date: '', term_start: '', term_end: '' }

function formatDateBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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

function formatAnswerValue(a: { value: string; form_fields: { field_type: string } | null }): string {
  if (a.form_fields?.field_type === 'data' && a.value) {
    const [y, m, d] = a.value.split('-')
    if (y && m && d) return `${d}/${m}/${y}`
  }
  if (a.form_fields?.field_type === 'checkbox') {
    return a.value.split('; ').join(', ')
  }
  return a.value
}

function parseISODate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Substitui o <input type="date"> nativo (calendário do sistema operacional,
// visual inconsistente entre navegadores) pelo componente Calendar do design
// system (react-day-picker já no projeto, só nunca tinha sido usado em
// lugar nenhum) — mesmo popover+trigger dos outros selects do modal.
function DateField({ value, onChange, placeholder = 'Selecionar data' }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm hover:bg-surface-alt transition-colors"
        >
          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseISODate(value)}
          onSelect={(d) => { onChange(d ? toISODate(d) : null); setOpen(false) }}
          initialFocus
        />
        {value && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full text-center px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Remover data
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Linha compacta de anexo (nome do arquivo clicável) — sem thumbnail grande,
// só o essencial: abrir e trocar/remover.
function AttachmentLine({ url, onRemove }: { url: string; onRemove: () => void }) {
  const name = fileNameFromUrl(url)
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground hover:underline truncate flex-1 min-w-0" title={name}>
        {name}
      </a>
      <button type="button" onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 shrink-0" title="Remover e escolher outro">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

type EstagioTabConfig =
  | { mode: 'kanban'; columns: StageColumn[]; onChangeStage: (newStage: string) => void }
  | { mode: 'ativo'; onEncerrar: () => void }

interface ProcessoDetailModalProps {
  processo: Processo
  onClose: () => void
  estagio: EstagioTabConfig
}

export default function ProcessoDetailModal({ processo, onClose, estagio }: ProcessoDetailModalProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [detailTab, setDetailTab] = useState('recrutamento')
  const [timelineDraft, setTimelineDraft] = useState('')
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT_FORM)
  const [photoUrl, setPhotoUrl] = useState(processo.candidates?.photo_url ?? null)
  const [resumeUrl, setResumeUrl] = useState(processo.candidates?.resume_url ?? null)
  const [rhHistoryOpen, setRhHistoryOpen] = useState(false)
  const [rhNotesOpen, setRhNotesOpen] = useState(false)
  const [uploadTargetDocId, setUploadTargetDocId] = useState<string | null>(null)
  // `processo` é um snapshot do array da query do kanban, capturado quando o
  // modal abriu — não se atualiza sozinho depois de um `invalidateQueries`
  // (só `current_stage` tinha esse patch manual, ver `requestStageChange` em
  // Contratacao.tsx). Sem estado local aqui, o checklist "trava": o clique
  // grava no banco mas o checkbox não reflete, parece que não funciona.
  const [checklist, setChecklist] = useState({
    onboarding_completed: processo.onboarding_completed,
    training_applicable: processo.training_applicable,
    training_completed: processo.training_completed,
  })
  // Mesmo problema do checklist acima, pros campos de candidates editados
  // nesta aba (Data início/fim, Responsável) — todos controlados (`value=`),
  // então sem esse patch local o clique salva no banco mas o campo continua
  // mostrando o valor antigo (parece que não é possível alterar).
  const [candidateDraft, setCandidateDraft] = useState({
    assignee_id: processo.candidates?.assignee_id ?? null,
    due_date: processo.candidates?.due_date ?? null,
    start_date: processo.candidates?.start_date ?? null,
  })
  const photoInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)
  const documentFileInputRef = useRef<HTMLInputElement>(null)
  const { upload: uploadPhoto, uploading: uploadingPhoto } = useImageUpload()
  const { upload: uploadResume, uploading: uploadingResume } = useFileUpload()
  const { upload: uploadDocumentFile, uploading: uploadingDocumentFile } = useFileUpload()

  const updatePhoto = useMutation({
    mutationFn: async (file: File) => {
      const url = await uploadPhoto(file, 'candidates/photos')
      const { error } = await supabase.from('candidates').update({ photo_url: url }).eq('id', processo.candidate_id)
      if (error) throw error
      return url
    },
    onSuccess: (url) => {
      setPhotoUrl(url)
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-colaboradores-ativos'] })
      toast.success('Foto atualizada')
    },
    onError: (err) => toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const clearPhoto = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('candidates').update({ photo_url: null }).eq('id', processo.candidate_id)
      if (error) throw error
    },
    onSuccess: () => {
      setPhotoUrl(null)
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-colaboradores-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao remover: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateResume = useMutation({
    mutationFn: async (url: string | null) => {
      const { error } = await supabase.from('candidates').update({ resume_url: url }).eq('id', processo.candidate_id)
      if (error) throw error
      return url
    },
    onSuccess: (url) => {
      setResumeUrl(url)
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-colaboradores-ativos'] })
    },
    onError: (err) => toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  async function handleResumeChange(file: File) {
    try {
      const url = await uploadResume(file, 'candidates/resumes')
      updateResume.mutate(url)
    } catch (err) {
      toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  // Mesma lista de src/pages/dp/Contratacao.tsx (chave de query igual —
  // react-query reaproveita o cache, sem round-trip extra na maioria dos
  // casos) — aqui pro select de Responsável dentro do modal.
  const { data: assignableUsers = [] } = useQuery<{ id: string; full_name: string | null }[]>({
    queryKey: ['rh-assignable-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_assignable_rh_users')
      if (error) throw error
      return (data || []) as { id: string; full_name: string | null }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Aplica na hora (sem rascunho/botão salvar) — mesmo padrão já usado pra
  // foto/currículo neste modal e pro responsável/data fim no card do kanban.
  const updateCandidateField = useMutation({
    mutationFn: async ({ field, value }: { field: 'assignee_id' | 'due_date' | 'start_date' | 'notes'; value: string | null }) => {
      const { error } = await supabase.from('candidates').update({ [field]: value }).eq('id', processo.candidate_id)
      if (error) throw error
    },
    onSuccess: (_data, { field, value }) => {
      if (field === 'assignee_id' || field === 'due_date' || field === 'start_date') {
        setCandidateDraft((prev) => ({ ...prev, [field]: value }))
      }
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-colaboradores-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const { data: timelineRows = [] } = useQuery<TimelineEntry[]>({
    queryKey: ['dp-timeline', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_timeline')
        .select('id, occurred_at, note, source')
        .eq('process_id', processo.id)
        .order('occurred_at', { ascending: true })
      if (error) throw error
      return (data || []) as TimelineEntry[]
    },
  })

  const { data: documentRows = [] } = useQuery<DocumentRow[]>({
    queryKey: ['dp-documents', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_documents')
        .select('id, document_type, status, file_url')
        .eq('process_id', processo.id)
        .order('document_type')
      if (error) throw error
      return (data || []) as DocumentRow[]
    },
  })

  // RG/CPF/Endereço/Chave PIX/CNPJ não são mais itens de anexo (ver
  // 20260724000004) — viraram campos de texto direto contra
  // employee_contract_data, mesma tabela/chave de query já usada em
  // GerarContratoModal.tsx ("Dados para contrato"), pra não duplicar a
  // mesma informação em dois lugares.
  const { data: personalData } = useQuery<ContractPersonalData | null>({
    queryKey: ['dp-contract-data', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contract_data')
        .select('*')
        .eq('process_id', processo.id)
        .maybeSingle()
      if (error) throw error
      return data as ContractPersonalData | null
    },
  })

  const [personalDraft, setPersonalDraft] = useState({ cpf: '', rg: '', cnpj: '', address: '', email: '', pix_key: '' })

  useEffect(() => {
    if (personalData) {
      setPersonalDraft({
        cpf: personalData.cpf ?? '',
        rg: personalData.rg ?? '',
        cnpj: personalData.cnpj ?? '',
        address: personalData.address ?? '',
        email: personalData.email ?? '',
        pix_key: personalData.pix_key ?? '',
      })
    }
  }, [personalData])

  const updatePersonalData = useMutation({
    mutationFn: async (field: keyof typeof personalDraft) => {
      const { error } = await supabase
        .from('employee_contract_data')
        .upsert({ process_id: processo.id, [field]: personalDraft[field] || null })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dp-contract-data', processo.id] }),
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateDocumentFile = useMutation({
    mutationFn: async ({ id, url }: { id: string; url: string | null }) => {
      const { error } = await supabase.from('employee_documents').update({ file_url: url }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dp-documents', processo.id] }),
    onError: (err) => toast.error(`Erro ao anexar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  async function handleDocumentFileChange(docId: string, file: File) {
    try {
      // Reaproveita a pasta já liberada pro currículo (edge function
      // upload-product-image tem allowlist fechada de pastas — criar uma
      // pasta nova pra isso exigiria redeploy da function E ajustar o
      // gate de autenticação, que hoje é Estoque, não RH). Mesmo tipo de
      // documento (imagem/PDF pessoal), mesmo limite de 10MB.
      const url = await uploadDocumentFile(file, 'candidates/resumes')
      updateDocumentFile.mutate({ id: docId, url })
    } catch (err) {
      toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  const { data: contractRows = [] } = useQuery<ContractRow[]>({
    queryKey: ['dp-contracts', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contracts')
        .select('id, contract_type, signature_date, term_start, term_end, file_url')
        .eq('process_id', processo.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ContractRow[]
    },
  })

  const updateDocumentStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DocumentStatus }) => {
      const { error } = await supabase.from('employee_documents').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dp-documents', processo.id] }),
    onError: (err) => toast.error(`Erro ao atualizar documento: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const updateChecklist = useMutation({
    mutationFn: async (patch: Partial<Pick<Processo, 'onboarding_completed' | 'training_applicable' | 'training_completed'>>) => {
      const { error } = await supabase.from('employee_processes').update(patch).eq('id', processo.id)
      if (error) throw error
      return patch
    },
    onSuccess: (patch) => {
      setChecklist((prev) => ({ ...prev, ...patch }))
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-colaboradores-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao atualizar checklist: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const createContract = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('employee_contracts').insert({
        process_id: processo.id,
        contract_type: contractForm.contract_type,
        signature_date: contractForm.signature_date || null,
        term_start: contractForm.term_start || null,
        term_end: contractForm.term_end || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-contracts', processo.id] })
      toast.success('Contrato registrado')
      setContractForm(EMPTY_CONTRACT_FORM)
    },
    onError: (err) => toast.error(`Erro ao registrar contrato: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const addTimelineEntry = useMutation({
    mutationFn: async () => {
      if (!timelineDraft.trim()) return
      const { error } = await supabase.from('employee_timeline').insert({
        process_id: processo.id,
        author_id: user?.id ?? null,
        note: timelineDraft.trim(),
        source: 'dp',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-timeline', processo.id] })
      setTimelineDraft('')
    },
    onError: (err) => toast.error(`Erro ao salvar anotação: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const rhTimeline = timelineRows.filter((t) => t.source === 'rh')
  const dpTimeline = timelineRows.filter((t) => t.source === 'dp')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      {/* Altura fixa (não max-h) — do contrário o card muda de tamanho a
          cada troca de aba, dependendo de quanto conteúdo aquela aba tem.
          min() trava num teto de 720px em telas grandes e cede pra 85vh só
          em telas baixas. O scroll fica todo dentro do painel de conteúdo. */}
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-2xl h-[min(85vh,720px)] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0 border-b border-border/60">
          <div className="flex items-center gap-3 min-w-0">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) updatePhoto.mutate(f) }}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              title="Alterar foto"
              className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 bg-surface-alt border border-border flex items-center justify-center group"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">{initials(processo.candidates?.name || '?')}</span>
              )}
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-4 h-4 text-white" />
              </span>
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground truncate">{processo.candidates?.name}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {processo.role_title} · {processo.stores?.name} · {EMPLOYMENT_TYPE_LABELS[processo.employment_type]}
              </p>
              {processo.candidates?.whatsapp && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {processo.candidates.whatsapp}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar de navegação a partir de sm: — no mobile as abas continuam
            em linha no topo (mesmo padrão de antes), já que a barra lateral
            fixa não cabe numa tela estreita. */}
        <Tabs value={detailTab} onValueChange={setDetailTab} orientation="vertical" className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
          {/* sm:pt-6 (não sm:p-3 pro topo) — alinha o primeiro item do menu
              com o primeiro campo do painel de conteúdo (p-6), que também
              começa a 24px do topo. Só o topo precisa bater; laterais/base
              ficam mais compactas (sidebar estreita, w-40). */}
          <TabsList className="flex flex-row flex-wrap gap-1 h-auto rounded-lg bg-surface-alt/60 p-1.5 mx-6 mt-4 shrink-0 sm:flex-col sm:flex-nowrap sm:mx-0 sm:mt-0 sm:w-40 sm:h-auto sm:items-stretch sm:justify-start sm:rounded-none sm:border-r sm:border-border/60 sm:bg-transparent sm:px-3 sm:pb-3 sm:pt-6 sm:gap-0.5 sm:overflow-y-auto sm:scrollbar-thin">
            <TabsTrigger
              value="recrutamento"
              className="sm:w-full sm:justify-start sm:text-left sm:px-3 sm:py-2 sm:rounded-lg sm:data-[state=active]:bg-card sm:data-[state=active]:shadow-none sm:data-[state=active]:text-foreground sm:text-muted-foreground sm:hover:bg-card/60 sm:hover:text-foreground"
            >
              Recrutamento
            </TabsTrigger>
            <TabsTrigger
              value="documentos"
              className="sm:w-full sm:justify-start sm:text-left sm:px-3 sm:py-2 sm:rounded-lg sm:data-[state=active]:bg-card sm:data-[state=active]:shadow-none sm:data-[state=active]:text-foreground sm:text-muted-foreground sm:hover:bg-card/60 sm:hover:text-foreground"
            >
              Documentos
            </TabsTrigger>
            <TabsTrigger
              value="contrato"
              className="sm:w-full sm:justify-start sm:text-left sm:px-3 sm:py-2 sm:rounded-lg sm:data-[state=active]:bg-card sm:data-[state=active]:shadow-none sm:data-[state=active]:text-foreground sm:text-muted-foreground sm:hover:bg-card/60 sm:hover:text-foreground"
            >
              Contrato
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="sm:w-full sm:justify-start sm:text-left sm:px-3 sm:py-2 sm:rounded-lg sm:data-[state=active]:bg-card sm:data-[state=active]:shadow-none sm:data-[state=active]:text-foreground sm:text-muted-foreground sm:hover:bg-card/60 sm:hover:text-foreground"
            >
              Timeline
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-6">
          <TabsContent value="recrutamento">
            <div className="space-y-6 py-3">
              {/* Status do processo — era a aba "Estágio" separada; trazida
                  pra cá porque é o campo mais acionado no dia a dia (etapa
                  atual / encerrar vínculo), não faz sentido escondido numa
                  aba à parte. */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Status</label>
                {estagio.mode === 'kanban' ? (
                  <>
                    <StyledSelect
                      value={processo.current_stage}
                      onChange={estagio.onChangeStage}
                      options={estagio.columns.map((col) => ({ value: col.stage, label: col.label }))}
                      searchable={false}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Alternativa ao arrastar no kanban — útil no mobile.</p>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-foreground">
                      Efetivado em <span className="font-medium">{formatDateBR(processo.activated_at)}</span>
                    </p>
                    <button
                      onClick={estagio.onEncerrar}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                    >
                      Encerrar vínculo
                    </button>
                  </div>
                )}
              </div>

              {/* Perfil trazido do candidato — mesmos campos do modal de
                  detalhe de Candidatos (src/pages/rh/Candidatos.tsx), pra não
                  perder informação de recrutamento na promoção pro DP. */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-0.5">Idade</p>
                  <p className="text-foreground">{processo.candidates?.age ? `${processo.candidates.age} anos` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-0.5">Origem</p>
                  <p className="text-foreground">{processo.candidates?.source === 'manual' ? 'Manual' : 'Formulário'}</p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setRhNotesOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase"
                >
                  <span>Observações do RH{processo.candidates?.notes ? ' (1)' : ''}</span>
                  {rhNotesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {rhNotesOpen && (
                  <textarea
                    defaultValue={processo.candidates?.notes || ''}
                    onBlur={(e) => updateCandidateField.mutate({ field: 'notes', value: e.target.value.trim() || null })}
                    rows={2}
                    placeholder="Sem observações."
                    className="w-full mt-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Foto</p>
                  {photoUrl ? (
                    <AttachmentLine url={photoUrl} onRemove={() => clearPhoto.mutate()} />
                  ) : (
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt disabled:opacity-60">
                      <ImageIcon className="w-4 h-4" /> {uploadingPhoto ? 'Enviando...' : 'Adicionar foto'}
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Currículo</p>
                  <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeChange(f) }} />
                  {resumeUrl ? (
                    <AttachmentLine url={resumeUrl} onRemove={() => updateResume.mutate(null)} />
                  ) : (
                    <button type="button" onClick={() => resumeInputRef.current?.click()} disabled={uploadingResume}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt disabled:opacity-60">
                      <FileText className="w-4 h-4" /> {uploadingResume ? 'Enviando...' : 'Adicionar currículo'}
                    </button>
                  )}
                </div>
              </div>

              {(processo.candidates?.candidate_answers.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Respostas do formulário</p>
                  <div className="space-y-1.5 text-sm bg-surface-alt rounded-lg p-3">
                    {processo.candidates!.candidate_answers.map((a) => (
                      <div key={a.form_fields?.field_key || a.value} className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">{a.form_fields?.label || '—'}</span>
                        <span className="text-foreground text-right truncate">{formatAnswerValue(a)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Data início</label>
                  <DateField
                    value={candidateDraft.start_date}
                    onChange={(v) => updateCandidateField.mutate({ field: 'start_date', value: v })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Data fim</label>
                  <DateField
                    value={candidateDraft.due_date}
                    onChange={(v) => updateCandidateField.mutate({ field: 'due_date', value: v })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Responsável</label>
                  <StyledSelect
                    value={candidateDraft.assignee_id ?? ''}
                    onChange={(v) => updateCandidateField.mutate({ field: 'assignee_id', value: v || null })}
                    options={assignableUsers.map((u) => ({ value: u.id, label: u.full_name || 'Sem nome' }))}
                    emptyLabel="Sem responsável"
                    placeholder="Sem responsável"
                  />
                </div>
              </div>

              {(processo.candidates?.candidate_tags.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {processo.candidates!.candidate_tags.filter((ct) => ct.tags).map((ct) => (
                      <span
                        key={ct.tags!.id}
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: `${ct.tags!.color}22`, color: ct.tags!.color }}
                      >
                        {ct.tags!.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist de admissão: onboarding institucional + treinamento
                  técnico do cargo. Não é o checklist de documentos (aba
                  Documentos) — são 2 verificações à parte que também fazem
                  parte da etapa única "contratação" (ver docs/SCHEMA.md). */}
              <div className="border-t border-border/60 pt-4 space-y-2.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-0.5">Checklist de admissão</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.onboarding_completed}
                    onChange={(e) => updateChecklist.mutate({ onboarding_completed: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-green-600"
                  />
                  <span className="text-sm text-foreground">Onboarding institucional concluído</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.training_applicable}
                    onChange={(e) => updateChecklist.mutate({ training_applicable: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-amber-500"
                  />
                  <span className="text-sm text-foreground">Treinamento técnico aplicável a este cargo</span>
                </label>
                {checklist.training_applicable && (
                  <label className="flex items-center gap-2 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={checklist.training_completed}
                      onChange={(e) => updateChecklist.mutate({ training_completed: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-green-600"
                    />
                    <span className="text-sm text-foreground">Treinamento concluído</span>
                  </label>
                )}
              </div>

              {/* Compacto e recolhido por padrão — são só as mudanças de
                  etapa herdadas do funil de RH (candidate_stage_history),
                  histórico secundário, não precisa competir por espaço com
                  o resto do perfil. */}
              <div className="border-t border-border/60 pt-4">
                <button
                  type="button"
                  onClick={() => setRhHistoryOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase"
                >
                  <span>Histórico do RH ({rhTimeline.length})</span>
                  {rhHistoryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {rhHistoryOpen && (
                  rhTimeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Sem histórico de recrutamento.</p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {rhTimeline.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                          <span className="text-foreground truncate">{t.note}</span>
                          <span className="text-muted-foreground shrink-0">{formatDateBR(t.occurred_at)}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="documentos">
            <input
              ref={documentFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && uploadTargetDocId) handleDocumentFileChange(uploadTargetDocId, f)
                e.target.value = ''
              }}
            />
            <div className="space-y-6 py-3">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-3">Dados pessoais</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">RG</label>
                    <input
                      value={personalDraft.rg}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, rg: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('rg')}
                      maxLength={20}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">CPF</label>
                    <input
                      value={personalDraft.cpf}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                      onBlur={() => updatePersonalData.mutate('cpf')}
                      inputMode="numeric"
                      placeholder="Somente números"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {processo.employment_type === 'mei' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">CNPJ</label>
                      <input
                        value={personalDraft.cnpj}
                        onChange={(e) => setPersonalDraft((p) => ({ ...p, cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                        onBlur={() => updatePersonalData.mutate('cnpj')}
                        inputMode="numeric"
                        placeholder="Somente números"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Endereço</label>
                    <input
                      value={personalDraft.address}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, address: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('address')}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">E-mail</label>
                    <input
                      type="email"
                      value={personalDraft.email}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, email: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('email')}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Chave PIX</label>
                    <input
                      value={personalDraft.pix_key}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, pix_key: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('pix_key')}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              {documentRows.length > 0 && (
              <div className="border-t border-border/60 pt-4 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Checklist de documentos</p>
              {documentRows.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-border/50 last:border-0">
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">{DOCUMENT_CHECKLIST_LABELS[doc.document_type] || doc.document_type}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {doc.file_url ? (
                      <span className="flex items-center gap-0.5">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-accent hover:bg-surface-alt"
                          title="Ver arquivo anexado"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => updateDocumentFile.mutate({ id: doc.id, url: null })}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                          title="Remover anexo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setUploadTargetDocId(doc.id); documentFileInputRef.current?.click() }}
                        disabled={uploadingDocumentFile && uploadTargetDocId === doc.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
                        title="Anexar arquivo"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <StyledSelect
                      variant="xs"
                      value={doc.status}
                      onChange={(v) => updateDocumentStatus.mutate({ id: doc.id, status: v as DocumentStatus })}
                      options={(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map((s) => ({ value: s, label: DOCUMENT_STATUS_LABELS[s] }))}
                      searchable={false}
                    />
                  </div>
                </div>
              ))}
              </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contrato">
            <div className="space-y-3 py-2">
              {contractRows.map((c) => (
                <div key={c.id} className="text-sm bg-surface-alt rounded-lg p-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{CONTRACT_TYPE_LABELS[c.contract_type]}</p>
                    {c.file_url && (
                      <a
                        href={c.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-accent hover:underline shrink-0"
                      >
                        Abrir contrato
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Assinatura: {formatDateBR(c.signature_date)}</p>
                  <p className="text-[11px] text-muted-foreground">Vigência: {formatDateBR(c.term_start)} — {formatDateBR(c.term_end)}</p>
                </div>
              ))}
              <div className="border border-border rounded-lg p-3 space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase">Registrar contrato</p>
                <StyledSelect
                  value={contractForm.contract_type}
                  onChange={(v) => setContractForm({ ...contractForm, contract_type: v as ContractType })}
                  options={(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((tc) => ({ value: tc, label: CONTRACT_TYPE_LABELS[tc] }))}
                  searchable={false}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Assinatura</label>
                    <DateField
                      value={contractForm.signature_date || null}
                      onChange={(v) => setContractForm({ ...contractForm, signature_date: v || '' })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Início vigência</label>
                    <DateField
                      value={contractForm.term_start || null}
                      onChange={(v) => setContractForm({ ...contractForm, term_start: v || '' })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Fim vigência</label>
                    <DateField
                      value={contractForm.term_end || null}
                      onChange={(v) => setContractForm({ ...contractForm, term_end: v || '' })}
                    />
                  </div>
                </div>
                <button
                  onClick={() => createContract.mutate()}
                  disabled={createContract.isPending}
                  className="w-full px-3 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-70"
                >
                  {createContract.isPending ? 'Salvando...' : 'Registrar contrato'}
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            <div className="space-y-2 py-2">
              {dpTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem anotações ainda.</p>
              ) : (
                dpTimeline.map((t) => (
                  <div key={t.id} className="text-sm bg-surface-alt rounded-lg p-2.5">
                    <p className="text-foreground">{t.note}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDateBR(t.occurred_at)}</p>
                  </div>
                ))
              )}
              <textarea
                value={timelineDraft}
                onChange={(e) => setTimelineDraft(e.target.value)}
                rows={3}
                placeholder="Nova anotação..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <button
                onClick={() => addTimelineEntry.mutate()}
                disabled={addTimelineEntry.isPending || !timelineDraft.trim()}
                className="px-4 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-70"
              >
                {addTimelineEntry.isPending ? 'Salvando...' : 'Adicionar anotação'}
              </button>
            </div>
          </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
