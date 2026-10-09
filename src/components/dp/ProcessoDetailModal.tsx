import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Phone, Camera, FileText, Image as ImageIcon, Tag, ChevronDown, ChevronRight, Paperclip, FolderOpen, ExternalLink, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useImageUpload, PHOTO_MAX_DIMENSION } from '@/hooks/useImageUpload'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/ui/date-field'
import {
  EMPLOYMENT_TYPE_LABELS, DOCUMENT_CHECKLIST_LABELS, DOCUMENT_STATUS_LABELS, CONTRACT_TYPE_LABELS,
  isExperienceTagActive, getExperienceInfo, MARITAL_STATUS_OPTIONS, toSelectOptions, meiLegalName,
  type DocumentStatus, type ContractType, type StageColumn,
} from '@/lib/dpConstants'
import NacionalidadeField from '@/components/dp/NacionalidadeField'
import type { Processo, TimelineEntry, DocumentRow, ContractRow, ContractPersonalData } from '@/lib/dpTypes'

const EMPTY_CONTRACT_FORM = { contract_type: 'clt' as ContractType, signature_date: '', term_start: '', term_end: '' }

function formatDateBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Datas "puras" (sem hora significativa): colunas `date` (signature_date,
// term_start, term_end) ou timestamptz gravado sempre à meia-noite UTC
// (activated_at, via RPC que só recebe a data). new Date(iso) interpreta os
// dois casos como meia-noite UTC — formatar no fuso local rola a data pra
// trás em fusos negativos (Brasil, UTC-3: 09/07 vira 08/07 21h). timeZone:
// 'UTC' lê de volta o mesmo dia gravado, independente do fuso de quem vê.
function formatCalendarDateBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

// Há quanto tempo o processo está na etapa atual. stage_started_at é um
// timestamp real (não data pura), então aqui o fuso local é o certo — o que
// importa é a duração, não o dia gravado.
function daysInStage(stageStartedAt: string): number {
  const ms = Date.now() - new Date(stageStartedAt).getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

function stageDurationLabel(days: number): string {
  if (days === 0) return 'entrou hoje'
  if (days === 1) return 'há 1 dia'
  return `há ${days} dias`
}

// Sinaliza campo preenchido na aba Documentos (Dados pessoais + Pasta do
// Drive) — só um indicador visual de "ok, já tem algo aqui", não valida
// formato/conteúdo.
function FieldLabel({ text, filled }: { text: string; filled: boolean }) {
  return (
    <label className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground mb-1.5">
      {text}
      {filled && <Check className="w-3 h-3 text-muted-foreground/50" />}
    </label>
  )
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

// Linha compacta de anexo (nome do arquivo clicável) — sem thumbnail grande,
// só o essencial: abrir e trocar/remover.
function AttachmentLine({ url, onRemove }: { url: string; onRemove: () => void }) {
  const name = fileNameFromUrl(url)
  return (
    <div className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-md border border-border bg-background">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-foreground hover:underline underline-offset-4 truncate flex-1 min-w-0" title={name}>
        {name}
      </a>
      <button type="button" onClick={onRemove} className="h-7 w-7 flex items-center justify-center rounded-sm hover:bg-danger-subtle text-ink-400 hover:text-danger shrink-0" title="Remover e escolher outro" aria-label="Remover anexo">
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
  useEscapeToClose(onClose)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [detailTab, setDetailTab] = useState('recrutamento')
  const [timelineDraft, setTimelineDraft] = useState('')
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT_FORM)
  const [photoUrl, setPhotoUrl] = useState(processo.candidates?.photo_url ?? null)
  const [resumeUrl, setResumeUrl] = useState(processo.candidates?.resume_url ?? null)
  const [rhHistoryOpen, setRhHistoryOpen] = useState(false)
  const [rhNotesOpen, setRhNotesOpen] = useState(false)
  const [driveDraft, setDriveDraft] = useState(processo.drive_folder_url ?? '')
  const [ageDraft, setAgeDraft] = useState(processo.candidates?.age?.toString() ?? '')
  const [experienceRenewedAt, setExperienceRenewedAt] = useState(processo.experience_renewed_at)
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
      const url = await uploadPhoto(file, 'candidates/photos', { maxDimension: PHOTO_MAX_DIMENSION })
      const { error } = await supabase.from('candidates').update({ photo_url: url }).eq('id', processo.candidate_id)
      if (error) throw error
      return url
    },
    onSuccess: (url) => {
      setPhotoUrl(url)
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
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
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
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
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
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
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
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

  const [personalDraft, setPersonalDraft] = useState({
    cpf: '', rg: '', cnpj: '', legal_name: '', nationality: '', marital_status: '',
    address: '', email: '', pix_key: '',
  })

  useEffect(() => {
    if (personalData) {
      setPersonalDraft({
        cpf: personalData.cpf ?? '',
        rg: personalData.rg ?? '',
        cnpj: personalData.cnpj ?? '',
        legal_name: personalData.legal_name ?? '',
        nationality: personalData.nationality ?? '',
        marital_status: personalData.marital_status ?? '',
        address: personalData.address ?? '',
        email: personalData.email ?? '',
        pix_key: personalData.pix_key ?? '',
      })
    }
  }, [personalData])

  const updatePersonalData = useMutation({
    mutationFn: async (field: keyof typeof personalDraft) => {
      // `nationality` é NOT NULL DEFAULT 'brasileira' — apagar o campo e sair
      // mandaria null e estouraria a constraint, então vazio volta ao padrão.
      const value = personalDraft[field] || (field === 'nationality' ? 'brasileira' : null)
      const { error } = await supabase
        .from('employee_contract_data')
        .upsert({ process_id: processo.id, [field]: value })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dp-contract-data', processo.id] }),
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Irmã de updatePersonalData pros campos de dropdown: o valor vem junto em
  // vez de ser lido do draft, porque o setState do onChange ainda não
  // aplicou quando o commit acontece no mesmo tick.
  const updateSingleField = useMutation({
    mutationFn: async ({ field, value }: { field: keyof typeof personalDraft; value: string }) => {
      const resolved = value || (field === 'nationality' ? 'brasileiro(a)' : null)
      const { error } = await supabase
        .from('employee_contract_data')
        .upsert({ process_id: processo.id, [field]: resolved })
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
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao atualizar checklist: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Aplica no blur, mesmo padrão dos campos de "Dados pessoais" logo abaixo
  // (updatePersonalData) — sem botão de salvar próprio.
  const updateDriveFolder = useMutation({
    mutationFn: async (value: string | null) => {
      const { error } = await supabase.from('employee_processes').update({ drive_folder_url: value }).eq('id', processo.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Prazo do processo — distinto do prazo do candidato (candidates.due_date,
  // que é do funil de recrutamento). É uma das fontes de data do gatilho
  // process_date_reached das automações de Contratação.
  const [dueDateDraft, setDueDateDraft] = useState<string | null>(processo.due_date)
  const updateDueDate = useMutation({
    mutationFn: async (value: string | null) => {
      const { error } = await supabase.from('employee_processes').update({ due_date: value }).eq('id', processo.id)
      if (error) throw error
      return value
    },
    onSuccess: (value) => {
      setDueDateDraft(value)
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao salvar prazo: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Cadastro retroativo (register_existing_employee) nunca pediu idade —
  // fica editável aqui pra quem entrou assim (ou pra corrigir qualquer
  // colaborador depois). Mesmo padrão de aplicar no blur, sem botão próprio.
  const updateAge = useMutation({
    mutationFn: async (value: number | null) => {
      const { error } = await supabase.from('candidates').update({ age: value }).eq('id', processo.candidate_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function handleAgeBlur() {
    const trimmed = ageDraft.trim()
    if (!trimmed) { updateAge.mutate(null); return }
    const parsed = parseInt(trimmed, 10)
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Idade inválida')
      setAgeDraft(processo.candidates?.age?.toString() ?? '')
      return
    }
    updateAge.mutate(parsed)
  }

  // Renovação do contrato de experiência CLT (45d → mais 45d, teto de 90d
  // contados da efetivação) — ato manual, só faz sentido uma vez.
  const renewExperience = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase.from('employee_processes').update({ experience_renewed_at: now }).eq('id', processo.id)
      if (error) throw error
      return now
    },
    onSuccess: (now) => {
      setExperienceRenewedAt(now)
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
      toast.success('Experiência renovada por mais 45 dias')
    },
    onError: (err) => toast.error(`Erro ao renovar: ${err instanceof Error ? err.message : 'desconhecido'}`),
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

  // Item do menu lateral (sm+): selecionado = cartão neutro, como a sidebar
  // do admin. No mobile segue o TabsList segmentado padrão.
  const navTrigger = 'sm:w-full sm:justify-start sm:text-left sm:h-8 sm:px-2.5 sm:rounded-md sm:data-[state=active]:bg-muted sm:data-[state=active]:shadow-none sm:data-[state=active]:text-foreground sm:text-ink-500 sm:hover:bg-muted/60 sm:hover:text-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dp-processo-title">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-in fade-in-0" onClick={onClose} />
      {/* Altura fixa (não max-h) — do contrário o card muda de tamanho a
          cada troca de aba, dependendo de quanto conteúdo aquela aba tem.
          min() trava num teto de 720px em telas grandes e cede pra 85vh só
          em telas baixas. O scroll fica todo dentro do painel de conteúdo. */}
      <div className="relative w-full max-w-2xl h-[min(85vh,720px)] flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-[0.98] duration-150">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 shrink-0 border-b border-border">
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
              aria-label="Alterar foto"
              className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 bg-muted border border-border flex items-center justify-center group"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">{initials(processo.candidates?.name || '?')}</span>
              )}
              <span className="absolute inset-0 bg-ink-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-4 h-4 text-white" />
              </span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 id="dp-processo-title" className="text-[16px] font-semibold leading-tight tracking-tight text-foreground truncate">
                  {processo.candidates?.name}
                </h2>
                {isExperienceTagActive(processo) ? (
                  <Badge variant="info" className="shrink-0" title="Período de experiência em andamento">
                    {getExperienceInfo(processo)?.label}
                  </Badge>
                ) : (
                  // "Ativo" só faz sentido pra quem já é colaborador de fato
                  // (estagio.mode === 'ativo') — no kanban de Contratação
                  // (mode 'kanban') o processo ainda não tem activated_at,
                  // então essa tag ficaria enganosa (parece efetivado sem ser).
                  estagio.mode === 'ativo' && (
                    <Badge variant="success" className="shrink-0" title="Período de experiência concluído">
                      Ativo
                    </Badge>
                  )
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground truncate">
                {processo.role_title} · {processo.stores?.name} · {EMPLOYMENT_TYPE_LABELS[processo.employment_type]}
              </p>
              {processo.candidates?.whatsapp && (
                <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5 tabular-nums">
                  <Phone className="w-3 h-3" /> {processo.candidates.whatsapp}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar" className="-mr-1 -mt-1 shrink-0">
            <X />
          </Button>
        </div>

        {/* Sidebar de navegação a partir de sm: — no mobile as abas continuam
            em linha no topo (mesmo padrão de antes), já que a barra lateral
            fixa não cabe numa tela estreita. */}
        <Tabs value={detailTab} onValueChange={setDetailTab} orientation="vertical" className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
          {/* sm:pt-5 alinha o primeiro item do menu com o primeiro campo do
              painel de conteúdo (p-5). */}
          <TabsList className="flex flex-row flex-wrap gap-0.5 h-auto mx-5 mt-4 shrink-0 self-start sm:self-auto sm:flex-col sm:flex-nowrap sm:mx-0 sm:mt-0 sm:w-40 sm:h-auto sm:items-stretch sm:justify-start sm:rounded-none sm:border-0 sm:border-r sm:border-border sm:bg-transparent sm:px-2.5 sm:pb-3 sm:pt-5 sm:gap-0.5 sm:overflow-y-auto sm:scrollbar-thin">
            <TabsTrigger value="recrutamento" className={navTrigger}>Recrutamento</TabsTrigger>
            <TabsTrigger value="documentos" className={navTrigger}>Documentos</TabsTrigger>
            <TabsTrigger value="contrato" className={navTrigger}>Contrato</TabsTrigger>
            <TabsTrigger value="timeline" className={navTrigger}>Linha do tempo</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-5">
          <TabsContent value="recrutamento" className="mt-0">
            <div className="space-y-6">
              {/* Status do processo — era a aba "Estágio" separada; trazida
                  pra cá porque é o campo mais acionado no dia a dia (etapa
                  atual / encerrar vínculo), não faz sentido escondido numa
                  aba à parte. */}
              <div>
                <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Etapa</label>
                {estagio.mode === 'kanban' ? (
                  <>
                    {/* Mesma cor da etapa no kanban (bolinha), regra de
                        "tudo que tem cor aparece com a cor". */}
                    <StyledSelect
                      value={processo.current_stage}
                      onChange={estagio.onChangeStage}
                      options={estagio.columns.map((col) => ({ value: col.stage, label: col.label, dotColor: col.accent }))}
                      searchable={false}
                    />
                    <p className="text-[12px] text-muted-foreground mt-1.5">
                      Alternativa ao arrastar no kanban — útil no mobile. Nesta etapa {stageDurationLabel(daysInStage(processo.stage_started_at))}.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[13px] text-foreground">
                      Efetivado em <span className="font-medium tabular-nums">{formatCalendarDateBR(processo.activated_at)}</span>
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {processo.employment_type === 'clt' && !experienceRenewedAt && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => renewExperience.mutate()}
                          disabled={renewExperience.isPending}
                          title="Renova o contrato de experiência por mais 45 dias (teto de 90d desde a efetivação)"
                        >
                          {renewExperience.isPending ? 'Renovando…' : 'Renovar experiência (+45d)'}
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={estagio.onEncerrar}>
                        Encerrar vínculo
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Prazo do processo — separado do prazo do candidato (que é do
                  funil de RH). Serve de data de referência pras automações de
                  Contratação. */}
              <div>
                <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Prazo do processo</label>
                <div className="max-w-[220px]">
                  <DateField
                    value={dueDateDraft}
                    onChange={(v) => updateDueDate.mutate(v ?? null)}
                    placeholder="Sem prazo"
                  />
                </div>
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  Opcional. Uma automação pode usar esta data como gatilho — ver Automações da contratação.
                </p>
              </div>

              {/* Perfil trazido do candidato — mesmos campos do modal de
                  detalhe de Candidatos (src/pages/rh/Candidatos.tsx), pra não
                  perder informação de recrutamento na promoção pro DP. */}
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Idade</p>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={ageDraft}
                    onChange={(e) => setAgeDraft(e.target.value)}
                    onBlur={handleAgeBlur}
                    placeholder="—"
                    className="w-24 tabular-nums"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Origem</p>
                  <p className="h-9 flex items-center text-foreground">{processo.candidates?.source === 'manual' ? 'Manual' : 'Formulário'}</p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setRhNotesOpen((v) => !v)}
                  aria-expanded={rhNotesOpen}
                  className="w-full flex items-center justify-between text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <span>Observações do RH{processo.candidates?.notes ? ' (1)' : ''}</span>
                  {rhNotesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {rhNotesOpen && (
                  <Textarea
                    defaultValue={processo.candidates?.notes || ''}
                    onBlur={(e) => updateCandidateField.mutate({ field: 'notes', value: e.target.value.trim() || null })}
                    rows={2}
                    placeholder="Sem observações."
                    className="mt-2 min-h-0 resize-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Foto</p>
                  {photoUrl ? (
                    <AttachmentLine url={photoUrl} onRemove={() => clearPhoto.mutate()} />
                  ) : (
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                      className="w-full h-9 flex items-center justify-center gap-1.5 px-3 rounded-md border border-dashed border-border text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60">
                      <ImageIcon className="w-4 h-4" /> {uploadingPhoto ? 'Enviando…' : 'Adicionar foto'}
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Currículo</p>
                  <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeChange(f) }} />
                  {resumeUrl ? (
                    <AttachmentLine url={resumeUrl} onRemove={() => updateResume.mutate(null)} />
                  ) : (
                    <button type="button" onClick={() => resumeInputRef.current?.click()} disabled={uploadingResume}
                      className="w-full h-9 flex items-center justify-center gap-1.5 px-3 rounded-md border border-dashed border-border text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60">
                      <FileText className="w-4 h-4" /> {uploadingResume ? 'Enviando…' : 'Adicionar currículo'}
                    </button>
                  )}
                </div>
              </div>

              {(processo.candidates?.candidate_answers.length ?? 0) > 0 && (
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Respostas do formulário</p>
                  <div className="space-y-1.5 text-[13px] rounded-lg border border-border bg-surface p-3">
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
                  <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Data início</label>
                  <DateField
                    value={candidateDraft.start_date}
                    onChange={(v) => updateCandidateField.mutate({ field: 'start_date', value: v })}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Data fim</label>
                  <DateField
                    value={candidateDraft.due_date}
                    onChange={(v) => updateCandidateField.mutate({ field: 'due_date', value: v })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Responsável</label>
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
                  <p className="text-[12px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {processo.candidates!.candidate_tags.filter((ct) => ct.tags).map((ct) => (
                      <span
                        key={ct.tags!.id}
                        className="text-[12px] font-medium px-2 py-0.5 rounded-full"
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
              <div className="border-t border-border pt-4 space-y-2.5">
                <h3 className="text-[14px] font-semibold text-foreground">Checklist de admissão</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.onboarding_completed}
                    onChange={(e) => updateChecklist.mutate({ onboarding_completed: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-ink-900"
                  />
                  <span className="text-[13px] text-foreground">Onboarding institucional concluído</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.training_applicable}
                    onChange={(e) => updateChecklist.mutate({ training_applicable: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-ink-900"
                  />
                  <span className="text-[13px] text-foreground">Treinamento técnico aplicável a este cargo</span>
                </label>
                {checklist.training_applicable && (
                  <label className="flex items-center gap-2 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={checklist.training_completed}
                      onChange={(e) => updateChecklist.mutate({ training_completed: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-ink-900"
                    />
                    <span className="text-[13px] text-foreground">Treinamento concluído</span>
                  </label>
                )}
              </div>

              {/* Compacto e recolhido por padrão — são só as mudanças de
                  etapa herdadas do funil de RH (candidate_stage_history),
                  histórico secundário, não precisa competir por espaço com
                  o resto do perfil. */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setRhHistoryOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <span>Histórico do RH ({rhTimeline.length})</span>
                  {rhHistoryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {rhHistoryOpen && (
                  rhTimeline.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground py-2">Sem histórico de recrutamento.</p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {rhTimeline.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-[12px] py-1.5 border-b border-border last:border-0">
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

          <TabsContent value="documentos" className="mt-0">
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
            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground mb-1.5">
                  <FolderOpen className="w-3 h-3" /> Pasta do Drive
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="url"
                    value={driveDraft}
                    onChange={(e) => setDriveDraft(e.target.value)}
                    onBlur={() => updateDriveFolder.mutate(driveDraft.trim() || null)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 min-w-0"
                  />
                  {driveDraft.trim() && (
                    <Button variant="secondary" size="icon" asChild className="shrink-0">
                      <a href={driveDraft.trim()} target="_blank" rel="noopener noreferrer" title="Abrir pasta" aria-label="Abrir pasta">
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-[14px] font-semibold text-foreground mb-3">Dados pessoais</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel text="RG" filled={!!personalDraft.rg.trim()} />
                    <Input
                      value={personalDraft.rg}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, rg: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('rg')}
                      maxLength={20}
                     
                    />
                  </div>
                  <div>
                    <FieldLabel text="CPF" filled={!!personalDraft.cpf.trim()} />
                    <Input
                      value={personalDraft.cpf}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                      onBlur={() => updatePersonalData.mutate('cpf')}
                      inputMode="numeric"
                      placeholder="Somente números"
                     
                    />
                  </div>
                  {processo.employment_type === 'mei' && (
                    <div>
                      <FieldLabel text="CNPJ" filled={!!personalDraft.cnpj.trim()} />
                      <Input
                        value={personalDraft.cnpj}
                        onChange={(e) => setPersonalDraft((p) => ({ ...p, cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                        onBlur={() => updatePersonalData.mutate('cnpj')}
                        inputMode="numeric"
                        placeholder="Somente números"
                       
                      />
                    </div>
                  )}
                  {processo.employment_type === 'mei' && (
                    <div>
                      {/* Não é obrigatória: em branco, o contrato usa a regra
                          fixa de MEI (raiz do CNPJ + nome em caixa alta), que
                          é o que o placeholder mostra. Preencher só quando a
                          razão social real fugir da regra. */}
                      <FieldLabel text="Razão social (MEI)" filled={!!personalDraft.legal_name.trim()} />
                      <Input
                        value={personalDraft.legal_name}
                        onChange={(e) => setPersonalDraft((p) => ({ ...p, legal_name: e.target.value }))}
                        onBlur={() => updatePersonalData.mutate('legal_name')}
                        placeholder={meiLegalName(personalDraft.cnpj, processo.candidates?.name ?? '')}
                       
                      />
                    </div>
                  )}
                  <div>
                    <FieldLabel text="Nacionalidade" filled={!!personalDraft.nationality.trim()} />
                    <NacionalidadeField
                      value={personalDraft.nationality}
                      onChange={(v) => setPersonalDraft((p) => ({ ...p, nationality: v }))}
                      onCommit={(v) => updateSingleField.mutate({ field: 'nationality', value: v })}
                    />
                  </div>
                  <div>
                    <FieldLabel text="Estado civil" filled={!!personalDraft.marital_status.trim()} />
                    <StyledSelect
                      value={personalDraft.marital_status}
                      onChange={(v) => {
                        setPersonalDraft((p) => ({ ...p, marital_status: v }))
                        updateSingleField.mutate({ field: 'marital_status', value: v })
                      }}
                      options={toSelectOptions(MARITAL_STATUS_OPTIONS)}
                      placeholder="Selecionar"
                    />
                  </div>
                  <div>
                    <FieldLabel text="Endereço" filled={!!personalDraft.address.trim()} />
                    <Input
                      value={personalDraft.address}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, address: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('address')}
                     
                    />
                  </div>
                  <div>
                    <FieldLabel text="E-mail" filled={!!personalDraft.email.trim()} />
                    <Input
                      type="email"
                      value={personalDraft.email}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, email: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('email')}
                     
                    />
                  </div>
                  <div>
                    <FieldLabel text="Chave PIX" filled={!!personalDraft.pix_key.trim()} />
                    <Input
                      value={personalDraft.pix_key}
                      onChange={(e) => setPersonalDraft((p) => ({ ...p, pix_key: e.target.value }))}
                      onBlur={() => updatePersonalData.mutate('pix_key')}
                     
                    />
                  </div>
                </div>
              </div>

              {/* Checklist é coisa de CLT (CTPS, PIS, título, escolaridade,
                  ASO). No MEI os documentos viraram campos de texto em
                  20260724000004 e as linhas antigas foram apagadas em
                  20260822000004 — o guard por employment_type impede que
                  qualquer resíduo volte a aparecer no card do parceiro. */}
              {processo.employment_type !== 'mei' && documentRows.length > 0 && (
              <div className="border-t border-border pt-4 space-y-1">
              <h3 className="text-[14px] font-semibold text-foreground mb-2">Checklist de documentos</h3>
              {documentRows.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                  <span className="text-[13px] text-foreground truncate flex-1 min-w-0">{DOCUMENT_CHECKLIST_LABELS[doc.document_type] || doc.document_type}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.file_url ? (
                      <span className="flex items-center">
                        <Button variant="ghost" size="icon-sm" asChild>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver arquivo anexado"
                            aria-label="Ver arquivo anexado"
                            className="text-brand-strong"
                          >
                            <Paperclip />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => updateDocumentFile.mutate({ id: doc.id, url: null })}
                          title="Remover anexo"
                          aria-label="Remover anexo"
                          className="hover:bg-danger-subtle hover:text-danger"
                        >
                          <X />
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => { setUploadTargetDocId(doc.id); documentFileInputRef.current?.click() }}
                        disabled={uploadingDocumentFile && uploadTargetDocId === doc.id}
                        title="Anexar arquivo"
                        aria-label="Anexar arquivo"
                      >
                        <Paperclip />
                      </Button>
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

          <TabsContent value="contrato" className="mt-0">
            <div className="space-y-3">
              {contractRows.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-foreground">{CONTRACT_TYPE_LABELS[c.contract_type]}</p>
                    {c.file_url && (
                      <a
                        href={c.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-medium text-brand-strong hover:underline underline-offset-4 shrink-0"
                      >
                        Abrir contrato
                      </a>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground tabular-nums">Assinatura: {formatCalendarDateBR(c.signature_date)}</p>
                  <p className="text-[12px] text-muted-foreground tabular-nums">Vigência: {formatCalendarDateBR(c.term_start)} — {formatCalendarDateBR(c.term_end)}</p>
                </div>
              ))}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <h3 className="text-[14px] font-semibold text-foreground">Registrar contrato</h3>
                <div>
                  <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Tipo</label>
                  <StyledSelect
                    value={contractForm.contract_type}
                    onChange={(v) => setContractForm({ ...contractForm, contract_type: v as ContractType })}
                    options={(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((tc) => ({ value: tc, label: CONTRACT_TYPE_LABELS[tc] }))}
                    searchable={false}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Assinatura</label>
                    <DateField
                      value={contractForm.signature_date || null}
                      onChange={(v) => setContractForm({ ...contractForm, signature_date: v || '' })}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Início da vigência</label>
                    <DateField
                      value={contractForm.term_start || null}
                      onChange={(v) => setContractForm({ ...contractForm, term_start: v || '' })}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Fim da vigência</label>
                    <DateField
                      value={contractForm.term_end || null}
                      onChange={(v) => setContractForm({ ...contractForm, term_end: v || '' })}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => createContract.mutate()} disabled={createContract.isPending}>
                    {createContract.isPending ? 'Salvando…' : 'Registrar contrato'}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <div className="space-y-2">
              {dpTimeline.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-1">Sem anotações ainda.</p>
              ) : (
                dpTimeline.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                    <p className="text-[13px] text-foreground">{t.note}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">{formatDateBR(t.occurred_at)}</p>
                  </div>
                ))
              )}
              <Textarea
                value={timelineDraft}
                onChange={(e) => setTimelineDraft(e.target.value)}
                rows={3}
                placeholder="Nova anotação…"
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => addTimelineEntry.mutate()}
                  disabled={addTimelineEntry.isPending || !timelineDraft.trim()}
                >
                  {addTimelineEntry.isPending ? 'Salvando…' : 'Adicionar anotação'}
                </Button>
              </div>
            </div>
          </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
