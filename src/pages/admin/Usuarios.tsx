import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { Loader, Plus, UserPlus, ShieldCheck, Store } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

interface SystemUser {
  id: string
  role: string
  full_name: string | null
  email: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  salao: 'Salão',
}

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  salao: 'bg-amber-100 text-amber-700',
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck className="w-3.5 h-3.5" />,
  salao: <Store className="w-3.5 h-3.5" />,
}

export default function AdminUsuarios() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', role: 'salao' })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-system-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_system_users')
      if (error) throw error
      return (data || []) as SystemUser[]
    },
    staleTime: 60 * 1000,
  })

  const createUserMutation = useMutation({
    mutationFn: async (form: { email: string; password: string; role: string }) => {
      return callEdgeFunction('create-user', form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-users'] })
      setCreating(false)
      setCreateForm({ email: '', password: '', role: 'salao' })
      alert('Usuário criado com sucesso!')
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-users'] })
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const handleCreate = () => {
    if (!createForm.email || !createForm.password) {
      alert('Email e senha são obrigatórios')
      return
    }
    if (createForm.password.length < 6) {
      alert('Senha deve ter pelo menos 6 caracteres')
      return
    }
    createUserMutation.mutate(createForm)
  }

  const adminUsers = users.filter(u => u.role === 'admin')
  const salaoUsers = users.filter(u => u.role === 'salao')

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Usuários do Sistema</h1>
            <p className="text-sm text-muted-foreground mt-1">Admins e operadores de salão</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Usuário</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-6">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <>
            {/* Salão section */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Store className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-foreground">Operadores de Salão</h2>
                <span className="text-xs text-muted-foreground">({salaoUsers.length})</span>
              </div>
              {salaoUsers.length === 0 ? (
                <div className="bg-white rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum operador cadastrado.
                </div>
              ) : (
                <UserTable users={salaoUsers} onRoleChange={(id, role) => updateRoleMutation.mutate({ id, role })} isPending={updateRoleMutation.isPending} />
              )}
            </section>

            {/* Admin section */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm font-bold text-foreground">Administradores</h2>
                <span className="text-xs text-muted-foreground">({adminUsers.length})</span>
              </div>
              {adminUsers.length === 0 ? (
                <div className="bg-white rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum admin cadastrado.
                </div>
              ) : (
                <UserTable users={adminUsers} onRoleChange={(id, role) => updateRoleMutation.mutate({ id, role })} isPending={updateRoleMutation.isPending} />
              )}
            </section>
          </>
        )}
      </div>

      {/* Create User Dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Novo Usuário</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tipo de acesso</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['salao', 'admin'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, role: r })}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        createForm.role === r
                          ? r === 'admin'
                            ? 'bg-purple-100 text-purple-700 border-purple-300'
                            : 'bg-amber-100 text-amber-700 border-amber-300'
                          : 'bg-white text-muted-foreground border-border hover:bg-surface-alt'
                      }`}
                    >
                      {ROLE_ICONS[r]}
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">E-mail *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="usuario@email.com"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Senha *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={createUserMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-foreground font-medium hover:bg-surface-alt"
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

function UserTable({
  users,
  onRoleChange,
  isPending,
}: {
  users: SystemUser[]
  onRoleChange: (id: string, role: string) => void
  isPending: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-alt">
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome / E-mail</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acesso</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criado em</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr key={user.id} className={`border-b border-border/50 last:border-0 ${index % 2 === 0 ? '' : 'bg-surface-alt/30'}`}>
              <td className="px-4 py-3">
                <p className="font-semibold text-sm text-foreground">{user.full_name || '—'}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </td>
              <td className="px-4 py-3 text-center">
                <select
                  value={user.role}
                  onChange={(e) => onRoleChange(user.id, e.target.value)}
                  disabled={isPending}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-50 ${ROLE_STYLES[user.role] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  <option value="salao">Salão</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                {new Date(user.created_at).toLocaleDateString('pt-BR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
