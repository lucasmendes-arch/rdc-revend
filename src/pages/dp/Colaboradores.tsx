import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Users, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhone } from '@/lib/phone'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, PageTabs, Toolbar, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import StyledSelect from '@/components/ui/styled-select'
import { DateField } from '@/components/ui/date-field'
import ProcessoDetailModal from '@/components/dp/ProcessoDetailModal'
import DistratarParceiroModal from '@/components/dp/DistratarParceiroModal'
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
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          width={32}
          height={32}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-semibold text-muted-foreground">{initials(name)}</span>
      )}
    </div>
  )
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// Sentinela da aba "Todas as unidades" (storeId vazio no estado).
const ALL_STORES = '__all__'

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
        .select('id, candidate_id, employment_type, store_id, role_title, current_stage, status, started_at, activated_at, stage_started_at, due_date, onboarding_completed, training_applicable, training_completed, drive_folder_url, experience_renewed_at, created_at, updated_at, candidates(id, name, age, whatsapp, photo_url, assignee_id, source, notes, start_date, due_date, resume_url, candidate_answers(value, form_fields(field_key, label, field_type, show_on_card)), candidate_tags(tags(id, name, color))), stores(name)')
        .eq('status', 'ativo')
        .order('activated_at', { ascending: false })
      if (storeId) query = query.eq('store_id', storeId)
      if (employmentType) query = query.eq('employment_type', employmentType)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Processo[]
    },
  })

  // Encerramento em si — compartilhado pelos dois caminhos (confirm simples do
  // CLT e popup de distrato do MEI). Quem chama é que decide o toast: o modal
  // de distrato tem mensagem própria (o documento também foi gerado).
  async function encerrarVinculo(id: string) {
    const { error } = await supabase.from('employee_processes').update({ current_stage: 'encerrado' }).eq('id', id)
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: ['dp-parceiros-ativos'] })
    await queryClient.invalidateQueries({ queryKey: ['dp-processos'] })
    setDetailProcesso(null)
    setConfirmEncerrar(null)
  }

  const updateStage = useMutation({
    mutationFn: (id: string) => encerrarVinculo(id),
    onSuccess: () => toast.success('Vínculo encerrado'),
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

  const storeTabs = [
    { key: ALL_STORES, label: 'Todas as unidades' },
    ...stores.map((s) => ({ key: s.id, label: s.name })),
  ]

  return (
    <AdminLayout>
      <AdminPage
        title="Parceiros"
        description="Parceiros ativos (já efetivados)"
        actions={
          <Button onClick={openCreate} aria-label="Cadastrar parceiro">
            <Plus />
            <span className="hidden sm:inline">Cadastrar parceiro</span>
          </Button>
        }
        // Mesma aba de unidades de src/pages/rh/Candidatos.tsx e
        // src/pages/dp/Contratacao.tsx.
        tabs={
          <PageTabs
            items={storeTabs}
            value={storeId || ALL_STORES}
            onChange={(k) => setStoreId(k === ALL_STORES ? '' : k)}
          />
        }
        toolbar={
          <Toolbar>
            <StyledSelect
              className="w-full sm:w-56"
              value={employmentType}
              onChange={(v) => setEmploymentType(v as EmploymentType | '')}
              options={(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((tv) => ({ value: tv, label: EMPLOYMENT_TYPE_LABELS[tv] }))}
              emptyLabel="Todos os vínculos"
              placeholder="Todos os vínculos"
              searchable={false}
            />
          </Toolbar>
        }
      >
        {isLoading ? (
          <PageLoading label="Carregando parceiros…" />
        ) : parceiros.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Users}
              title="Nenhum parceiro ativo encontrado"
              description="Parceiros aparecem aqui assim que efetivados no kanban de Contratação, ou cadastre direto quem já está ativo."
              action={<Button variant="secondary" onClick={openCreate}><Plus />Cadastrar parceiro</Button>}
            />
          </Panel>
        ) : (
          <Panel flush className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Cargo</th>
                    <th className="hidden sm:table-cell">Unidade</th>
                    <th className="hidden md:table-cell">Vínculo</th>
                    <th className="hidden lg:table-cell">Efetivado em</th>
                    <th className="hidden lg:table-cell">Fim da experiência</th>
                    <th className="hidden xl:table-cell">Última atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {parceiros.map((p) => (
                    <tr key={p.id} onClick={() => setDetailProcesso(p)} className="cursor-pointer">
                      <td>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBubble name={p.candidates?.name || '?'} photoUrl={p.candidates?.photo_url} />
                          <span className="font-medium text-foreground truncate">{p.candidates?.name || 'Candidato removido'}</span>
                          {isExperienceTagActive(p) ? (
                            <Badge variant="info" className="shrink-0" title="Período de experiência em andamento">
                              {getExperienceInfo(p)?.label}
                            </Badge>
                          ) : (
                            <Badge variant="success" className="shrink-0" title="Período de experiência concluído">
                              Ativo
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-muted-foreground">{p.role_title}</td>
                      <td className="text-muted-foreground hidden sm:table-cell">{p.stores?.name || '—'}</td>
                      <td className="text-muted-foreground hidden md:table-cell">{EMPLOYMENT_TYPE_LABELS[p.employment_type]}</td>
                      <td className="text-muted-foreground hidden lg:table-cell">{formatDateBR(p.activated_at)}</td>
                      <td className="text-muted-foreground hidden lg:table-cell">
                        {(() => {
                          const info = getExperienceInfo(p)
                          return info ? info.endDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
                        })()}
                      </td>
                      <td className="text-muted-foreground hidden xl:table-cell">{formatDateTimeBR(p.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </AdminPage>

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

      {/* MEI assina o Distrato do Contrato de Parceria ao sair — o popup junta
          os dados do documento, gera e só então encerra. CLT segue no confirm
          simples (não há template de rescisão CLT no sistema). */}
      {confirmEncerrar && confirmEncerrar.employment_type === 'mei' && (
        <DistratarParceiroModal
          processo={confirmEncerrar}
          onConfirmEncerrar={() => encerrarVinculo(confirmEncerrar.id)}
          onClose={() => setConfirmEncerrar(null)}
        />
      )}

      {confirmEncerrar && confirmEncerrar.employment_type !== 'mei' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dp-encerrar-vinculo-title">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-in fade-in-0" onClick={() => setConfirmEncerrar(null)} />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-popover p-5 shadow-xl animate-in fade-in-0 zoom-in-[0.98] duration-150">
            <h2 id="dp-encerrar-vinculo-title" className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">Encerrar vínculo?</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {confirmEncerrar.candidates?.name} sai da lista de parceiros ativos. O registro é mantido, não é apagado.
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmEncerrar(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => updateStage.mutate(confirmEncerrar.id)}
                disabled={updateStage.isPending}
              >
                {updateStage.isPending ? 'Encerrando…' : 'Encerrar vínculo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cadastro retroativo de colaborador já ativo (sem passar pelo RH) */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dp-cadastrar-title">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-in fade-in-0" onClick={closeCreate} />
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-popover p-5 shadow-xl animate-in fade-in-0 zoom-in-[0.98] duration-150">
            <div className="pr-8">
              <h2 id="dp-cadastrar-title" className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">Cadastrar parceiro</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Para quem já está ativo na empresa e nunca passou pelo funil de recrutamento do RH. Entra direto como parceiro efetivado.
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={closeCreate} aria-label="Fechar" className="absolute right-3 top-3">
              <X />
            </Button>

            <div className="mt-5 space-y-4">
              <div>
                <label className="field-label" htmlFor="dp-create-name">Nome <span className="text-danger">*</span></label>
                <Input
                  id="dp-create-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="dp-create-whatsapp">WhatsApp <span className="text-danger">*</span></label>
                  <Input
                    id="dp-create-whatsapp"
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    value={createForm.whatsapp}
                    onChange={(e) => setCreateForm({ ...createForm, whatsapp: formatPhone(e.target.value) })}
                    placeholder="(27) 99999-9999"
                  />
                </div>
                <div>
                  <label className="field-label">Cargo <span className="text-danger">*</span></label>
                  <StyledSelect
                    value={createForm.role_title}
                    onChange={(v) => setCreateForm({ ...createForm, role_title: v })}
                    options={jobRoles.map((r) => ({ value: r.title, label: r.title }))}
                    placeholder="Selecionar"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Unidade <span className="text-danger">*</span></label>
                  <StyledSelect
                    value={createForm.store_id}
                    onChange={(v) => setCreateForm({ ...createForm, store_id: v })}
                    options={stores.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Selecionar"
                  />
                </div>
                <div>
                  <label className="field-label">Tipo de vínculo <span className="text-danger">*</span></label>
                  <StyledSelect
                    value={createForm.employment_type}
                    onChange={(v) => setCreateForm({ ...createForm, employment_type: v as EmploymentType })}
                    options={(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((tv) => ({ value: tv, label: EMPLOYMENT_TYPE_LABELS[tv] }))}
                    searchable={false}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Efetivado desde</label>
                <DateField
                  value={createForm.activated_at}
                  onChange={(v) => setCreateForm({ ...createForm, activated_at: v || todayISO() })}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="secondary" onClick={closeCreate}>Cancelar</Button>
              <Button onClick={handleCreateSave} disabled={registerEmployee.isPending}>
                {registerEmployee.isPending ? 'Salvando…' : 'Cadastrar parceiro'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
