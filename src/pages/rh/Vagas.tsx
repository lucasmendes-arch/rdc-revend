import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { Plus, Briefcase, Pencil, Trash2, Store as StoreIcon, Link2, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AdminPage, PageTabs, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import {
  JobRoleFieldsForm,
  EMPTY_JOB_ROLE_FIELDS,
  JOB_ROLE_DESCRIPTIVE_FIELDS_SELECT,
  descriptiveRowToFormValue,
  descriptiveFormValueToPayload,
  type JobRoleDescriptiveRow,
} from '@/components/rh/JobRoleFieldsForm'

interface Store {
  id: string
  name: string
}

interface JobRoleOption extends JobRoleDescriptiveRow {
  id: string
  title: string
}

interface JobOpening extends JobRoleDescriptiveRow {
  id: string
  store_id: string
  role_title: string
  job_role_id: string | null
  status: 'aberta' | 'fechada'
  created_at: string
  stores: { name: string; slug: string } | null
  candidates: { count: number }[]
}

const EMPTY_FORM = { store_id: '', role_title: '', job_role_id: '', ...EMPTY_JOB_ROLE_FIELDS }

function toPayload(form: typeof EMPTY_FORM) {
  return {
    store_id: form.store_id,
    role_title: form.role_title.trim(),
    job_role_id: form.job_role_id || null,
    ...descriptiveFormValueToPayload(form),
  }
}

export default function RhVagas() {
  const queryClient = useQueryClient()
  const [storeId, setStoreId] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEscapeToClose(closeModal, modalOpen)
  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['rh-stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as Store[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: jobOpenings = [], isLoading } = useQuery<JobOpening[]>({
    queryKey: ['rh-job-openings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_openings')
        .select(`id, store_id, role_title, job_role_id, status, created_at, stores(name, slug), candidates(count), ${JOB_ROLE_DESCRIPTIVE_FIELDS_SELECT}`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as JobOpening[]
    },
    staleTime: 30 * 1000,
  })

  const { data: jobRoles = [] } = useQuery<JobRoleOption[]>({
    queryKey: ['rh-job-roles-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_roles')
        .select(`id, title, ${JOB_ROLE_DESCRIPTIVE_FIELDS_SELECT}`)
        .eq('is_active', true)
        .order('title')
      if (error) throw error
      return (data || []) as unknown as JobRoleOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Toda lista de vagas do RH usa o prefixo ['rh-job-openings', ...] — a de
  // Candidatos é ['rh-job-openings', 'by-store'|'all', ...]. Invalidar só o
  // prefixo cobre todas de uma vez (inclusive as desmontadas, que refazem o
  // fetch ao montar); sem isso a vaga nova só aparecia no cadastro de
  // candidato depois de recarregar a página. 'rh-job-roles' entra porque a
  // tela Cargos mostra a contagem de vagas por cargo.
  function invalidateJobOpenings() {
    queryClient.invalidateQueries({ queryKey: ['rh-job-openings'] })
    queryClient.invalidateQueries({ queryKey: ['rh-job-roles'] })
  }

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: typeof EMPTY_FORM }) => {
      const data = toPayload(payload)
      if (id) {
        const { error } = await supabase.from('job_openings').update(data).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('job_openings').insert(data)
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidateJobOpenings()
      toast.success(editingId ? 'Vaga atualizada' : 'Vaga criada')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'aberta' | 'fechada' }) => {
      const { error } = await supabase.from('job_openings').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateJobOpenings(),
    onError: (err) => toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_openings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateJobOpenings()
      toast.success('Vaga excluída')
      setDeleteConfirm(null)
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      toast.error(msg.includes('foreign key') || msg.includes('violates')
        ? 'Não é possível excluir: existem candidatos vinculados a esta vaga. Feche a vaga em vez de excluir.'
        : `Erro ao excluir: ${msg}`)
      setDeleteConfirm(null)
    },
  })

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, store_id: stores[0]?.id ?? '' })
    setModalOpen(true)
  }

  function openEdit(job: JobOpening) {
    setEditingId(job.id)
    setForm({
      store_id: job.store_id,
      role_title: job.role_title,
      job_role_id: job.job_role_id || '',
      ...descriptiveRowToFormValue(job),
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSelectRole(roleId: string) {
    const role = jobRoles.find((r) => r.id === roleId)
    if (!role) {
      setForm({ ...form, job_role_id: '' })
      return
    }
    setForm({
      ...form,
      job_role_id: role.id,
      role_title: role.title,
      ...descriptiveRowToFormValue(role),
    })
  }

  function copyAdLink(job: JobOpening) {
    if (!job.stores?.slug) {
      toast.error('Unidade sem slug cadastrado')
      return
    }
    const url = `${window.location.origin}/candidatura/${job.stores.slug}?vaga=${job.id}`
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Link do anúncio copiado'))
      .catch(() => toast.error('Não foi possível copiar o link'))
  }

  function handleSave() {
    if (!form.store_id) {
      toast.error('Selecione a unidade')
      return
    }
    if (!form.role_title.trim()) {
      toast.error('Informe o cargo')
      return
    }
    saveMutation.mutate({ id: editingId, payload: form })
  }

  const filteredJobOpenings = storeId ? jobOpenings.filter((j) => j.store_id === storeId) : jobOpenings

  const storeTabs = [
    { key: '', label: 'Todas as unidades', icon: StoreIcon },
    ...stores.map((s) => ({ key: s.id, label: s.name })),
  ]

  return (
    <AdminLayout>
      <AdminPage
        title="Vagas"
        description="Cadastro de vagas por unidade"
        actions={
          <Button onClick={openCreate} disabled={stores.length === 0} aria-label="Nova vaga">
            <Plus />
            <span className="hidden sm:inline">Nova vaga</span>
          </Button>
        }
        tabs={<PageTabs items={storeTabs} value={storeId} onChange={setStoreId} />}
      >
        {isLoading ? (
          <PageLoading label="Carregando vagas…" />
        ) : filteredJobOpenings.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Briefcase}
              title={jobOpenings.length === 0 ? 'Nenhuma vaga cadastrada' : 'Nenhuma vaga nesta unidade'}
              description="Cadastre uma vaga para começar a receber candidaturas."
              action={
                stores.length > 0 ? (
                  <Button onClick={openCreate}><Plus />Nova vaga</Button>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <Panel flush className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th>Unidade</th>
                    <th className="!text-right">Candidatos</th>
                    <th className="!text-center">Status</th>
                    <th className="!text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobOpenings.map((job) => (
                    <tr key={job.id}>
                      <td className="font-medium text-foreground">
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <span>{job.role_title}</span>
                          {/* A coluna mostra `role_title`, que é texto livre — sem
                              esse badge uma vaga preenchida manualmente fica
                              idêntica a uma vinculada ao catálogo, escondendo que
                              ela não tem descrição nem dispara as perguntas
                              restritas a cargo no formulário público. */}
                          {!job.job_role_id && (
                            <Badge
                              variant="warning"
                              className="whitespace-nowrap"
                              title="Vaga preenchida manualmente, sem vínculo com o catálogo de cargos: fica sem descrição no formulário público e as perguntas restritas a um cargo (ex: Currículo) não aparecem pro candidato."
                            >
                              Sem cargo
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap">{job.stores?.name || '—'}</td>
                      <td className="text-right tabular-nums text-foreground">{job.candidates?.[0]?.count ?? 0}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleStatusMutation.mutate({ id: job.id, status: job.status === 'aberta' ? 'fechada' : 'aberta' })}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={job.status === 'aberta' ? 'Fechar vaga' : 'Reabrir vaga'}
                        >
                          <Badge variant={job.status === 'aberta' ? 'success' : 'neutral'} dot className="cursor-pointer">
                            {job.status === 'aberta' ? 'Aberta' : 'Fechada'}
                          </Badge>
                        </button>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => copyAdLink(job)}
                            title="Copiar link do anúncio (com tracking da vaga)"
                            aria-label="Copiar link do anúncio"
                          >
                            <Link2 />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(job)} title="Editar" aria-label="Editar vaga">
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteConfirm(job.id)}
                            className="hover:bg-danger-subtle hover:text-danger"
                            title="Excluir"
                            aria-label="Excluir vaga"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </AdminPage>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-popover rounded-xl shadow-xl border border-border w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
              <h2 className="text-[16px] font-semibold text-foreground">{editingId ? 'Editar vaga' : 'Nova vaga'}</h2>
              <Button variant="ghost" size="icon-sm" onClick={closeModal} aria-label="Fechar">
                <X />
              </Button>
            </div>

            <div className="space-y-4 px-5 pb-5 overflow-y-auto">
              <div>
                <label className="field-label">Unidade *</label>
                <StyledSelect
                  value={form.store_id}
                  onChange={(v) => setForm({ ...form, store_id: v })}
                  options={stores.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Selecione a unidade"
                />
              </div>

              <div>
                <label className="field-label">Cargo (catálogo)</label>
                <StyledSelect
                  value={form.job_role_id}
                  onChange={handleSelectRole}
                  options={jobRoles.map((r) => ({ value: r.id, label: r.title }))}
                  emptyLabel="Preencher manualmente"
                  placeholder="Preencher manualmente"
                />
                <p className="text-[12px] text-muted-foreground mt-1.5">Selecionar um cargo preenche os campos abaixo — dá pra ajustar depois.</p>
                {!form.job_role_id && (
                  <p className="text-[12px] text-warning mt-1.5 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      Sem cargo do catálogo, o formulário público mostra a vaga sem descrição e esconde as perguntas
                      restritas a um cargo (ex: Currículo).
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="field-label">Título da vaga *</label>
                <Input
                  type="text"
                  value={form.role_title}
                  onChange={(e) => setForm({ ...form, role_title: e.target.value })}
                  placeholder="Ex: Aux. Administrativo"
                />
              </div>

              <JobRoleFieldsForm value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar vaga'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Excluir vaga?</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              A vaga será removida. Só é possível excluir vagas sem candidatos vinculados — se houver candidatos, feche a vaga em vez de excluir.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
