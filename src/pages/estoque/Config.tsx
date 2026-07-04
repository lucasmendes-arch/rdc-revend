import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Search, Package, Plus, Tags, Target as TargetIcon, ChevronUp, ChevronDown, Pencil, Trash2, ImagePlus, Copy, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { STOCK_CATEGORY_PALETTE, getCategoryColor } from '@/lib/stockCategoryColors'
import { naturalCompare } from '@/lib/naturalSort'

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

// Redimensiona a foto no cliente (máx 1000px, JPEG) — o bucket product-images
// tem limite de 5MB e foto de celular passa disso fácil.
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const maxDim = 1000
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao processar imagem'))), 'image/jpeg', 0.85)
  })
}

const BUCKET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function ClassificationRow({ product, categories, onSave, onDelete }: { product: Product; categories: StockCategory[]; onSave: (id: string, updates: Partial<Product>) => void; onDelete: (product: Product) => void }) {
  const [unitsPerBox, setUnitsPerBox] = useState(product.units_per_box ?? '')
  const [packageType, setPackageType] = useState(product.package_type ?? '')
  const [stockCategory, setStockCategory] = useState(product.stock_category ?? '')
  // Nome só é editável em itens stock_only — produtos B2B têm nome/imagem
  // vindos do sync Nuvemshop (seriam sobrescritos no próximo sync).
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(product.name)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const [dirty, setDirty] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Foto só em itens stock_only — em produtos B2B a main_image vem do sync
  // da Nuvemshop e seria sobrescrita.
  const handlePhotoSelect = async (file: File) => {
    setUploadingPhoto(true)
    try {
      let blob: Blob
      let ext = 'jpg'
      try {
        blob = await compressImage(file)
      } catch {
        // Formato que o navegador não decodifica — tenta subir o original.
        if (!BUCKET_MIME_TYPES.includes(file.type)) throw new Error('Formato não suportado — use JPG, PNG ou WebP')
        if (file.size > 5 * 1024 * 1024) throw new Error('Imagem maior que 5MB')
        blob = file
        ext = file.type.replace('image/', '').replace('jpeg', 'jpg')
      }
      const path = `stock-only/${product.id}-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      onSave(product.id, { main_image: data.publicUrl })
      toast.success('Foto adicionada')
    } catch (err) {
      toast.error(`Erro ao enviar foto: ${err instanceof Error ? err.message : 'desconhecido'}`)
    } finally {
      setUploadingPhoto(false)
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
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2.5">
          {product.stock_only ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-surface-alt border border-border hover:ring-2 hover:ring-amber-400 transition-shadow"
                title={product.main_image ? 'Trocar foto' : 'Adicionar foto'}
              >
                {uploadingPhoto ? (
                  <div className="w-full h-full flex items-center justify-center"><Loader className="w-3.5 h-3.5 animate-spin text-amber-500" /></div>
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
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-surface-alt border border-border">
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
                className="w-full max-w-[220px] h-7 rounded-lg border border-input text-sm bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            ) : (
              <span
                className={`font-medium text-foreground truncate max-w-[220px] block ${product.stock_only ? 'cursor-pointer hover:text-amber-700' : ''}`}
                onClick={product.stock_only ? () => setEditingName(true) : undefined}
                title={product.stock_only ? 'Clique para renomear' : 'Nome vem do sync da Nuvemshop — edite lá'}
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
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 uppercase">Só contagem</span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Catálogo atacado</span>
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
            // UND = item avulso, então itens/caixa é sempre 1.
            if (val === 'UND') {
              setUnitsPerBox(1)
              scheduleSave({ package_type: val, units_per_box: 1 })
            } else {
              scheduleSave({ package_type: val })
            }
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
      <td className="w-10 px-2 text-center">
        {product.stock_only && (
          <button
            onClick={() => onDelete(product)}
            className="text-muted-foreground hover:text-red-600 transition-colors"
            title="Excluir item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
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
        className={`w-16 h-8 rounded-lg border border-input text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 ${
          dimZero && qty === 0 ? 'bg-surface-alt text-muted-foreground opacity-50' : 'bg-white'
        }`}
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
      <div className="flex items-center gap-0.5 rounded-lg pl-1 pr-1 py-1" style={{ backgroundColor: color.bg }}>
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
            className="w-28 h-5 mx-1 rounded border-0 text-xs font-medium bg-white/80 px-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            style={{ color: color.text }}
          />
        ) : (
          <span
            className="text-xs font-medium mx-1.5 cursor-pointer"
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

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, slug, type').order('name')
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
      return naturalCompare(a.name, b.name)
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
                Ordem das categorias — clique no nome para renomear (contagem e classificação seguem esta ordem)
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
                    onRename={(newName) => renameCategory.mutate({ category: cat, newName })}
                  />
                ))}
              </div>
            </div>
          )}

          {showNewItemForm && (
            <div className="bg-white rounded-2xl border border-teal-200 shadow-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-700">Novos itens — só pra contagem (não entram no catálogo de venda)</p>
                <button onClick={() => setShowNewItemForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <textarea
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder={'Um nome por linha — cole uma lista pra criar vários de uma vez:\nDetergente 5L\nPapel toalha\nÁlcool 70%'}
                  rows={4}
                  className="sm:col-span-2 rounded-lg border border-input text-sm bg-white px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
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
                  onChange={(e) => setNewItem({ ...newItem, package_type: e.target.value, ...(e.target.value === 'UND' ? { units_per_box: '1' } : {}) })}
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
                  disabled={parsedNewItemNames.length === 0 || createStockOnlyItem.isPending}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-lg btn-gold text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createStockOnlyItem.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {parsedNewItemNames.length > 1 ? `Criar ${parsedNewItemNames.length} itens` : 'Criar item'}
                </button>
                {parsedNewItemNames.length > 1 && (
                  <span className="text-[11px] text-muted-foreground">Categoria e embalagem valem pra todos — dá pra ajustar item a item depois, na tabela.</span>
                )}
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
                      <th className="w-10"></th>
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
          </div>
        </section>
      )}

      {activeTab === 'metas' && (
        <section className="space-y-2 pb-8">
          <p className="text-xs text-muted-foreground px-1">
            Cada loja tem seu próprio porte — defina a meta ideal (em unidades) por loja, lado a lado.
            Nas lojas satélite, meta vazia/0 = a loja não trabalha com o produto (ele não aparece na contagem dela).
            A central conta o catálogo inteiro, independente de meta.
          </p>
          <div className="flex items-center flex-wrap gap-1.5 px-1">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar metas:</span>
            <select
              value={copyFromStore}
              onChange={(e) => setCopyFromStore(e.target.value)}
              className="h-8 rounded-lg border border-input text-xs bg-white px-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Loja de origem</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={copyToStore}
              onChange={(e) => setCopyToStore(e.target.value)}
              className="h-8 rounded-lg border border-input text-xs bg-white px-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Loja de destino</option>
              {stores.filter((s) => s.id !== copyFromStore).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              onClick={handleCopyTargets}
              disabled={!copyFromStore || !copyToStore || copyFromStore === copyToStore || copyTargets.isPending}
              className="flex items-center gap-1 px-3 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {copyTargets.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              Copiar
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground sticky left-0 bg-surface-alt">Produto</th>
                    {stores.map((s) => (
                      <th key={s.id} className="px-4 py-2.5 text-center text-xs font-semibold text-foreground whitespace-nowrap">
                        {s.name}
                        {s.type === 'central' && <span className="block text-[9px] font-medium text-muted-foreground normal-case">central — conta tudo</span>}
                      </th>
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
          </div>
        </section>
      )}
    </EstoqueLayout>
  )
}
