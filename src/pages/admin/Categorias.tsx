import { useState } from 'react'
import { Edit2, Trash2, Plus, X, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, Category } from '@/hooks/useCategories'
import AdminLayout from '@/components/admin/AdminLayout'

export default function AdminCategorias() {
  const { data: categories = [], isLoading, error } = useCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', slug: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', slug: '' })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const generateSlug = (name: string) =>
    name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const handleCreate = async () => {
    if (!createForm.name.trim()) return
    const slug = createForm.slug.trim() || generateSlug(createForm.name)
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0
    try {
      await createMutation.mutateAsync({ name: createForm.name.trim(), slug, sort_order: maxOrder + 1 })
      setCreating(false)
      setCreateForm({ name: '', slug: '' })
    } catch (err) {
      alert(`Erro ao criar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditForm({ name: cat.name, slug: cat.slug })
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.name.trim()) return
    const slug = editForm.slug.trim() || generateSlug(editForm.name)
    try {
      await updateMutation.mutateAsync({ id: editingId, name: editForm.name.trim(), slug })
      setEditingId(null)
    } catch (err) {
      alert(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      setDeleteId(null)
    } catch (err) {
      alert(`Erro ao deletar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleReorder = async (cat: Category, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(c => c.id === cat.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const other = sorted[swapIdx]
    try {
      await updateMutation.mutateAsync({ id: cat.id, sort_order: other.sort_order })
      await updateMutation.mutateAsync({ id: other.id, sort_order: cat.sort_order })
    } catch (err) {
      console.error('Reorder error:', err)
    }
  }

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Categorias</h1>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Categoria</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Erro ao carregar categorias</p>
            <p className="text-sm">{error instanceof Error ? error.message : 'Desconhecido'}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando categorias...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma categoria cadastrada</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground w-12">Ordem</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Slug</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...categories].sort((a, b) => a.sort_order - b.sort_order).map((cat, index) => (
                    <tr key={cat.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono text-muted-foreground">{cat.sort_order}</span>
                          <div className="flex flex-col ml-1">
                            <button
                              onClick={() => handleReorder(cat, 'up')}
                              disabled={index === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleReorder(cat, 'down')}
                              disabled={index === categories.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{cat.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{cat.slug}</td>
                      <td className="px-4 py-3 text-sm text-right space-x-2">
                        <button
                          onClick={() => handleEdit(cat)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-foreground hover:bg-surface-alt transition-all text-xs font-medium"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Editar</span>
                        </button>
                        <button
                          onClick={() => setDeleteId(cat.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-all text-xs font-medium"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Deletar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-foreground mb-4">Nova Categoria</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ name: e.target.value, slug: generateSlug(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="Ex: Condicionador"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Slug</label>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold font-mono text-sm"
                  placeholder="gerado-automaticamente"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Categoria'}
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

      {/* Edit Dialog */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setEditingId(null)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-foreground mb-4">Editar Categoria</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ name: e.target.value, slug: generateSlug(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Slug</label>
                <input
                  type="text"
                  value={editForm.slug}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-gold text-white font-medium disabled:opacity-70"
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-foreground font-medium hover:bg-surface-alt"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Deletar Categoria?</h2>
            <p className="text-sm text-muted-foreground mb-6">Produtos desta categoria ficarao sem categoria. Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-70"
              >
                {deleteMutation.isPending ? 'Deletando...' : 'Deletar'}
              </button>
              <button
                onClick={() => setDeleteId(null)}
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
