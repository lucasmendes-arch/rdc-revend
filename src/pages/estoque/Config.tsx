import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Search, Package, Plus, Tags, Target as TargetIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { STOCK_CATEGORY_PALETTE, getCategoryColor } from '@/lib/stockCategoryColors'

interface Product {
  id: string
  name: string
  main_image: string | null
  units_per_box: number | null
  package_type: string | null
  stock_category: string | null
  stock_only: boolean
}

interface StoreOption {
  id: string
  name: string
  slug: string
}

interface Target {
  id: string
  product_id: string
  store_id: string
  target_quantity: number
}

interface StockCategory {
  id: string
  name: string
  sort_order: number
  color_index: number
}

function ClassificationRow({ product, categories, onSave }: { product: Product; categories: StockCategory[]; onSave: (id: string, updates: Partial<Product>) => void }) {
  const [unitsPerBox, setUnitsPerBox] = useState(product.units_per_box ?? '')
  const [packageType, setPackageType] = useState(product.package_type ?? '')
  const [stockCategory, setStockCategory] = useState(product.stock_category ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setUnitsPerBox(product.units_per_box ?? '')
    setPackageType(product.package_type ?? '')
    setStockCategory(product.stock_category ?? '')
    setDirty(false)
  }, [product.units_per_box, product.package_type, product.stock_category])

  const scheduleSave = (updates: Partial<Product>) => {
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSave(product.id, updates)
      setDirty(false)
    }, 800)
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-surface-alt border border-border">
            {product.main_image ? (
              <img src={product.main_image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Package className="w-3.5 h-3.5 text-muted-foreground" /></div>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-foreground truncate max-w-[220px] block">{product.name}</span>
            {product.stock_only && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 uppercase">Só contagem</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-center">
        <input
          type="number"
          min={1}
          placeholder="—"
          value={unitsPerBox}
          onChange={(e) => {
            const val = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1)
            setUnitsPerBox(val ?? '')
            scheduleSave({ units_per_box: val })
          }}
          className="w-20 h-8 rounded-lg border border-input text-center text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </td>
      <td className="px-4 py-2.5 text-center">
        <select
          value={packageType}
          onChange={(e) => {
            const val = e.target.value || null
            setPackageType(val ?? '')
            scheduleSave({ package_type: val })
          }}
          className="h-8 rounded-lg border border-input text-sm bg-white px-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">—</option>
          <option value="CX">CX</option>
          <option value="UND">UND</option>
        </select>
      </td>
      <td className="px-4 py-2.5 text-center">
        <select
          value={stockCategory}
          onChange={(e) => {
            const val = e.target.value || null
            setStockCategory(val ?? '')
            scheduleSave({ stock_category: val })
          }}
          style={
            stockCategory
              ? (() => {
                  const cat = categories.find((c) => c.name === stockCategory)
                  const color = getCategoryColor(cat?.color_index)
                  return { backgroundColor: color.bg, color: color.text, borderColor: color.bg }
                })()
              : undefined
          }
          className="w-36 h-8 rounded-lg border border-input text-sm bg-white px-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
          {/* Produto pode ter uma categoria que já não está mais na lista (removida) — mantém visível pra não perder o dado */}
          {stockCategory && !categories.some((c) => c.name === stockCategory) && (
            <option value={stockCategory}>{stockCategory} (removida da lista)</option>
          )}
        </select>
      </td>
      <td className="w-6">{dirty && <Loader className="w-3.5 h-3.5 animate-spin text-amber-500" />}</td>
    </tr>
  )
}

function TargetCell({
  productId,
  storeId,
  target,
  onSave,
}: {
  productId: string
  storeId: string
  target: Target | undefined
  onSave: (productId: string, storeId: string, qty: number) => void
}) {
  const [qty, setQty] = useState(target?.target_quantity ?? 0)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setQty(target?.target_quantity ?? 0)
    setDirty(false)
  }, [target?.target_quantity])

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => {
          const val = Math.max(0, parseInt(e.target.value) || 0)
          setQty(val)
          setDirty(true)
          clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => {
            onSave(productId, storeId, val)
            setDirty(false)
          }, 800)
        }}
        className="w-16 h-8 rounded-lg border border-input text-center text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {dirty && <Loader className="w-3 h-3 animate-spin text-amber-500 shrink-0" />}
    </div>
  )
}

