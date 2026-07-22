import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, Plus, IdCard, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import {
  JobRoleFieldsForm,
  EMPTY_JOB_ROLE_FIELDS,
  contractTypeLabel,
  compensationTypeLabel,
  descriptiveRowToFormValue,
  descriptiveFormValueToPayload,
  type JobRoleDescriptiveRow,
} from '@/components/rh/JobRoleFieldsForm'

interface JobRole extends JobRoleDescriptiveRow {
  id: string
  title: string
  education_level: string | null
  color: string
  is_active: boolean
  requires_experience: boolean
  created_at: string
  job_openings: { count: number }[]
}

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  fundamental_incompleto: 'Fundamental incompleto',
  fundamental_completo: 'Fundamental completo',
  medio_incompleto: 'Médio incompleto',
  medio_completo: 'Médio completo',
  superior_incompleto: 'Superior incompleto',
  superior_completo: 'Superior completo',
  pos_graduacao: 'Pós-graduação',
}

const EMPTY_FORM = { title: '', education_level: '', color: '#0D9488', requires_experience: true, ...EMPTY_JOB_ROLE_FIELDS }

function toPayload(form: typeof EMPTY_FORM) {
  return {
    title: form.title.trim(),
    education_level: form.education_level || null,
    color: form.color,
    requires_experience: form.requires_experience,
    ...descriptiveFormValueToPayload(form),
  }
}

export default function RhCargos() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: jobRoles = [], isLoading } = useQuery<JobRole[]>({
    queryKey: ['rh-job-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_roles')
        .select('*, job_openings(count)')
        .order('title')
      if (error) throw error
      return (data || []) as unknown as JobRole[]
    },
    staleTime: 30 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: typeof EMPTY_FORM }) => {
      const data = toPayload(payload)
      if (id) {
        const { error } = await supabase.from('job_roles').update(data).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('job_roles').insert(data)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-job-roles'] })
      toast.success(editingId ? 'Cargo atualizado' : 'Cargo criado')
      closeModal()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('job_roles').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rh-job-roles'] }),
    onError: (err) => toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh-job-roles'] })
      toast.success('Cargo excluído')
      setDeleteConfirm(null)
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      toast.error(msg.includes('foreign key') || msg.includes('violates')
        ? 'Não é possível excluir: existem vagas vinculadas a este cargo. Desative o cargo em vez de excluir.'
        : `Erro ao excluir: ${msg}`)
      setDeleteConfirm(null)
    },
  })

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(role: JobRole) {
    setEditingId(role.id)
    setForm({
      title: role.title,
      education_level: role.education_level || '',
      color: role.color,
      requires_experience: role.requires_experience,
      ...descriptiveRowToFormValue(role),
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSave() {
    if (!form.title.trim()) {
      toast.error('Informe o nome do cargo')
      return
    }
    if (!form.contract_type) {
      toast.error('Selecione o tipo de contrato')
      return
    }
    if (!form.compensation_type) {
      toast.error('Selecione o tipo de remuneração')
      return
    }
    if ((form.compensation_type === 'fixa' || form.compensation_type === 'mista') && !form.fixed_amount) {
      toast.error('Informe o valor fixo')
      return
    }
    if ((form.compensation_type === 'variavel' || form.compensation_type === 'mista') && !form.variable_percentage) {
      toast.error('Informe o percentual variável')
      return
    }
    saveMutation.mutate({ id: editingId, payload: form })
  }

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cargos</h1>
            <p className="text-sm text-muted-foreground mt-1">Catálogo de cargos para preencher vagas automaticamente</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Cargo</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando cargos...</p>
          </div>
        ) : jobRoles.length === 0 ? (
          <div className="text-center py-16">
            <IdCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum cargo cadastrado.</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Cargo" para começar.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Cargo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Contrato</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Remuneração</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Vagas</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Ativo</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {jobRoles.map((role, index) => (
                    <tr key={role.id} className={`border-b border-border/40 last:border-0 ${index % 2 === 0 ? '' : 'bg-muted/30'}`}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                          {role.title}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{contractTypeLabel(role.contract_type)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{compensationTypeLabel(role.compensation_type)}</td>
                      <td className="px-4 py-3 text-sm text-center text-foreground">{role.job_openings?.[0]?.count ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: role.id, is_active: !role.is_active })}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            role.is_active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                          title={role.is_active ? 'Desativar cargo' : 'Reativar cargo'}
                        >
                          {role.is_active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(role)}
                            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(role.id)}
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
                <IdCard className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{editingId ? 'Editar Cargo' : 'Novo Cargo'}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome do cargo *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: Vendedor"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Cor (identifica a vaga no kanban de candidatos)</label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-full h-10 rounded-lg border border-border cursor-pointer"
                />
              </div>

              <JobRoleFieldsForm value={form} onChange={(patch) => setForm({ ...form, ...patch })} />

              {form.contract_type === 'mei' && (
                <label className="flex items-start gap-2 cursor-pointer bg-surface-alt rounded-lg px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.requires_experience}
                    onChange={(e) => setForm({ ...form, requires_experience: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-amber-500 mt-0.5"
                  />
                  <span className="text-sm text-foreground">
                    Exige experiência prévia
                    <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                      Desmarcado = aceita candidato sem experiência, que passa pela trilha de formação MEI no Departamento Pessoal antes da contratação.
                    </span>
                  </span>
                </label>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Grau de Escolaridade (opcional)</label>
                <StyledSelect
                  value={form.education_level}
                  onChange={(v) => setForm({ ...form, education_level: v })}
                  options={Object.entries(EDUCATION_LEVEL_LABELS).map(([k, label]) => ({ value: k, label }))}
                  emptyLabel="Não especificado"
                  placeholder="Não especificado"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
              >
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar Cargo'}
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
              O cargo será removido. Só é possível excluir cargos sem vagas vinculadas — se houver vagas, desative o cargo em vez de excluir.
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
