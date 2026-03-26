import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { Loader, RefreshCw, Minus, Plus, Search, Save, Package, Check, AlertTriangle } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { isProduction } from '@/lib/environment'

interface InventoryItem {
  id: string
  product_id: string
  sku: string | null
  quantity: number
  min_quantity: number
  last_synced_at: string
  catalog_products: {
    name: string
    main_image: string | null
  }
}

interface ProductWithoutStock {
  id: string
  name: string
  main_image: string | null
}

function QuantityCell({ item, onSave }: { item: InventoryItem; onSave: (id: string, qty: number) => void }) {
  const [qty, setQty] = useState(item.quantity)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setQty(item.quantity)
    setDirty(false)
  }, [item.quantity])

  const save = useCallback((newQty: number) => {
    const val = Math.max(0, newQty)
    setQty(val)
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSave(item.id, val)
      setDirty(false)
    }, 800)
  }, [item.id, onSave])

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => save(qty - 1)}
        disabled={qty === 0}
        className="w-8 h-8 rounded-lg border border-border hover:bg-red-50 hover:border-red-300 hover:text-red-600 flex items-center justify-center disabled:opacity-30 transition-colors active:scale-95"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => save(parseInt(e.target.value) || 0)}
        className={`w-16 h-8 rounded-lg border text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-gold transition-colors ${dirty ? 'border-amber-400 bg-amber-50' : 'border-border bg-white'}`}
      />
      <button
        onClick={() => save(qty + 1)}
        className="w-8 h-8 rounded-lg border border-border hover:bg-green-50 hover:border-green-300 hover:text-green-600 flex items-center justify-center transition-colors active:scale-95"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {dirty && (
        <div className="w-4 h-4 ml-0.5">
          <Loader className="w-4 h-4 animate-spin text-amber-500" />
        </div>
      )}
    </div>
  )
}

function EditableCell({ value, onSave, type = 'text', placeholder = '', className = '' }: {
  value: string | number
  onSave: (val: string | number) => void
  type?: 'text' | 'number'
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setLocalVal(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    const final = type === 'number' ? Math.max(0, parseInt(String(localVal)) || 0) : localVal
    if (final !== value) onSave(final)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`px-2 py-1 rounded hover:bg-surface-alt transition-colors cursor-text ${className}`}
        title="Clique para editar"
      >
        {value || <span className="text-muted-foreground">{placeholder || '-'}</span>}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={localVal}
      onChange={(e) => setLocalVal(type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalVal(value); setEditing(false) } }}
      className="w-20 px-2 py-1 rounded border border-gold bg-white text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-gold"
      min={type === 'number' ? 0 : undefined}
    />
  )
}