const TABS = [
  { key: 'classificacao', label: 'Classificação de produtos', icon: Tags },
  { key: 'metas', label: 'Metas de estoque por loja', icon: TargetIcon },
] as const

function CategoryChip({
  category,
  isFirst,
  isLast,
  isPending,
  onReorder,
  onColorChange,
}: {
  category: StockCategory
  isFirst: boolean
  isLast: boolean
  isPending: boolean
  onReorder: (direction: 'up' | 'down') => void
  onColorChange: (colorIndex: number) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const color = getCategoryColor(category.color_index)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5 rounded-lg pl-1 pr-1 py-1" style={{ backgroundColor: color.bg }}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="w-4 h-4 rounded-full border border-black/10 shrink-0 ml-0.5"
          style={{ backgroundColor: color.text }}
          title="Trocar cor"
        />
        <span className="text-xs font-medium mx-1.5" style={{ color: color.text }}>{category.name}</span>
        <button
          onClick={() => onReorder('up')}
          disabled={isFirst || isPending}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          style={{ color: color.text }}
          title="Mover pra cima"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onReorder('down')}
          disabled={isLast || isPending}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          style={{ color: color.text }}
          title="Mover pra baixo"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      {showPicker && (
        <div className="flex flex-wrap gap-1 bg-white border border-border rounded-lg p-1.5 shadow-md max-w-[160px]">
          {STOCK_CATEGORY_PALETTE.map((c, i) => (
            <button
              key={i}
              onClick={() => { onColorChange(i); setShowPicker(false) }}
              className="w-5 h-5 rounded-full border border-black/10 shrink-0"
              style={{ backgroundColor: c.bg }}
              title={`Cor ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function EstoqueConfig() {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['key']>('classificacao')
  const [search, setSearch] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewItemForm, setShowNewItemForm] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', stock_category: '', units_per_box: '', package_type: '' })

  const { data: categories = [] } = useQuery<StockCategory[]>({
    queryKey: ['stock-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_categories').select('id, name, sort_order, color_index').order('sort_order').order('name')
      if (error) throw error
      return (data || []) as StockCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Ordem manual das categorias (ex: seguir a ordem física dos corredores da
  // loja) — troca o sort_order com a categoria vizinha na lista atual.
  const reorderCategory = useMutation({
    mutationFn: async ({ category, direction }: { category: StockCategory; direction: 'up' | 'down' }) => {
      const index = categories.findIndex((c) => c.id === category.id)
      const neighborIndex = direction === 'up' ? index - 1 : index + 1
      const neighbor = categories[neighborIndex]
      if (!neighbor) return
      const { error: err1 } = await supabase.from('stock_categories').update({ sort_order: neighbor.sort_order }).eq('id', category.id)
      if (err1) throw err1
      const { error: err2 } = await supabase.from('stock_categories').update({ sort_order: category.sort_order }).eq('id', neighbor.id)
      if (err2) throw err2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-categories'] })
    },
    onError: (err) => toast.error(`Erro ao reordenar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const createCategory = useMutation({
    mutationFn: async (name: string) => {
      const nextSortOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0
      // Cor pastel atribuída automaticamente, ciclando pela paleta fixa.
      const colorIndex = categories.length % STOCK_CATEGORY_PALETTE.length
      const { error } = await supabase.from('stock_categories').insert({ name, sort_order: nextSortOrder, color_index: colorIndex })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-categories'] })
      setNewCategoryName('')
      toast.success('Categoria criada')
    },
    onError: (err) => toast.error(`Erro ao criar categoria: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const setCategoryColor = useMutation({
    mutationFn: async ({ id, colorIndex }: { id: string; colorIndex: number }) => {
      const { error } = await supabase.from('stock_categories').update({ color_index: colorIndex }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-categories'] })
    },
    onError: (err) => toast.error(`Erro ao trocar cor: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleCreateCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    createCategory.mutate(name)
  }

  // Item "só contagem": não é produto de venda no atacado — nunca aparece
  // no catálogo B2B (is_active fica sempre false, CHECK garante isso), só
  // existe pra ser contado fisicamente na loja (ex: material de limpeza).
  const createStockOnlyItem = useMutation({
    mutationFn: async (input: { name: string; stock_category: string | null; units_per_box: number | null; package_type: string | null }) => {
      const { error } = await supabase.from('catalog_products').insert({
        name: input.name,
        price: 0,
        is_active: false,
        stock_only: true,
        source: 'stock_only',
        stock_category: input.stock_category,
        units_per_box: input.units_per_box,
        package_type: input.package_type,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-products-config'] })
      queryClient.invalidateQueries({ queryKey: ['stock-products'] })
      setNewItem({ name: '', stock_category: '', units_per_box: '', package_type: '' })
      setShowNewItemForm(false)
      toast.success('Item criado')
    },
    onError: (err) => toast.error(`Erro ao criar item: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleCreateStockOnlyItem = () => {
    const name = newItem.name.trim()
    if (!name) {
      toast.error('Nome é obrigatório')
      return
    }
    createStockOnlyItem.mutate({
      name,
      stock_category: newItem.stock_category || null,
      units_per_box: newItem.units_per_box ? Math.max(1, parseInt(newItem.units_per_box) || 1) : null,
      package_type: newItem.package_type || null,
    })
  }

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['stock-products-config'],
    queryFn: async () => {
      // stock_countable_products = ativos no catálogo OU stock_only,
      // excluindo kits (kit_components) — kit não é classificável/contável.
      const { data, error } = await supabase
        .from('stock_countable_products')
        .select('id, name, main_image, units_per_box, package_type, stock_category, stock_only')
        .order('name')
      if (error) throw error
      return (data || []) as Product[]
    },
    staleTime: 60 * 1000,
  })

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, slug').order('name')
      if (error) throw error
      return (data || []) as StoreOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Metas de TODAS as lojas de uma vez — a matriz mostra cada loja como
  // uma coluna, porque cada loja tem um porte (e portanto uma meta) diferente.
  const { data: targets = [] } = useQuery<Target[]>({
    queryKey: ['store-stock-targets-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_stock_targets')
        .select('id, product_id, store_id, target_quantity')
      if (error) throw error
      return (data || []) as Target[]
    },
  })

  const targetsByProductStore = useMemo(() => {
    const map = new Map<string, Target>()
    for (const t of targets) map.set(`${t.product_id}:${t.store_id}`, t)
    return map
  }, [targets])

  const updateProduct = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Product> }) => {
      const { error } = await supabase.from('catalog_products').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-products-config'] })
      queryClient.invalidateQueries({ queryKey: ['stock-products'] })
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleSaveProduct = useCallback(
    (id: string, updates: Partial<Product>) => updateProduct.mutate({ id, updates }),
    [updateProduct]
  )

  const saveTarget = useMutation({
    mutationFn: async ({ productId, storeId, qty }: { productId: string; storeId: string; qty: number }) => {
      const { error } = await supabase
        .from('store_stock_targets')
        .upsert(
          { product_id: productId, store_id: storeId, target_quantity: qty },
          { onConflict: 'product_id,store_id' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-stock-targets-all'] })
    },
    onError: (err) => toast.error(`Erro ao salvar meta: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleSaveTarget = useCallback(
    (productId: string, storeId: string, qty: number) => saveTarget.mutate({ productId, storeId, qty }),
    [saveTarget]
  )

  if (role !== 'admin') {
    return <Navigate to="/estoque/contagem" replace />
  }

  const categoryOrderByName = useMemo(() => {
    const map = new Map<string, number>()
    categories.forEach((c) => map.set(c.name, c.sort_order))
    return map
  }, [categories])

  const filteredProducts = products
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const orderA = a.stock_category ? categoryOrderByName.get(a.stock_category) ?? Infinity : Infinity
      const orderB = b.stock_category ? categoryOrderByName.get(b.stock_category) ?? Infinity : Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name)
    })

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="p-5 space-y-3 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Configurações do módulo de Estoque</h1>
          <p className="text-xs text-muted-foreground">
            Kits (compostos por outros produtos) não aparecem aqui nem na contagem — conte os componentes separadamente.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input text-sm bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-1 px-3 pt-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-amber-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'classificacao' && (
        <section className="space-y-2">
          <div className="flex items-center justify-end flex-wrap gap-1.5 px-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory() }}
              placeholder="Nova categoria (ex: Óleo)"
              className="h-9 w-48 rounded-lg border border-input text-sm bg-white px-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim() || createCategory.isPending}
              className="flex items-center gap-1 px-3 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Categoria
            </button>
            <button
              onClick={() => setShowNewItemForm((v) => !v)}
              className="flex items-center gap-1 px-3 h-9 rounded-lg btn-gold text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Item só contagem
            </button>
          </div>

          {categories.length > 0 && (
            <div className="bg-white rounded-2xl border border-border shadow-card p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
                Ordem das categorias (contagem e classificação seguem esta ordem)
              </p>
              <div className="flex flex-wrap items-start gap-1.5">
                {categories.map((cat, index) => (
                  <CategoryChip
                    key={cat.id}
                    category={cat}
                    isFirst={index === 0}
                    isLast={index === categories.length - 1}
                    isPending={reorderCategory.isPending}
                    onReorder={(direction) => reorderCategory.mutate({ category: cat, direction })}
                    onColorChange={(colorIndex) => setCategoryColor.mutate({ id: cat.id, colorIndex })}
                  />
                ))}
              </div>
            </div>
          )}

          {showNewItemForm && (
            <div className="bg-white rounded-2xl border border-teal-200 shadow-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-700">Novo item — só pra contagem (não entra no catálogo de venda)</p>
                <button onClick={() => setShowNewItemForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="Nome (ex: Detergente 5L)"
                  className="sm:col-span-2 h-9 rounded-lg border border-input text-sm bg-white px-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <select
                  value={newItem.stock_category}
                  onChange={(e) => setNewItem({ ...newItem, stock_category: e.target.value })}
                  className="h-9 rounded-lg border border-input text-sm bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <select
                  value={newItem.package_type}
                  onChange={(e) => setNewItem({ ...newItem, package_type: e.target.value })}
                  className="h-9 rounded-lg border border-input text-sm bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Embalagem</option>
                  <option value="CX">CX</option>
                  <option value="UND">UND</option>
                </select>
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="number"
                  min={1}
                  value={newItem.units_per_box}
                  onChange={(e) => setNewItem({ ...newItem, units_per_box: e.target.value })}
                  placeholder="Itens/caixa (opcional)"
                  className="w-40 h-9 rounded-lg border border-input text-sm bg-white px-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={handleCreateStockOnlyItem}
                  disabled={!newItem.name.trim() || createStockOnlyItem.isPending}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-lg btn-gold text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createStockOnlyItem.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Criar item
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            {productsLoading ? (
              <div className="text-center py-10"><Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Produto</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Itens/caixa</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Embalagem</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Categoria de estoque</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <ClassificationRow key={p.id} product={p} categories={categories} onSave={handleSaveProduct} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'metas' && (
        <section className="space-y-2 pb-8">
          <p className="text-xs text-muted-foreground px-1">
            Cada loja tem seu próprio porte — defina a meta ideal (em unidades) por loja, lado a lado.
          </p>
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground sticky left-0 bg-surface-alt">Produto</th>
                    {stores.map((s) => (
                      <th key={s.id} className="px-4 py-2.5 text-center text-xs font-semibold text-foreground whitespace-nowrap">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, index) => (
                    <tr key={p.id} className={`border-b border-border last:border-b-0 ${index % 2 === 0 ? '' : 'bg-surface-alt/50'}`}>
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground sticky left-0 bg-inherit whitespace-nowrap">{p.name}</td>
                      {stores.map((s) => (
                        <td key={s.id} className="px-2 py-2.5">
                          <TargetCell
                            productId={p.id}
                            storeId={s.id}
                            target={targetsByProductStore.get(`${p.id}:${s.id}`)}
                            onSave={handleSaveTarget}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </EstoqueLayout>
  )
}
