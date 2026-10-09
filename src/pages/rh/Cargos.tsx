import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { Plus, IdCard, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
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

  useEscapeToClose(closeModal, modalOpen)
  useEscapeToClose(() => setDeleteConfirm(null), !!deleteConfirm)

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
      <AdminPage
        title="Cargos"
        description="Catálogo de cargos para preencher vagas automaticamente"
        actions={
          <Button onClick={openCreate} aria-label="Novo cargo">
            <Plus />
            <span className="hidden sm:inline">Novo cargo</span>
          </Button>
        }
      >
        {isLoading ? (
          <PageLoading label="Carregando cargos…" />
        ) : jobRoles.length === 0 ? (
          <Panel>
            <EmptyState
              icon={IdCard}
              title="Nenhum cargo cadastrado"
              description="Cadastre um cargo para preencher vagas automaticamente."
              action={<Button onClick={openCreate}><Plus />Novo cargo</Button>}
            />
          </Panel>
        ) : (
          <Panel flush className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th>Contrato</th>
                    <th>Remuneração</th>
                    <th className="!text-right">Vagas</th>
                    <th className="!text-center">Ativo</th>
                    <th className="!text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {jobRoles.map((role) => (
                    <tr key={role.id}>
                      <td className="font-medium text-foreground">
                        <span className="inline-flex items-center gap-2 min-w-[140px]">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                          {role.title}
                        </span>
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap">{contractTypeLabel(role.contract_type)}</td>
                      <td className="text-muted-foreground whitespace-nowrap">{compensationTypeLabel(role.compensation_type)}</td>
                      <td className="text-right tabular-nums text-foreground">{role.job_openings?.[0]?.count ?? 0}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleActiveMutation.mutate({ id: role.id, is_active: !role.is_active })}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={role.is_active ? 'Desativar cargo' : 'Reativar cargo'}
                        >
                          <Badge variant={role.is_active ? 'success' : 'neutral'} dot className="cursor-pointer">
                            {role.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </button>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(role)} title="Editar" aria-label="Editar cargo">
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteConfirm(role.id)}
                            className="hover:bg-danger-subtle hover:text-danger"
                            title="Excluir"
                            aria-label="Excluir cargo"
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
              <h2 className="text-[16px] font-semibold text-foreground">{editingId ? 'Editar cargo' : 'Novo cargo'}</h2>
              <Button variant="ghost" size="icon-sm" onClick={closeModal} aria-label="Fechar">
                <X />
              </Button>
            </div>

            <div className="space-y-4 px-5 pb-5 overflow-y-auto">
              <div>
                <label className="field-label">Nome do cargo *</label>
                <Input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Vendedor"
                />
              </div>

              <div>
                <label className="field-label">Cor (identifica a vaga no kanban de candidatos)</label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background p-1 cursor-pointer"
                />
              </div>

              <JobRoleFieldsForm value={form} onChange={(patch) => setForm({ ...form, ...patch })} />

              {form.contract_type === 'mei' && (
                <label className="flex items-start gap-2.5 cursor-pointer rounded-md border border-border bg-surface px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.requires_experience}
                    onChange={(e) => setForm({ ...form, requires_experience: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-ink-900 mt-0.5"
                  />
                  <span className="text-[13px] text-foreground">
                    Exige experiência prévia
                    <span className="block text-[12px] text-muted-foreground font-normal mt-0.5">
                      Desmarcado = aceita candidato sem experiência, que passa pela trilha de formação MEI no Departamento Pessoal antes da contratação.
                    </span>
                  </span>
                </label>
              )}

              <div>
                <label className="field-label">Grau de escolaridade (opcional)</label>
                <StyledSelect
                  value={form.education_level}
                  onChange={(v) => setForm({ ...form, education_level: v })}
                  options={Object.entries(EDUCATION_LEVEL_LABELS).map(([k, label]) => ({ value: k, label }))}
                  emptyLabel="Não especificado"
                  placeholder="Não especificado"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar cargo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-popover border border-border rounded-xl shadow-xl p-5 w-full max-w-sm">
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Excluir cargo?</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              O cargo será removido. Só é possível excluir cargos sem vagas vinculadas — se houver vagas, desative o cargo em vez de excluir.
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
