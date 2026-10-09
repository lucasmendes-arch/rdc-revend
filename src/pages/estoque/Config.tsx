import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Package, Plus, Tags, Target as TargetIcon, ChevronUp, ChevronDown, Pencil, Trash2, ImagePlus, Copy, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { STOCK_CATEGORY_PALETTE, getCategoryColor } from '@/lib/stockCategoryColors'
import { naturalCompare } from '@/lib/naturalSort'
import { sortByStoreOrder } from '@/lib/storeOrder'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, PageTabs, Panel, PageLoading, SearchInput, Toolbar } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

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
  type: 'central' | 'satellite'
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

const PACKAGE_OPTIONS = [
  { value: 'CX', label: 'CX' },
  { value: 'UND', label: 'UND' },
]

function ClassificationRow({ product, categories, onSave, onDelete }: { product: Product; categories: StockCategory[]; onSave: (id: string, updates: Partial<Product>) => void; onDelete: (product: Product) => void }) {
  const [unitsPerBox, setUnitsPerBox] = useState(product.units_per_box ?? '')
  const [packageType, setPackageType] = useState(product.package_type ?? '')
  const [stockCategory, setStockCategory] = useState(product.stock_category ?? '')
  // Nome só é editável em itens stock_only — produtos B2B são gerenciados
  // no Catálogo admin, não aqui.
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(product.name)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const [dirty, setDirty] = useState(false)
  const { upload: uploadPhoto, uploading: uploadingPhoto } = useImageUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Foto só em itens stock_only — em produtos B2B a main_image é gerenciada
  // no Catálogo admin.
  const handlePhotoSelect = async (file: File) => {
    try {
      const url = await uploadPhoto(file)
      onSave(product.id, { main_image: url })
      toast.success('Foto adicionada')
    } catch (err) {
      toast.error(`Erro ao enviar foto: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  useEffect(() => {
    setUnitsPerBox(product.units_per_box ?? '')
    setPackageType(product.package_type ?? '')
    setStockCategory(product.stock_category ?? '')
    setName(product.name)
    setDirty(false)
  }, [product.units_per_box, product.package_type, product.stock_category, product.name])

  const scheduleSave = (updates: Partial<Product>) => {
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSave(product.id, updates)
      setDirty(false)
    }, 800)
  }

  const commitName = () => {
    setEditingName(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === product.name) {
      setName(product.name)
      return
    }
    scheduleSave({ name: trimmed })
  }

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5">
          {product.stock_only ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="relative w-9 h-9 rounded-md overflow-hidden shrink-0 bg-muted border border-border hover:border-ink-300 transition-colors"
                title={product.main_image ? 'Trocar foto' : 'Adicionar foto'}
              >
                {uploadingPhoto ? (
                  <div className="w-full h-full flex items-center justify-center"><Loader className="w-3.5 h-3.5 animate-spin text-muted-foreground" /></div>
                ) : product.main_image ? (
                  <img src={product.main_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ImagePlus className="w-3.5 h-3.5 text-muted-foreground" /></div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) handlePhotoSelect(file)
                }}
              />
            </>
          ) : (
            <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 bg-muted border border-border">
              {product.main_image ? (
                <img src={product.main_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Package className="w-3.5 h-3.5 text-muted-foreground" /></div>
              )}
            </div>
          )}
          <div className="min-w-0">
            {editingName ? (
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName()
                  if (e.key === 'Escape') { setName(product.name); setEditingName(false) }
                }}
                className="w-full max-w-[220px] h-8 rounded-md border border-input text-[13px] bg-card text-foreground px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <span
                className={`font-medium text-foreground truncate max-w-[220px] block ${product.stock_only ? 'cursor-pointer hover:text-foreground' : ''}`}
                onClick={product.stock_only ? () => setEditingName(true) : undefined}
                title={product.stock_only ? 'Clique para renomear' : 'Edite no Catálogo admin'}
              >
                {product.name}
                {product.stock_only && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="inline-flex align-middle ml-1.5 text-muted-foreground hover:text-foreground"
                    title="Renomear item"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            )}
            {product.stock_only ? (
              <Badge variant="info" className="mt-0.5">Só contagem</Badge>
            ) : (
              <Badge variant="neutral" className="mt-0.5">Catálogo atacado</Badge>
            )}
          </div>
        </div>
      </td>
      <td className="text-center">
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
          className="w-20 h-8 rounded-md border border-input text-center text-[13px] tabular-nums bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </td>
      <td className="text-center">
        <StyledSelect
          value={packageType}
          onChange={(v) => {
            const val = v || null
            setPackageType(val ?? '')
            // UND = item avulso, então itens/caixa é sempre 1.
            if (val === 'UND') {
              setUnitsPerBox(1)
              scheduleSave({ package_type: val, units_per_box: 1 })
            } else {
              scheduleSave({ package_type: val })
            }
          }}
          options={PACKAGE_OPTIONS}
          emptyLabel="—"
          placeholder="—"
          searchable={false}
          className="w-auto h-8 bg-card px-2 mx-auto"
        />
      </td>
      <td className="text-center">
        <StyledSelect
          value={stockCategory}
          onChange={(v) => {
            const val = v || null
            setStockCategory(val ?? '')
            scheduleSave({ stock_category: val })
          }}
          options={[
            ...categories.map((c) => ({ value: c.name, label: c.name, dotColor: getCategoryColor(c.color_index).bg })),
            // Produto pode ter uma categoria que já não está mais na lista (removida) — mantém visível pra não perder o dado
            ...(stockCategory && !categories.some((c) => c.name === stockCategory)
              ? [{ value: stockCategory, label: `${stockCategory} (removida da lista)` }]
              : []),
          ]}
          emptyLabel="Sem categoria"
          placeholder="Sem categoria"
          style={
            stockCategory
              ? (() => {
                  const cat = categories.find((c) => c.name === stockCategory)
                  const color = getCategoryColor(cat?.color_index)
                  return { backgroundColor: color.bg, color: color.text, borderColor: color.bg }
                })()
              : undefined
          }
          className="w-36 h-8 bg-card px-2 font-medium mx-auto"
        />
      </td>
      <td className="w-6">{dirty && <Loader className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}</td>
      <td className="w-12 !px-2 text-center">
        {product.stock_only && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(product)}
            className="hover:text-danger"
            title="Excluir item"
            aria-label="Excluir item"
          >
            <Trash2 />
          </Button>
        )}
      </td>
    </tr>
  )
}

function TargetCell({
  productId,
  storeId,
  target,
  dimZero,
  onSave,
}: {
  productId: string
  storeId: string
  target: Target | undefined
  // Loja satélite: meta 0 = "não trabalha com o produto" (fora do sortimento
  // da contagem), então a célula zerada renderiza apagada de propósito.
  dimZero: boolean
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
        className={`w-16 h-8 rounded-md border border-input text-center text-[13px] font-semibold tabular-nums text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          dimZero && qty === 0 ? 'bg-muted text-muted-foreground opacity-50' : 'bg-card'
        }`}
      />
      {dirty && <Loader className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
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
  onRename,
}: {
  category: StockCategory
  isFirst: boolean
  isLast: boolean
  isPending: boolean
  onReorder: (direction: 'up' | 'down') => void
  onColorChange: (colorIndex: number) => void
  onRename: (newName: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const color = getCategoryColor(category.color_index)

  useEffect(() => {
    setName(category.name)
  }, [category.name])

  const commitName = () => {
    setEditing(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setName(category.name)
      return
    }
    onRename(trimmed)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5 rounded-md pl-1 pr-1 py-1" style={{ backgroundColor: color.bg }}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="w-4 h-4 rounded-full border border-black/10 shrink-0 ml-0.5"
          style={{ backgroundColor: color.text }}
          title="Trocar cor"
        />
        {editing ? (
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setName(category.name); setEditing(false) }
            }}
            className="w-28 h-6 mx-1 rounded-sm border-0 text-[12.5px] font-medium bg-card/80 px-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ color: color.text }}
          />
        ) : (
          <span
            className="text-[12.5px] font-medium mx-1.5 cursor-pointer"
            style={{ color: color.text }}
            onClick={() => setEditing(true)}
            title="Clique para renomear"
          >
            {category.name}
          </span>
        )}
        <button
          onClick={() => onReorder('up')}
          disabled={isFirst || isPending}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-card/50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          style={{ color: color.text }}
          title="Mover pra cima"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onReorder('down')}
          disabled={isLast || isPending}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-card/50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          style={{ color: color.text }}
          title="Mover pra baixo"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      {showPicker && (
        <div className="flex flex-wrap gap-1 bg-card border border-border rounded-md p-1.5 shadow-md max-w-[160px]">
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

  // Renomear categoria propaga o novo nome pros produtos — stock_category em
  // catalog_products é texto livre sem FK (ver migration 20260702000011).
  const renameCategory = useMutation({
    mutationFn: async ({ category, newName }: { category: StockCategory; newName: string }) => {
      const { error } = await supabase.from('stock_categories').update({ name: newName }).eq('id', category.id)
      if (error) {
        if (error.code === '23505') throw new Error(`Já existe uma categoria chamada "${newName}"`)
        throw error
      }
      const { error: propagateError } = await supabase
        .from('catalog_products')
        .update({ stock_category: newName })
        .eq('stock_category', category.name)
      if (propagateError) throw propagateError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-categories'] })
      queryClient.invalidateQueries({ queryKey: ['stock-products-config'] })
      queryClient.invalidateQueries({ queryKey: ['stock-products'] })
      toast.success('Categoria renomeada')
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['stock-categories'] })
      toast.error(`Erro ao renomear: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
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
    mutationFn: async (input: { names: string[]; stock_category: string | null; units_per_box: number | null; package_type: string | null }) => {
      const rows = input.names.map((name) => ({
        name,
        price: 0,
        is_active: false,
        stock_only: true,
        source: 'stock_only',
        stock_category: input.stock_category,
        units_per_box: input.units_per_box,
        package_type: input.package_type,
      }))
      const { error } = await supabase.from('catalog_products').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['stock-products-config'] })
      queryClient.invalidateQueries({ queryKey: ['stock-products'] })
      setNewItem({ name: '', stock_category: '', units_per_box: '', package_type: '' })
      setShowNewItemForm(false)
      toast.success(count === 1 ? 'Item criado' : `${count} itens criados`)
    },
    onError: (err) => toast.error(`Erro ao criar itens: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  // Cada linha do textarea vira um item — categoria/embalagem/itens-caixa
  // escolhidos valem pra todos (dá pra ajustar depois, item a item, na tabela).
  const parsedNewItemNames = useMemo(() => {
    const seen = new Set<string>()
    return newItem.name
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => {
        if (!n || seen.has(n.toLowerCase())) return false
        seen.add(n.toLowerCase())
        return true
      })
  }, [newItem.name])

  const handleCreateStockOnlyItem = () => {
    if (parsedNewItemNames.length === 0) {
      toast.error('Informe pelo menos um nome')
      return
    }
    createStockOnlyItem.mutate({
      names: parsedNewItemNames,
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

  const { data: storesRaw = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, slug, type').order('name')
      if (error) throw error
      return (data || []) as StoreOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Ordem fixa das colunas de loja (Linhares, Serra, Colatina, Teixeira, São
  // Gabriel) — mesma ordem usada em /estoque/atual, ver src/lib/storeOrder.ts.
  const stores = useMemo(() => sortByStoreOrder(storesRaw), [storesRaw])

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

  // Excluir item só-contagem. Item já citado em stock_count_items /
  // replenishment_orders tem FK ON DELETE RESTRICT — não dá pra apagar sem
  // destruir histórico. Fallback: desliga stock_only (is_active já é false),
  // o que tira o item da view stock_countable_products preservando o histórico.
  const deleteStockOnlyItem = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase.from('catalog_products').delete().eq('id', product.id)
      if (!error) return 'deleted' as const
      if (error.code !== '23503') throw error
      const { error: hideError } = await supabase.from('catalog_products').update({ stock_only: false }).eq('id', product.id)
      if (hideError) throw hideError
      return 'hidden' as const
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stock-products-config'] })
      queryClient.invalidateQueries({ queryKey: ['stock-products'] })
      toast.success(result === 'deleted' ? 'Item excluído' : 'Item removido da contagem (histórico de contagens preservado)')
    },
    onError: (err) => toast.error(`Erro ao excluir item: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleDeleteProduct = useCallback(
    (product: Product) => {
      if (!product.stock_only) return
      if (!confirm(`Excluir "${product.name}" da contagem? Esta ação não pode ser desfeita.`)) return
      deleteStockOnlyItem.mutate(product)
    },
    [deleteStockOnlyItem]
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

  // Copia as metas preenchidas (> 0) de uma loja pra outra — metas zeradas na
  // origem não zeram a loja destino (só sobrescreve o que existe na origem).
  const [copyFromStore, setCopyFromStore] = useState('')
  const [copyToStore, setCopyToStore] = useState('')

  const copyTargets = useMutation({
    mutationFn: async ({ fromStoreId, toStoreId }: { fromStoreId: string; toStoreId: string }) => {
      const rows = products
        .map((p) => targetsByProductStore.get(`${p.id}:${fromStoreId}`))
        .filter((t): t is Target => !!t && t.target_quantity > 0)
        .map((t) => ({ product_id: t.product_id, store_id: toStoreId, target_quantity: t.target_quantity }))
      const { error } = await supabase
        .from('store_stock_targets')
        .upsert(rows, { onConflict: 'product_id,store_id' })
      if (error) throw error
      return rows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['store-stock-targets-all'] })
      toast.success(`${count} metas copiadas`)
    },
    onError: (err) => toast.error(`Erro ao copiar metas: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleCopyTargets = () => {
    const from = stores.find((s) => s.id === copyFromStore)
    const to = stores.find((s) => s.id === copyToStore)
    if (!from || !to || from.id === to.id) return
    const count = products.filter((p) => (targetsByProductStore.get(`${p.id}:${from.id}`)?.target_quantity ?? 0) > 0).length
    if (count === 0) {
      toast.error(`"${from.name}" não tem metas preenchidas pra copiar`)
      return
    }
    if (!confirm(`Copiar ${count} metas de "${from.name}" para "${to.name}"? Metas já preenchidas em "${to.name}" serão sobrescritas.`)) return
    copyTargets.mutate({ fromStoreId: from.id, toStoreId: to.id })
  }

  // useMemo ANTES do early return: hook depois de `return <Navigate>` violava
  // a regra dos hooks (ordem de hooks muda se o role mudar entre renders).
  const categoryOrderByName = useMemo(() => {
    const map = new Map<string, number>()
    categories.forEach((c) => map.set(c.name, c.sort_order))
    return map
  }, [categories])

  if (role !== 'admin' && role !== 'administrativo') {
    return <Navigate to="/estoque/contagem" replace />
  }

  const filteredProducts = products
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const orderA = a.stock_category ? categoryOrderByName.get(a.stock_category) ?? Infinity : Infinity
      const orderB = b.stock_category ? categoryOrderByName.get(b.stock_category) ?? Infinity : Infinity
      if (orderA !== orderB) return orderA - orderB
      return naturalCompare(a.name, b.name)
    })

  return (
    <EstoqueLayout>
      <AdminPage
        title="Configurações do estoque"
        description="Kits (compostos por outros produtos) não aparecem aqui nem na contagem — conte os componentes separadamente."
        tabs={
          <PageTabs
            items={TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
            value={activeTab}
            onChange={(k) => setActiveTab(k)}
          />
        }
        toolbar={
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar produto…" className="sm:w-80" />
          </Toolbar>
        }
      >
        {activeTab === 'classificacao' && (
          <div className="space-y-4">
            <div className="flex items-center justify-end flex-wrap gap-2">
              <Input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory() }}
                placeholder="Nova categoria (ex: Óleo)"
                aria-label="Nome da nova categoria"
                className="w-full sm:w-52"
              />
              <Button
                variant="secondary"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || createCategory.isPending}
              >
                <Plus /> Categoria
              </Button>
              <Button onClick={() => setShowNewItemForm((v) => !v)}>
                <Plus /> Item só contagem
              </Button>
            </div>

            {categories.length > 0 && (
              <Panel
                title="Ordem das categorias"
                description="Clique no nome para renomear — contagem e classificação seguem esta ordem"
              >
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
                      onRename={(newName) => renameCategory.mutate({ category: cat, newName })}
                    />
                  ))}
                </div>
              </Panel>
            )}

            {showNewItemForm && (
              <Panel
                title="Novos itens só para contagem"
                description="Não entram no catálogo de venda"
                actions={<Button variant="ghost" size="sm" onClick={() => setShowNewItemForm(false)}>Cancelar</Button>}
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <Textarea
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      placeholder={'Um nome por linha — cole uma lista pra criar vários de uma vez:\nDetergente 5L\nPapel toalha\nÁlcool 70%'}
                      rows={4}
                      aria-label="Nomes dos itens"
                      className="sm:col-span-2 resize-y"
                    />
                    <StyledSelect
                      value={newItem.stock_category}
                      onChange={(v) => setNewItem({ ...newItem, stock_category: v })}
                      options={categories.map((c) => ({ value: c.name, label: c.name, dotColor: getCategoryColor(c.color_index).bg }))}
                      emptyLabel="Sem categoria"
                      placeholder="Sem categoria"
                    />
                    <StyledSelect
                      value={newItem.package_type}
                      onChange={(v) => setNewItem({ ...newItem, package_type: v, ...(v === 'UND' ? { units_per_box: '1' } : {}) })}
                      options={PACKAGE_OPTIONS}
                      emptyLabel="Embalagem"
                      placeholder="Embalagem"
                      searchable={false}
                    />
                  </div>
                  <div className="flex items-center flex-wrap gap-2.5">
                    <Input
                      type="number"
                      min={1}
                      value={newItem.units_per_box}
                      onChange={(e) => setNewItem({ ...newItem, units_per_box: e.target.value })}
                      placeholder="Itens/caixa (opcional)"
                      aria-label="Itens por caixa"
                      className="w-44"
                    />
                    <Button
                      onClick={handleCreateStockOnlyItem}
                      disabled={parsedNewItemNames.length === 0 || createStockOnlyItem.isPending}
                    >
                      {createStockOnlyItem.isPending ? <Loader className="animate-spin" /> : <Plus />}
                      {parsedNewItemNames.length > 1 ? `Criar ${parsedNewItemNames.length} itens` : 'Criar item'}
                    </Button>
                    {parsedNewItemNames.length > 1 && (
                      <span className="text-[12px] text-muted-foreground">Categoria e embalagem valem pra todos — dá pra ajustar item a item depois, na tabela.</span>
                    )}
                  </div>
                </div>
              </Panel>
            )}

            <Panel flush>
              {productsLoading ? (
                <PageLoading />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th className="!text-center">Itens/caixa</th>
                        <th className="!text-center">Embalagem</th>
                        <th className="!text-center">Categoria de estoque</th>
                        <th className="w-6" aria-label="Salvando"></th>
                        <th className="w-12" aria-label="Ações"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => (
                        <ClassificationRow key={p.id} product={p} categories={categories} onSave={handleSaveProduct} onDelete={handleDeleteProduct} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'metas' && (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground max-w-prose">
              Cada loja tem seu próprio porte — defina a meta ideal (em unidades) por loja, lado a lado.
              Nas lojas satélite, meta vazia/0 = a loja não trabalha com o produto (ele não aparece na contagem dela) e contagem abaixo da meta gera pedido de reposição enviado pela central.
              A central conta o catálogo inteiro, independente de meta — lá, a meta é o ponto mínimo de estoque: contagem abaixo dela sinaliza "comprar do fornecedor" na revisão da contagem, sem gerar pedido interno.
            </p>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[13px] font-medium text-foreground flex items-center gap-1.5"><Copy className="w-4 h-4 text-ink-400" /> Copiar metas</span>
              <StyledSelect
                variant="inline"
                value={copyFromStore}
                onChange={setCopyFromStore}
                options={stores.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Loja de origem"
              />
              <ArrowRight className="w-4 h-4 text-ink-400" />
              <StyledSelect
                variant="inline"
                value={copyToStore}
                onChange={setCopyToStore}
                options={stores.filter((s) => s.id !== copyFromStore).map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Loja de destino"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyTargets}
                disabled={!copyFromStore || !copyToStore || copyFromStore === copyToStore || copyTargets.isPending}
              >
                {copyTargets.isPending ? <Loader className="animate-spin" /> : <Copy />}
                Copiar
              </Button>
            </div>
            <Panel flush>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10">Produto</th>
                      {stores.map((s) => (
                        <th key={s.id} className="!text-center whitespace-nowrap">
                          {s.name}
                          {s.type === 'central' && <span className="block text-[11.5px] font-normal text-muted-foreground">central — conta tudo</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td className="font-medium text-foreground sticky left-0 z-10 bg-card whitespace-nowrap">{p.name}</td>
                        {stores.map((s) => (
                          <td key={s.id} className="!px-2">
                            <TargetCell
                              productId={p.id}
                              storeId={s.id}
                              target={targetsByProductStore.get(`${p.id}:${s.id}`)}
                              dimZero={s.type === 'satellite'}
                              onSave={handleSaveTarget}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}
      </AdminPage>
    </EstoqueLayout>
  )
}
