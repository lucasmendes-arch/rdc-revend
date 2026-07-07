import { useState } from 'react'
import { Plus, Trash2, Edit2, Zap, ZapOff } from 'lucide-react'
import { useAdminUpsells, useCreateUpsell, useUpdateUpsell, useDeleteUpsell, AdminUpsellOffer } from '@/hooks/useAdminUpsell'
import { useAdminProducts } from '@/hooks/useAdminProducts'
import AdminLayout from '@/components/admin/AdminLayout'

export default function AdminUpsell() {
  const { data: offers = [], isLoading } = useAdminUpsells()
  const { data: products = [] } = useAdminProducts()
  const createMutation = useCreateUpsell()
  const updateMutation = useUpdateUpsell()
  const deleteMutation = useDeleteUpsell()

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ product_id: '', title: '', description: '', discounted_price: 0, quantity: 1, is_active: true })

  const activeProducts = products.filter(p => p.is_active)

  const handleCreate = async () => {
    if (!form.product_id || !form.title.trim() || form.discounted_price <= 0) {
      alert('Produto, titulo e preco sao obrigatorios')
      return
    }
    try {
      await createMutation.mutateAsync({
        product_id: form.product_id,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        discounted_price: form.discounted_price,
        quantity: form.quantity,
        is_active: form.is_active,
      })
      setCreating(false)
      setForm({ product_id: '', title: '', description: '', discounted_price: 0, quantity: 1, is_active: true })
    } catch (err) {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleEdit = (offer: AdminUpsellOffer) => {
    setEditingId(offer.id)
    setForm({
      product_id: offer.product_id,
      title: offer.title,
      description: offer.description || '',
      discounted_price: offer.discounted_price,
      quantity: offer.quantity || 1,
      is_active: offer.is_active,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        product_id: form.product_id,
        title: form.title.trim(),
        description: form.description.trim(),
        discounted_price: form.discounted_price,
        quantity: form.quantity,
        is_active: form.is_active,
      })
      setEditingId(null)
    } catch (err) {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleToggleActive = async (offer: AdminUpsellOffer) => {
    try {
      await updateMutation.mutateAsync({ id: offer.id, is_active: !offer.is_active })
    } catch (err) {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      setDeleteId(null)
    } catch (err) {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const selectedProduct = form.product_id ? activeProducts.find(p => p.id === form.product_id) : null

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Upsell</h1>
            <p className="text-sm text-muted-foreground">Ofertas especiais exibidas no checkout</p>
          </div>
          <button
            onClick={() => { setCreating(true); setForm({ product_id: '', title: '', description: '', discounted_price: 0, quantity: 1, is_active: true }) }}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Oferta</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando ofertas...</p>
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma oferta de upsell criada</p>
            <p className="text-sm text-muted-foreground mt-1">Crie uma oferta para exibir no checkout dos clientes</p>
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map(offer => (
              <div key={offer.id} className={`bg-white rounded-xl border-2 p-5 shadow-card transition-all ${offer.is_active ? 'border-green-400' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4 flex-1 min-w-0">
                    {offer.product?.main_image && (
                      <img src={offer.product.main_image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground truncate">{offer.title}</h3>
                        {offer.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">ATIVA</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">INATIVA</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{offer.product?.name}</p>
                      {offer.description && <p className="text-xs text-muted-foreground mt-1">{offer.description}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        {offer.quantity > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{offer.quantity}x</span>
                        )}
                        {offer.product && (
                          <span className="text-xs text-muted-foreground line-through">R$ {offer.product.price.toFixed(2)}</span>
                        )}
                        <span className="text-lg font-black gradient-gold-text">R$ {offer.discounted_price.toFixed(2)} {offer.quantity > 1 ? 'cada' : ''}</span>
                        {offer.quantity > 1 && (
                          <span className="text-xs font-bold text-foreground">= R$ {(offer.discounted_price * offer.quantity).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleActive(offer)}
                      className={`p-2 rounded-lg transition-colors ${offer.is_active ? 'text-green-600 hover:bg-green-50' : 'text-muted-foreground hover:bg-surface-alt'}`}
                      title={offer.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {offer.is_active ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleEdit(offer)} className="p-2 rounded-lg text-foreground hover:bg-surface-alt transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteId(offer.id)} className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {(creating || editingId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => { setCreating(false); setEditingId(null) }} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-foreground mb-4">{creating ? 'Nova Oferta de Upsell' : 'Editar Oferta'}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Produto *</label>
                <select
                  value={form.product_id}
                  onChange={(e) => {
                    const p = activeProducts.find(x => x.id === e.target.value)
                    setForm({
                      ...form,
                      product_id: e.target.value,
                      title: form.title || (p ? `Leve ${p.name} com desconto!` : ''),
                      discounted_price: form.discounted_price || (p ? Math.round(p.price * 0.85 * 100) / 100 : 0),
                    })
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  <option value="">Selecione um produto</option>
                  {activeProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — R$ {p.price.toFixed(2)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Titulo da Oferta *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="Ex: Leve o Kit SOS com 15% OFF!"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Descricao (opcional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold text-sm"
                  placeholder="Oferta exclusiva para quem esta finalizando o pedido"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Quantidade *</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="Ex: 10"
                />
                <p className="text-xs text-muted-foreground mt-1">Quantidade de unidades na oferta (ex: 10 ampolas)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Preco Unitario com Desconto *</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.01"
                    value={form.discounted_price || ''}
                    onChange={(e) => setForm({ ...form, discounted_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                  {selectedProduct && form.discounted_price > 0 && (
                    <span className="text-xs text-green-600 font-bold whitespace-nowrap">
                      -{Math.round((1 - form.discounted_price / selectedProduct.price) * 100)}%
                    </span>
                  )}
                </div>
                {form.quantity > 1 && form.discounted_price > 0 && (
                  <p className="text-sm font-bold text-foreground mt-1">
                    Total: {form.quantity}x R$ {form.discounted_price.toFixed(2)} = R$ {(form.quantity * form.discounted_price).toFixed(2)}
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm font-medium text-foreground">Ativar imediatamente</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={creating ? handleCreate : handleSaveEdit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-70 transition-colors"
              >
                {(createMutation.isPending || updateMutation.isPending) ? 'Salvando...' : creating ? 'Criar Oferta' : 'Salvar'}
              </button>
              <button
                onClick={() => { setCreating(false); setEditingId(null) }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-foreground font-medium hover:bg-surface-alt"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Deletar Oferta?</h2>
            <p className="text-sm text-muted-foreground mb-6">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleteMutation.isPending} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-70">
                {deleteMutation.isPending ? 'Deletando...' : 'Deletar'}
              </button>
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-white text-foreground font-medium hover:bg-surface-alt">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
