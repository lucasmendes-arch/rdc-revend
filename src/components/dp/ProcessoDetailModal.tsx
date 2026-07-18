import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Phone, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useImageUpload } from '@/hooks/useImageUpload'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  EMPLOYMENT_TYPE_LABELS, DOCUMENT_CHECKLIST_LABELS, DOCUMENT_STATUS_LABELS, CONTRACT_TYPE_LABELS,
  type DocumentStatus, type ContractType, type StageColumn,
} from '@/lib/dpConstants'
import type { Processo, TimelineEntry, DocumentRow, ContractRow } from '@/lib/dpTypes'

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
  const photoInputRef = useRef<HTMLInputElement>(null)
  const { upload: uploadPhoto, uploading: uploadingPhoto } = useImageUpload()

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
        .select('id, document_type, status')
        .eq('process_id', processo.id)
        .order('document_type')
      if (error) throw error
      return (data || []) as DocumentRow[]
    },
  })

  const { data: contractRows = [] } = useQuery<ContractRow[]>({
    queryKey: ['dp-contracts', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contracts')
        .select('id, contract_type, signature_date, term_start, term_end')
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dp-processos'] }),
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
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
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

        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="recrutamento">Recrutamento</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="contrato">Contrato</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="estagio">Estágio</TabsTrigger>
          </TabsList>

          <TabsContent value="recrutamento">
            {rhTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem histórico de recrutamento.</p>
            ) : (
              <div className="space-y-2 py-2">
                {rhTimeline.map((t) => (
                  <div key={t.id} className="text-sm bg-surface-alt rounded-lg p-2.5">
                    <p className="text-foreground">{t.note}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDateBR(t.occurred_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documentos">
            <div className="space-y-1.5 py-2">
              {documentRows.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-sm text-foreground truncate">{DOCUMENT_CHECKLIST_LABELS[doc.document_type] || doc.document_type}</span>
                  <select
                    value={doc.status}
                    onChange={(e) => updateDocumentStatus.mutate({ id: doc.id, status: e.target.value as DocumentStatus })}
                    className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
                  >
                    {(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map((s) => (
                      <option key={s} value={s}>{DOCUMENT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                disabled
                title="Disponível na próxima etapa"
                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground opacity-50 cursor-not-allowed"
              >
                Anexar arquivo (em breve)
              </button>

              <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase">Checklist adicional</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={processo.onboarding_completed}
                    onChange={(e) => updateChecklist.mutate({ onboarding_completed: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-green-600"
                  />
                  <span className="text-sm text-foreground">Onboarding institucional concluído</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={processo.training_applicable}
                    onChange={(e) => updateChecklist.mutate({ training_applicable: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-amber-500"
                  />
                  <span className="text-sm text-foreground">Treinamento técnico aplicável a este cargo</span>
                </label>
                {processo.training_applicable && (
                  <label className="flex items-center gap-2 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={processo.training_completed}
                      onChange={(e) => updateChecklist.mutate({ training_completed: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-green-600"
                    />
                    <span className="text-sm text-foreground">Treinamento concluído</span>
                  </label>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contrato">
            <div className="space-y-3 py-2">
              {contractRows.map((c) => (
                <div key={c.id} className="text-sm bg-surface-alt rounded-lg p-2.5 space-y-0.5">
                  <p className="font-medium text-foreground">{CONTRACT_TYPE_LABELS[c.contract_type]}</p>
                  <p className="text-[11px] text-muted-foreground">Assinatura: {formatDateBR(c.signature_date)}</p>
                  <p className="text-[11px] text-muted-foreground">Vigência: {formatDateBR(c.term_start)} — {formatDateBR(c.term_end)}</p>
                </div>
              ))}
              <div className="border border-border rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Registrar contrato</p>
                <select
                  value={contractForm.contract_type}
                  onChange={(e) => setContractForm({ ...contractForm, contract_type: e.target.value as ContractType })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((tc) => (
                    <option key={tc} value={tc}>{CONTRACT_TYPE_LABELS[tc]}</option>
                  ))}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Assinatura</label>
                    <input type="date" value={contractForm.signature_date}
                      onChange={(e) => setContractForm({ ...contractForm, signature_date: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Início vigência</label>
                    <input type="date" value={contractForm.term_start}
                      onChange={(e) => setContractForm({ ...contractForm, term_start: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Fim vigência</label>
                    <input type="date" value={contractForm.term_end}
                      onChange={(e) => setContractForm({ ...contractForm, term_end: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
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

          <TabsContent value="estagio">
            {estagio.mode === 'kanban' ? (
              <div className="py-2 space-y-2">
                <label className="block text-sm font-medium text-foreground mb-1">Etapa atual</label>
                <select
                  value={processo.current_stage}
                  onChange={(e) => estagio.onChangeStage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {estagio.columns.map((col) => (
                    <option key={col.stage} value={col.stage}>{col.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">Alternativa ao arrastar no kanban — útil no mobile.</p>
              </div>
            ) : (
              <div className="py-2 space-y-3">
                <p className="text-sm text-foreground">
                  Efetivado em <span className="font-medium">{formatDateBR(processo.activated_at)}</span>
                </p>
                <button
                  onClick={estagio.onEncerrar}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                >
                  Encerrar vínculo
                </button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
