import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { Loader, Plus, Briefcase, Pencil, Trash2, Store as StoreIcon } from 'lucide-react'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
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
  stores: { name: string } | null
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
        .select(`id, store_id, role_title, job_role_id, status, created_at, stores(name), candidates(count), ${JOB_ROLE_DESCRIPTIVE_FIELDS_SELECT}`)
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

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Vagas</h1>
            <p className="text-sm text-muted-foreground mt-1">Cadastro de vagas por unidade</p>
          </div>
          <button
            onClick={openCreate}
            disabled={stores.length === 0}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Vaga</span>
          </button>
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

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando vagas...</p>
          </div>
        ) : filteredJobOpenings.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">
              {jobOpenings.length === 0 ? 'Nenhuma vaga cadastrada.' : 'Nenhuma vaga cadastrada nesta unidade.'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Nova Vaga" para começar.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Cargo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Unidade</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Candidatos</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobOpenings.map((job, index) => (
                    <tr key={job.id} className={`border-b border-border/40 last:border-0 ${index % 2 === 0 ? '' : 'bg-muted/30'}`}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{job.role_title}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{job.stores?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-center text-foreground">{job.candidates?.[0]?.count ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleStatusMutation.mutate({ id: job.id, status: job.status === 'aberta' ? 'fechada' : 'aberta' })}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            job.status === 'aberta'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                          title={job.status === 'aberta' ? 'Fechar vaga' : 'Reabrir vaga'}
                        >
                          {job.status === 'aberta' ? 'Aberta' : 'Fechada'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(job)}
                            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(job.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{editingId ? 'Editar Vaga' : 'Nova Vaga'}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Unidade *</label>
                <StyledSelect
                  value={form.store_id}
                  onChange={(v) => setForm({ ...form, store_id: v })}
                  options={stores.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Selecione a unidade"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Cargo (catálogo)</label>
                <StyledSelect
                  value={form.job_role_id}
                  onChange={handleSelectRole}
                  options={jobRoles.map((r) => ({ value: r.id, label: r.title }))}
                  emptyLabel="Preencher manualmente"
                  placeholder="Preencher manualmente"
                />
                <p className="text-xs text-muted-foreground mt-1">Selecionar um cargo preenche os campos abaixo — dá pra ajustar depois.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Título da vaga *</label>
                <input
                  type="text"
                  value={form.role_title}
                  onChange={(e) => setForm({ ...form, role_title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: Aux. Administrativo"
                />
              </div>

              <JobRoleFieldsForm value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
              >
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar Vaga'}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Confirmar exclusão</h2>
            <p className="text-sm text-muted-foreground mb-5">
              A vaga será removida. Só é possível excluir vagas sem candidatos vinculados — se houver candidatos, feche a vaga em vez de excluir.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {deleteMutation.isPending ? 'Removendo...' : 'Excluir'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
