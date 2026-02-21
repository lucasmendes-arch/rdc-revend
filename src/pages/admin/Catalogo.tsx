import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAdminProducts, useUpdateProduct, useDeleteProduct, useNuvemshopSync, CatalogProduct } from '@/hooks/useAdminProducts'
import logo from '@/assets/logo-rei-dos-cachos.png'

export default function AdminCatalogo() {
  const { data: products = [], isLoading, error } = useAdminProducts()
  const updateMutation = useUpdateProduct()
  const deleteMutation = useDeleteProduct()
  const syncMutation = useNuvemshopSync()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<CatalogProduct>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [showSyncResult, setShowSyncResult] = useState(false)

  const itemsPerPage = 10
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const handleEdit = (product: CatalogProduct) => {
    setEditingId(product.id)
    setEditForm(product)
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    try {
      await updateMutation.mutateAsync({ id: editingId, ...editForm })
      setEditingId(null)
      setEditForm({})
    } catch (err) {
      alert(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleToggleActive = async (product: CatalogProduct) => {
    try {
      await updateMutation.mutateAsync({
        id: product.id,
        is_active: !product.is_active,
      })
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

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync()
      setSyncResult(result)
      setShowSyncResult(true)
      setTimeout(() => setShowSyncResult(false), 5000)
    } catch (err) {
      alert(`Erro na sincronização: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-30">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <img src={logo} alt="Rei dos Cachos" className="h-10 w-auto" />
            </Link>
          </div>

          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Painel Admin — Catálogo</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-gold text-white text-sm disabled:opacity-70"
            >
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            <Link
              to="/catalogo"
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-white text-foreground hover:bg-surface-alt text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Catálogo</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Sync Result Toast */}
      {showSyncResult && syncResult && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-white border border-border rounded-xl shadow-lg p-4 max-w-md">
          <p className="font-semibold text-foreground mb-2">Sincronização concluída!</p>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>✅ Importados: {syncResult.result.imported}</p>
            <p>🔄 Atualizados: {syncResult.result.updated}</p>
            {syncResult.result.errors > 0 && (
              <p className="text-red-600">❌ Erros: {syncResult.result.errors}</p>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="container mx-auto px-4 sm:px-6 py-8">
        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar produtos..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Erro ao carregar produtos</p>
            <p className="text-sm">{error instanceof Error ? error.message : 'Desconhecido'}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando produtos...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhum produto encontrado</p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Produto</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Preço</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProducts.map((product, index) => (
                      <tr key={product.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-3">
                            {product.main_image && (
                              <img
                                src={product.main_image}
                                alt={product.name}
                                className="w-10 h-10 rounded object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{product.name}</p>
                              {product.nuvemshop_product_id && (
                                <p className="text-xs text-muted-foreground">ID: {product.nuvemshop_product_id}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground font-medium">
                          R$ {product.price.toFixed(2)}
                          {product.compare_at_price && (
                            <div className="text-xs text-muted-foreground line-through">
                              R$ {product.compare_at_price.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <button
                            onClick={() => handleToggleActive(product)}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                              product.is_active
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {product.is_active ? '✓ Ativo' : '✗ Pausado'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-right space-x-2">
                          <button
                            onClick={() => handleEdit(product)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-foreground hover:bg-surface-alt transition-all text-xs font-medium"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Editar</span>
                          </button>
                          <button
                            onClick={() => setDeleteId(product.id)}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-border hover:bg-white disabled:opacity-50 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-border hover:bg-white disabled:opacity-50 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Edit Dialog */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => {
              setEditingId(null)
              setEditForm({})
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-foreground mb-4">Editar Produto</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Preço de Atacado</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.price || 0}
                  onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Preço de Comparação (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.compare_at_price || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, compare_at_price: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Imagem Principal (URL)</label>
                <input
                  type="text"
                  value={editForm.main_image || ''}
                  onChange={(e) => setEditForm({ ...editForm, main_image: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold text-sm"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_active || false}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm font-medium text-foreground">Ativo</span>
                </label>
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
                onClick={() => {
                  setEditingId(null)
                  setEditForm({})
                }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-foreground font-medium hover:bg-surface-alt"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Deletar Produto?</h2>
            <p className="text-sm text-muted-foreground mb-6">Esta ação não pode ser desfeita.</p>

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
    </div>
  )
}
