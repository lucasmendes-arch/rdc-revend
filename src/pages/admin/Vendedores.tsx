import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, Plus, UserCheck, Pencil, Trash2, Star } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

interface Seller {
  id: string
  name: string
  code: string | null
  email: string | null
  phone: string | null
  commission_pct: number
  is_default: boolean
  active: boolean
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  code: '',
  email: '',
  phone: '',
  commission_pct: 0,
  is_default: false,
  active: true,
}

type SellerForm = typeof EMPTY_FORM

export default function AdminVendedores() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SellerForm>(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sellers')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as Seller[]
    },
    staleTime: 30 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: SellerForm }) => {
      const data = {
        name: payload.name.trim(),
        code: payload.code.trim() || null,
        email: payload.email.trim() || null,
        phone: payload.phone.trim() || null,
        commission_pct: payload.commission_pct,
        is_default: payload.is_default,
        active: payload.active,
      }
      if (id) {
        const { error } = await supabase.from('sellers').update(data).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('sellers').insert(data)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
      closeModal()
    },
    onError: (err) => {
      alert(`Erro ao salvar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sellers')
        .update({ is_default: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('sellers').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sellers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
      setDeleteConfirm(null)
    },
    onError: (err) => {
      alert(`Erro ao deletar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(seller: Seller) {
    setEditingId(seller.id)
    setForm({
      name: seller.name,
      code: seller.code ?? '',
      email: seller.email ?? '',
      phone: seller.phone ?? '',
      commission_pct: seller.commission_pct,
      is_default: seller.is_default,
      active: seller.active,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSave() {
    if (!form.name.trim()) {
      alert('Nome é obrigatório')
      return
    }
    const pct = Number(form.commission_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      alert('Comissão deve ser entre 0 e 100')
      return
    }
    saveMutation.mutate({ id: editingId, payload: { ...form, commission_pct: pct } })
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Vendedores</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie a equipe de vendas e comissões</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Vendedor</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando vendedores...</p>
          </div>
        ) : sellers.length === 0 ? (
          <div className="text-center py-16">
            <UserCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum vendedor cadastrado.</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Vendedor" para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Código</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden md:table-cell">Telefone</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Comissão</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Ativo</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Padrão</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller, index) => (
                    <tr key={seller.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{seller.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {seller.code ? (
                          <span className="px-2 py-0.5 rounded-md bg-surface-alt text-xs font-mono font-semibold">
                            {seller.code}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                        {seller.phone || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="font-medium text-foreground">{seller.commission_pct}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: seller.id, active: !seller.active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            seller.active ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={seller.active ? 'Desativar' : 'Ativar'}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              seller.active ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {seller.is_default ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            Padrão
                          </span>
                        ) : (
                          <button
                            onClick={() => setDefaultMutation.mutate(seller.id)}
                            disabled={setDefaultMutation.isPending}
                            className="text-xs text-muted-foreground hover:text-amber-600 hover:underline transition-colors disabled:opacity-50"
                          >
                            Tornar padrão
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(seller)}
                            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(seller.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                            title="Deletar"
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

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {editingId ? 'Editar Vendedor' : 'Novo Vendedor'}
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="Ex: Rebeca Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Código interno
                  <span className="text-muted-foreground font-normal ml-1">(apelido único)</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold font-mono"
                  placeholder="Ex: REBECA"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Telefone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Comissão %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.commission_pct}
                    onChange={(e) => setForm({ ...form, commission_pct: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="vendedor@email.com"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-green-600"
                    />
                    <span className="text-sm font-medium text-foreground">Ativo</span>
                  </label>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-amber-500"
                  />
                  <span className="text-sm font-medium text-foreground flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    Vendedor padrão
                  </span>
                </label>
              </div>

              {form.is_default && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Definir como padrão removerá o padrão do vendedor atual automaticamente.
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar Vendedor'}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-foreground font-medium hover:bg-surface-alt"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Confirmar exclusão</h2>
            <p className="text-sm text-muted-foreground mb-5">
              O vendedor será removido. Pedidos existentes associados a ele ficarão com vendedor em branco (não serão deletados).
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {deleteMutation.isPending ? 'Removendo...' : 'Deletar'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
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
