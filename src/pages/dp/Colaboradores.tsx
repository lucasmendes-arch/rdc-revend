import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader, Users, Store as StoreIcon, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/phone'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { DateField } from '@/components/ui/date-field'
import ProcessoDetailModal from '@/components/dp/ProcessoDetailModal'
import { EMPLOYMENT_TYPE_LABELS, isExperienceTagActive, getExperienceInfo, type EmploymentType } from '@/lib/dpConstants'
import type { Processo } from '@/lib/dpTypes'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'

interface Store { id: string; name: string }
interface JobRoleOption { id: string; title: string }

// activated_at é timestamptz, mas gravado sempre à meia-noite UTC (RPC recebe
// só a data, sem hora — ver register_existing_employee). Formatar no fuso
// local do navegador rola a data pra trás em fusos negativos (Brasil, UTC-3):
// meia-noite UTC de 09/07 vira 08/07 21h local. Forçar timeZone: 'UTC' lê de
// volta o mesmo dia que foi gravado, independente do fuso de quem visualiza.
function formatDateBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

// updated_at é timestamp real (trg_employee_processes_sync_status seta
// now() a cada INSERT/UPDATE) — ao contrário de activated_at, tem hora que
// faz sentido de verdade, então formata no fuso local de quem vê (sem UTC).
function formatDateTimeBR(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function AvatarBubble({ name, photoUrl }: { name: string; photoUrl: string | null | undefined }) {
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-surface-alt border border-border flex items-center justify-center">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground">{initials(name)}</span>
      )}
    </div>
  )
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const EMPTY_CREATE_FORM = {
  name: '',
  whatsapp: '',
  role_title: '',
  store_id: '',
  employment_type: 'clt' as EmploymentType,
  activated_at: todayISO(),
}

