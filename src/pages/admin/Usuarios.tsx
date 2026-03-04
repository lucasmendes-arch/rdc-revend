import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { Loader, Plus, UserPlus } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

interface UserProfile {
  id: string
  role: string
  created_at: string
  email?: string
}

export default function AdminUsuarios() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', role: 'user' })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as UserProfile[]
    },
    staleTime: 60 * 1000,
  })

  const createUserMutation = useMutation({
    mutationFn: async (form: { email: string; password: string; role: string }) => {
      return callEdgeFunction('create-user', form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setCreating(false)
      setCreateForm({ email: '', password: '', role: 'user' })
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
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
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

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Usuários</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie os acessos ao sistema</p>
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

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando usuários...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">ID</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Role</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => (
                    <tr key={user.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                      <td className="px-4 py-3 text-sm">
                        <p className="font-medium text-foreground">{user.email || user.id.slice(0, 12) + '...'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <select
                          value={user.role}
                          onChange={(e) => updateRoleMutation.mutate({ id: user.id, role: e.target.value })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border-0 cursor-pointer ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          <option value="user">Usuário</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Novo Usuário</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">E-mail *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="usuario@email.com"
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

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Permissão</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Admin</option>
                </select>
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

            <p className="text-xs text-muted-foreground text-center mt-4">
              Requer Edge Function "create-user" configurada no Supabase
            </p>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