export default function AdminEstoque() {
  const queryClient = useQueryClient()
  const [sheetId, setSheetId] = useState(() => localStorage.getItem('rdc_google_sheet_id') || '')
  const [searchTerm, setSearchTerm] = useState('')
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const [syncConfirmText, setSyncConfirmText] = useState('')

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, catalog_products(name, main_image)')
        .order('quantity', { ascending: true })

      if (error) throw error
      return (data || []) as InventoryItem[]
    },
    staleTime: 60 * 1000,
  })

  const { data: productsWithoutStock = [] } = useQuery({
    queryKey: ['products-without-stock'],
    queryFn: async () => {
      const { data: allProducts, error: pErr } = await supabase
        .from('catalog_products')
        .select('id, name, main_image')
        .eq('is_active', true)
        .order('name')

      if (pErr) throw pErr

      const { data: inv } = await supabase
        .from('inventory')
        .select('product_id')

      const withStock = new Set((inv || []).map((i: { product_id: string }) => i.product_id))
      return (allProducts || []).filter((p: ProductWithoutStock) => !withStock.has(p.id)) as ProductWithoutStock[]
    },
    staleTime: 60 * 1000,
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!sheetId) throw new Error('Informe o ID da planilha Google Sheets')
      localStorage.setItem('rdc_google_sheet_id', sheetId)
      return callEdgeFunction('sync-google-sheets', { sheetId }, { 'x-confirm-sync': 'true' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['products-without-stock'] })
      alert('Estoque sincronizado com sucesso!')
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const updateField = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | number }) => {
      const { error } = await supabase
        .from('inventory')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (err) => {
      alert(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const createMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('inventory')
        .insert({
          product_id: productId,
          quantity: 0,
          min_quantity: 5,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['products-without-stock'] })
    },
    onError: (err) => {
      alert(`Erro ao criar estoque: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const handleQuantitySave = useCallback((id: string, qty: number) => {
    updateField.mutate({ id, field: 'quantity', value: qty })
  }, [updateField])

  const getStockStatus = (qty: number, min: number) => {
    if (qty === 0) return { label: 'Sem estoque', color: 'bg-red-100 text-red-700' }
    if (qty <= min) return { label: 'Baixo', color: 'bg-yellow-100 text-yellow-700' }
    return { label: 'OK', color: 'bg-green-100 text-green-700' }
  }

  const filteredInventory = inventory.filter((item) =>
    !searchTerm || item.catalog_products?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredProductsWithoutStock = productsWithoutStock.filter((p) =>
    !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const lowStockCount = inventory.filter(i => i.quantity > 0 && i.quantity <= i.min_quantity).length
  const outOfStockCount = inventory.filter(i => i.quantity === 0).length

  return (
    <AdminLayout>
      {/* Sync Confirmation Modal (production only) */}
      {showSyncConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Sincronizar estoque em PRODUÇÃO</h3>
                <p className="text-sm text-muted-foreground">Esta ação altera o estoque real dos produtos.</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-3">
              Digite <strong className="text-red-600">SINCRONIZAR</strong> para confirmar:
            </p>
            <input
              type="text"
              value={syncConfirmText}
              onChange={(e) => setSyncConfirmText(e.target.value)}
              placeholder="SINCRONIZAR"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowSyncConfirm(false); setSyncConfirmText('') }}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowSyncConfirm(false); setSyncConfirmText(''); syncMutation.mutate() }}
                disabled={syncConfirmText !== 'SINCRONIZAR'}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
              >
                Confirmar sincronização
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Estoque</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie o estoque dos produtos</p>
          </div>
          <button
            onClick={() => {
              if (isProduction) {
                setShowSyncConfirm(true)
                setSyncConfirmText('')
              } else {
                syncMutation.mutate()
              }
            }}
            disabled={syncMutation.isPending}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-white text-sm disabled:opacity-70 ${
              isProduction ? 'bg-red-600 hover:bg-red-700' : 'btn-gold'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8">
        {/* Sheet ID Input */}
        <div className="mb-6 bg-white rounded-xl border border-border p-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            ID da Planilha Google Sheets
          </label>
          <input
            type="text"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            placeholder="Cole o ID da planilha (ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms)"
            className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Colunas: <strong>nome_produto</strong> (obrig.), sku, quantidade, quantidade_minima, preco, preco_revenda, foto.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{inventory.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">{lowStockCount}</p>
            <p className="text-xs text-yellow-600 mt-1">Estoque baixo</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{outOfStockCount}</p>
            <p className="text-xs text-red-600 mt-1">Sem estoque</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando estoque...</p>
          </div>
        ) : (
          <>
            {filteredInventory.length > 0 && (
              <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden mb-8">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Produto</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">SKU</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Quantidade</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Mínimo</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item, index) => {
                        const status = getStockStatus(item.quantity, item.min_quantity)
                        return (
                          <tr key={item.id} className={`${index % 2 === 0 ? '' : 'bg-surface-alt/50'} hover:bg-surface-alt/80 transition-colors`}>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex gap-3 items-center">
                                {item.catalog_products?.main_image ? (
                                  <img
                                    src={item.catalog_products.main_image}
                                    alt={item.catalog_products.name}
                                    className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-surface-alt border border-border flex items-center justify-center flex-shrink-0">
                                    <Package className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                                <span className="font-medium text-foreground truncate max-w-[200px]">
                                  {item.catalog_products?.name || 'Produto removido'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <EditableCell
                                value={item.sku || ''}
                                placeholder="-"
                                onSave={(val) => updateField.mutate({ id: item.id, field: 'sku', value: val })}
                                className="text-muted-foreground text-sm"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <QuantityCell item={item} onSave={handleQuantitySave} />
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <EditableCell
                                value={item.min_quantity}
                                type="number"
                                onSave={(val) => updateField.mutate({ id: item.id, field: 'min_quantity', value: val })}
                                className="text-muted-foreground font-medium text-sm"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {filteredProductsWithoutStock.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-foreground mb-3">Produtos sem estoque cadastrado</h2>
                <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Produto</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProductsWithoutStock.map((product, index) => (
                          <tr key={product.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex gap-3 items-center">
                                {product.main_image ? (
                                  <img
                                    src={product.main_image}
                                    alt={product.name}
                                    className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-surface-alt border border-border flex items-center justify-center flex-shrink-0">
                                    <Package className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                                <span className="font-medium text-foreground">{product.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <button
                                onClick={() => createMutation.mutate(product.id)}
                                disabled={createMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                              >
                                <Plus className="w-3 h-3" />
                                Cadastrar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {filteredInventory.length === 0 && filteredProductsWithoutStock.length === 0 && (
              <div className="text-center py-16">
                <p className="text-muted-foreground">Nenhum item encontrado.</p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