// Papel de visualização/gestão do colaborador já efetivado — sem
// drag-and-drop de etapas de admissão (isso é o kanban de Contratação).
// A única transição de estado possível aqui é encerrar o vínculo.
export default function DpParceiros() {
  const queryClient = useQueryClient()
  const [storeId, setStoreId] = useState('')
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('')
  const [detailProcesso, setDetailProcesso] = useState<Processo | null>(null)
  const [confirmEncerrar, setConfirmEncerrar] = useState<Processo | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)

  useEscapeToClose(() => setConfirmEncerrar(null), !!confirmEncerrar)
  useEscapeToClose(closeCreate, createOpen)

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['dp-stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as Store[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: jobRoles = [] } = useQuery<JobRoleOption[]>({
    queryKey: ['dp-job-roles-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('job_roles').select('id, title').eq('is_active', true).order('title')
      if (error) throw error
      return (data || []) as JobRoleOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: parceiros = [], isLoading } = useQuery<Processo[]>({
    queryKey: ['dp-parceiros-ativos', storeId, employmentType],
    queryFn: async () => {
      let query = supabase
        .from('employee_processes')
        .select('id, candidate_id, employment_type, store_id, role_title, current_stage, status, started_at, activated_at, onboarding_completed, training_applicable, training_completed, drive_folder_url, experience_renewed_at, created_at, updated_at, candidates(id, name, age, whatsapp, photo_url, assignee_id, source, notes, start_date, due_date, resume_url, candidate_answers(value, form_fields(field_key, label, field_type, show_on_card)), candidate_tags(tags(id, name, color))), stores(name)')
        .eq('status', 'ativo')
        .order('activated_at', { ascending: false })
      if (storeId) query = query.eq('store_id', storeId)
      if (employmentType) query = query.eq('employment_type', employmentType)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Processo[]
    },
  })

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('employee_processes').update({ current_stage: stage }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
      toast.success('Vínculo encerrado')
      setDetailProcesso(null)
      setConfirmEncerrar(null)
    },
    onError: (err) => toast.error(`Erro ao encerrar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Cadastro retroativo — colaborador que já está ativo na empresa e nunca
  // passou pelo funil de recrutamento do RH. A RPC cria por baixo dos panos
  // uma vaga já fechada + um candidato manual só pra reaproveitar toda a
  // estrutura (checklist de documentos, RLS) sem duplicar dado em outro lugar.
  const registerEmployee = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('register_existing_employee', {
        p_name: createForm.name.trim(),
        p_whatsapp: createForm.whatsapp.replace(/\D/g, ''),
        p_role_title: createForm.role_title.trim(),
        p_store_id: createForm.store_id,
        p_employment_type: createForm.employment_type,
        p_activated_at: createForm.activated_at,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
      toast.success('Parceiro cadastrado')
      closeCreate()
    },
    onError: (err) => toast.error(`Erro ao cadastrar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  function openCreate() {
    setCreateForm({ ...EMPTY_CREATE_FORM, store_id: stores[0]?.id ?? '' })
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateForm(EMPTY_CREATE_FORM)
  }

  function handleCreateSave() {
    if (!createForm.name.trim()) { toast.error('Informe o nome'); return }
    if (!createForm.whatsapp.trim()) { toast.error('Informe o WhatsApp'); return }
    if (!createForm.role_title.trim()) { toast.error('Informe o cargo'); return }
    if (!createForm.store_id) { toast.error('Selecione a unidade'); return }
    registerEmployee.mutate()
  }

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Parceiros</h1>
            <p className="text-sm text-muted-foreground mt-1">Parceiros ativos (já efetivados)</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StyledSelect
              variant="inline"
              value={employmentType}
              onChange={(v) => setEmploymentType(v as EmploymentType | '')}
              options={(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((tv) => ({ value: tv, label: EMPLOYMENT_TYPE_LABELS[tv] }))}
              emptyLabel="Todos os vínculos"
              placeholder="Todos os vínculos"
              searchable={false}
            />
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Cadastrar parceiro</span>
            </button>
          </div>
        </div>
        {/* Mesma aba de unidades de src/pages/rh/Candidatos.tsx e
            src/pages/dp/Contratacao.tsx — substitui o dropdown de unidade. */}
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

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando parceiros...</p>
          </div>
        ) : parceiros.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum parceiro ativo encontrado.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Parceiros aparecem aqui assim que efetivados no kanban de Contratação, ou cadastre direto quem já está ativo.
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Cargo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden sm:table-cell">Unidade</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden md:table-cell">Vínculo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden lg:table-cell">Efetivado em</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden lg:table-cell">Fim Experiência</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden xl:table-cell">Última Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {parceiros.map((p, index) => (
                    <tr
                      key={p.id}
                      onClick={() => setDetailProcesso(p)}
                      className={`border-b border-border/40 last:border-0 cursor-pointer hover:bg-surface-alt transition-colors ${index % 2 === 0 ? '' : 'bg-muted/30'}`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        <div className="flex items-center gap-2.5">
                          <AvatarBubble name={p.candidates?.name || '?'} photoUrl={p.candidates?.photo_url} />
                          <span>{p.candidates?.name || 'Candidato removido'}</span>
                          {isExperienceTagActive(p) ? (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 shrink-0"
                              title="Período de experiência em andamento"
                            >
                              {getExperienceInfo(p)?.label}
                            </span>
                          ) : (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 shrink-0"
                              title="Período de experiência concluído"
                            >
                              Ativo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.role_title}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{p.stores?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                        {EMPLOYMENT_TYPE_LABELS[p.employment_type]}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{formatDateBR(p.activated_at)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                        {(() => {
                          const info = getExperienceInfo(p)
                          return info ? info.endDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden xl:table-cell">{formatDateTimeBR(p.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {detailProcesso && (
        <ProcessoDetailModal
          processo={detailProcesso}
          onClose={() => setDetailProcesso(null)}
          estagio={{
            mode: 'ativo',
            onEncerrar: () => setConfirmEncerrar(detailProcesso),
          }}
        />
      )}

      {confirmEncerrar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setConfirmEncerrar(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-1">Encerrar vínculo?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              {confirmEncerrar.candidates?.name} sai da lista de parceiros ativos. O registro é mantido, não é apagado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => updateStage.mutate({ id: confirmEncerrar.id, stage: 'encerrado' })}
                disabled={updateStage.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-70"
              >
                {updateStage.isPending ? 'Encerrando...' : 'Encerrar'}
              </button>
              <button onClick={() => setConfirmEncerrar(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cadastro retroativo de colaborador já ativo (sem passar pelo RH) */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-foreground">Cadastrar parceiro</h2>
              <button onClick={closeCreate} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Para quem já está ativo na empresa e nunca passou pelo funil de recrutamento do RH. Entra direto como parceiro efetivado.
            </p>

            <div className="space-y-4">
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
                  <label className="block text-sm font-medium text-foreground mb-1">WhatsApp *</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    value={createForm.whatsapp}
                    onChange={(e) => setCreateForm({ ...createForm, whatsapp: formatPhone(e.target.value) })}
                    placeholder="(27) 99999-9999"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Cargo *</label>
                  <StyledSelect
                    value={createForm.role_title}
                    onChange={(v) => setCreateForm({ ...createForm, role_title: v })}
                    options={jobRoles.map((r) => ({ value: r.title, label: r.title }))}
                    placeholder="Selecione..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Unidade *</label>
                  <StyledSelect
                    value={createForm.store_id}
                    onChange={(v) => setCreateForm({ ...createForm, store_id: v })}
                    options={stores.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Selecione..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Tipo de vínculo *</label>
                  <StyledSelect
                    value={createForm.employment_type}
                    onChange={(v) => setCreateForm({ ...createForm, employment_type: v as EmploymentType })}
                    options={(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((tv) => ({ value: tv, label: EMPLOYMENT_TYPE_LABELS[tv] }))}
                    searchable={false}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Efetivado desde</label>
                <DateField
                  value={createForm.activated_at}
                  onChange={(v) => setCreateForm({ ...createForm, activated_at: v || todayISO() })}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateSave}
                disabled={registerEmployee.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
              >
                {registerEmployee.isPending ? 'Salvando...' : 'Cadastrar'}
              </button>
              <button onClick={closeCreate} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
