import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Search, AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Minus, Plus, PackageCheck, CheckCircle2, CircleSlash } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { getCategoryColor } from '@/lib/stockCategoryColors'
import { naturalCompare } from '@/lib/naturalSort'

interface Product {
  id: string
  name: string
  main_image: string | null
  units_per_box: number | null
  package_type: string | null
  stock_category: string | null
}

interface StockCountItem {
  id: string
  product_id: string
  closed_boxes: number
  loose_units: number
  total_units: number | null
}

interface StockCount {
  id: string
  store_id: string
  status: 'draft' | 'confirmed'
  created_at: string
  confirmed_at: string | null
}

interface StockCategoryOption {
  id: string
  name: string
  sort_order: number
  color_index: number
}

// ─── Stepper — linha compacta: label à esquerda, botões grandes à direita ───

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide min-w-0 truncate">{label}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value === 0}
          className="w-10 h-9 rounded-xl border border-border bg-surface-alt flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30 shrink-0"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-12 h-9 rounded-xl border border-input text-center text-base font-bold bg-white disabled:bg-surface-alt disabled:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={disabled}
          className="w-10 h-9 rounded-xl border border-border bg-surface-alt flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30 shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Card de produto ────────────────────────────────────────────────────────

function ProductCard({
  product,
  item,
  readOnly,
  onSave,
}: {
  product: Product
  item: StockCountItem | undefined
  readOnly: boolean
  onSave: (productId: string, closedBoxes: number, looseUnits: number) => Promise<void>
}) {
  const unclassified = product.units_per_box == null
  const disabled = readOnly || unclassified
  const [closedBoxes, setClosedBoxes] = useState(item?.closed_boxes ?? 0)
  const [looseUnits, setLooseUnits] = useState(item?.loose_units ?? 0)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setClosedBoxes(item?.closed_boxes ?? 0)
    setLooseUnits(item?.loose_units ?? 0)
    setDirty(false)
  }, [item?.closed_boxes, item?.loose_units])

  const schedule = useCallback((nextClosed: number, nextLoose: number) => {
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSave(product.id, nextClosed, nextLoose).finally(() => setDirty(false))
    }, 600)
  }, [product.id, onSave])

  const previewTotal = unclassified ? null : closedBoxes * (product.units_per_box as number) + looseUnits
  const hasValue = closedBoxes > 0 || looseUnits > 0
  // Stepper de caixas só em item com embalagem CX — UND/sem embalagem conta
  // só por unidade avulsa. Se um registro antigo já tiver caixas > 0, o
  // stepper continua visível pra não esconder dado preenchido.
  const showBoxes = product.package_type === 'CX' || closedBoxes > 0
  // "Contado" = existe registro na contagem (mesmo com 0/0 — item zerado é
  // uma contagem válida e gera reposição da meta cheia na confirmação).
  const counted = item !== undefined || hasValue
  const isZeroed = item !== undefined && item.closed_boxes === 0 && item.loose_units === 0 && !hasValue

  const markZero = () => {
    setClosedBoxes(0)
    setLooseUnits(0)
    setDirty(true)
    clearTimeout(timerRef.current)
    onSave(product.id, 0, 0).finally(() => setDirty(false))
  }

  return (
    <div className={`rounded-2xl border p-3 flex gap-3 transition-colors ${
      unclassified
        ? 'border-amber-200 bg-amber-50/40'
        : isZeroed
          // Zerado = em falta: o card inteiro fica permanentemente vermelho claro
          ? 'border-red-200 bg-red-50/50 hover:bg-red-50'
          : counted
            ? 'border-green-200 bg-green-50/30'
            : 'border-border bg-white'
    }`}>
      {/* Imagem grande à esquerda — identificação visual rápida do produto */}
      {/* Escalona pela largura real do aparelho — em telas ≤ 400px a imagem
          encolhe pra sobrar largura mínima pros steppers sem estourar a página */}
      <div className="w-24 h-24 min-[420px]:w-28 min-[420px]:h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden shrink-0 bg-white border border-border self-center">
        {product.main_image ? (
          <img src={product.main_image} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-alt text-muted-foreground text-2xl font-bold">
            {product.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Nome + controles orientados à direita */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">{product.name}</p>
            {unclassified ? (
              <p className="flex items-center gap-1 text-[11px] text-amber-700 font-medium mt-0.5">
                <AlertTriangle className="w-3 h-3 shrink-0" /> não classificado
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {product.package_type === 'CX' ? `${product.units_per_box} un./caixa` : 'conta por unidade avulsa'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {dirty && <Loader className="w-3.5 h-3.5 animate-spin text-amber-500" />}
            {previewTotal != null && (
              <div className="text-right">
                <p className="text-xl font-black text-foreground leading-none">{previewTotal}</p>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wide mt-0.5">total</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {showBoxes && (
            <Stepper
              label="Caixas"
              value={closedBoxes}
              disabled={disabled}
              onChange={(v) => { setClosedBoxes(v); schedule(v, looseUnits) }}
            />
          )}
          <Stepper
            label="Avulsas"
            value={looseUnits}
            disabled={disabled}
            onChange={(v) => { setLooseUnits(v); schedule(closedBoxes, v) }}
          />
        </div>

        {!disabled && (
          isZeroed ? (
            <p className="flex items-center justify-center gap-1.5 py-1 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-500">
              <CircleSlash className="w-3.5 h-3.5" /> Zerado — sem estoque
            </p>
          ) : (
            <button
              type="button"
              onClick={markZero}
              className="w-full flex items-center justify-center gap-1.5 py-1 rounded-xl bg-red-50 border border-red-100 text-xs font-semibold text-red-400 hover:text-red-600 hover:bg-red-100 active:scale-[0.99] transition-all"
            >
              <CircleSlash className="w-3.5 h-3.5" /> Zerado — sem estoque
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ─── Seção de categoria (colapsável) ────────────────────────────────────────

function CategorySection({
  sectionRef,
  category,
  colorIndex,
  products,
  itemsByProduct,
  readOnly,
  collapsed,
  onToggle,
  onSave,
}: {
  sectionRef?: (el: HTMLElement | null) => void
  category: string
  colorIndex: number | undefined
  products: Product[]
  itemsByProduct: Map<string, StockCountItem>
  readOnly: boolean
  collapsed: boolean
  onToggle: () => void
  onSave: (productId: string, closedBoxes: number, looseUnits: number) => Promise<void>
}) {
  // Item com registro (mesmo 0/0 = zerado) conta como preenchido.
  const filledCount = products.filter((p) => itemsByProduct.has(p.id)).length

  // "Sem categoria" fica neutro (cinza) — não é uma categoria real com cor própria.
  const color = category === 'Sem categoria' ? { bg: '#F3F4F6', text: '#6B7280' } : getCategoryColor(colorIndex)

  return (
    <section ref={sectionRef} className="space-y-2 scroll-mt-32">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-1.5"
      >
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-1 rounded-lg text-sm font-semibold uppercase tracking-wide"
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            {category}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            filledCount === products.length ? 'bg-green-100 text-green-700' : 'bg-surface-alt text-muted-foreground'
          }`}>
            {filledCount}/{products.length}
          </span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              item={itemsByProduct.get(product.id)}
              readOnly={readOnly}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Tela principal ─────────────────────────────────────────────────────────

export default function EstoqueContagemDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const { data: stockCount, isLoading: countLoading } = useQuery<StockCount | null>({
    queryKey: ['stock-count-by-id', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id, store_id, status, created_at, confirmed_at')
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw error
      return data as StockCount | null
    },
    enabled: !!id,
  })

  // Sortimento por loja: a central (Linhares) conta o catálogo inteiro; as
  // satélites contam só produtos com meta > 0 em store_stock_targets — a
  // matriz de metas de /estoque/config é o cadastro de "quais produtos a
  // loja trabalha" (meta vazia/0 = não trabalha). Ver docs/decisions.md.
  const storeId = stockCount?.store_id

  const { data: countStore, isLoading: storeLoading } = useQuery<{ id: string; type: 'central' | 'satellite' } | null>({
    queryKey: ['store-type', storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, type').eq('id', storeId as string).maybeSingle()
      if (error) throw error
      return data as { id: string; type: 'central' | 'satellite' } | null
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  })
  const isSatellite = countStore?.type === 'satellite'

  const { data: storeTargets = [], isLoading: targetsLoading } = useQuery<{ product_id: string; target_quantity: number }[]>({
    queryKey: ['store-stock-targets', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_stock_targets')
        .select('product_id, target_quantity')
        .eq('store_id', storeId as string)
      if (error) throw error
      return (data || []) as { product_id: string; target_quantity: number }[]
    },
    enabled: !!storeId && isSatellite,
  })

  const { data: stockCategories = [] } = useQuery<StockCategoryOption[]>({
    queryKey: ['stock-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_categories').select('id, name, sort_order, color_index').order('sort_order').order('name')
      if (error) throw error
      return (data || []) as StockCategoryOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['stock-products'],
    queryFn: async () => {
      // stock_countable_products = catalog_products ativos ou stock_only,
      // sempre excluindo kits (kit_components) — não faz sentido contar
      // "o kit", só os componentes que o compõem. Ordem final por categoria
      // (sort_order manual) é aplicada no client, ver `groups` abaixo.
      const { data, error } = await supabase
        .from('stock_countable_products')
        .select('id, name, main_image, units_per_box, package_type, stock_category')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as Product[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: items = [] } = useQuery<StockCountItem[]>({
    queryKey: ['stock-count-items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_count_items')
        .select('id, product_id, closed_boxes, loose_units, total_units')
        .eq('stock_count_id', id as string)
      if (error) throw error
      return (data || []) as StockCountItem[]
    },
    enabled: !!id,
  })

  const itemsByProduct = useMemo(() => {
    const map = new Map<string, StockCountItem>()
    for (const item of items) map.set(item.product_id, item)
    return map
  }, [items])

  const saveItem = useMutation({
    mutationFn: async ({ productId, closedBoxes, looseUnits }: { productId: string; closedBoxes: number; looseUnits: number }) => {
      const { error } = await supabase
        .from('stock_count_items')
        .upsert(
          { stock_count_id: id, product_id: productId, closed_boxes: closedBoxes, loose_units: looseUnits },
          { onConflict: 'stock_count_id,product_id' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count-items', id] })
    },
    onError: (err) => {
      toast.error(`Erro ao salvar item: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  const handleSaveItem = useCallback(
    (productId: string, closedBoxes: number, looseUnits: number) =>
      saveItem.mutateAsync({ productId, closedBoxes, looseUnits }),
    [saveItem]
  )

  const assortmentProducts = useMemo(() => {
    if (!isSatellite) return products
    const allowed = new Set(storeTargets.filter((t) => t.target_quantity > 0).map((t) => t.product_id))
    // Item já contado neste rascunho nunca some da tela, mesmo que o admin
    // tenha zerado a meta depois — não sumir com dado que o funcionário digitou.
    return products.filter((p) => allowed.has(p.id) || itemsByProduct.has(p.id))
  }, [products, isSatellite, storeTargets, itemsByProduct])

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return assortmentProducts
    return assortmentProducts.filter((p) => p.name.toLowerCase().includes(q))
  }, [assortmentProducts, search])

  const categoryOrderByName = useMemo(() => {
    const orderMap = new Map<string, number>()
    stockCategories.forEach((c) => orderMap.set(c.name, c.sort_order))
    return orderMap
  }, [stockCategories])

  const categoryColorByName = useMemo(() => {
    const colorMap = new Map<string, number>()
    stockCategories.forEach((c) => colorMap.set(c.name, c.color_index))
    return colorMap
  }, [stockCategories])

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of filteredProducts) {
      const key = p.stock_category || 'Sem categoria'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    // Ordem natural dentro da categoria (Tonalizante 2 antes do 10, 7.1 antes do 7.12)
    for (const arr of map.values()) arr.sort((a, b) => naturalCompare(a.name, b.name))
    return Array.from(map.entries()).sort(([a], [b]) => {
      // "Sem categoria" sempre por último; as demais seguem sort_order
      // manual (ex: ordem física dos corredores da loja), com nome como
      // desempate.
      if (a === 'Sem categoria') return 1
      if (b === 'Sem categoria') return -1
      const orderA = categoryOrderByName.get(a) ?? Infinity
      const orderB = categoryOrderByName.get(b) ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }, [filteredProducts, categoryOrderByName])

  const jumpToCategory = useCallback((category: string) => {
    setCollapsedMap((prev) => ({ ...prev, [category]: false }))
    // Espera o próximo frame pra seção já estar expandida antes de rolar até ela.
    requestAnimationFrame(() => {
      sectionRefs.current[category]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // Progresso: produto "contado" = tem registro na contagem (inclui zerados).
  const totalProducts = assortmentProducts.length
  const countedProducts = useMemo(
    () => assortmentProducts.filter((p) => itemsByProduct.has(p.id)).length,
    [assortmentProducts, itemsByProduct]
  )
  const progressPct = totalProducts > 0 ? Math.round((countedProducts / totalProducts) * 100) : 0
  const readOnly = stockCount?.status === 'confirmed'

  // Espera também o tipo da loja/metas pra não piscar a lista completa
  // numa loja satélite antes do filtro de sortimento entrar.
  if (countLoading || productsLoading || storeLoading || (isSatellite && targetsLoading)) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando contagem…</p>
        </div>
      </EstoqueLayout>
    )
  }

  if (!stockCount) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Contagem não encontrada.</p>
          <Link to="/estoque/contagem" className="text-sm text-amber-700 font-semibold hover:underline">
            Voltar ao histórico
          </Link>
        </div>
      </EstoqueLayout>
    )
  }

  return (
    <EstoqueLayout>
      <div className="pb-24 space-y-6">
        {/* Cabeçalho sticky com busca */}
        <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-surface-alt/95 backdrop-blur-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link to="/estoque/contagem" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Histórico
            </Link>
            <p className="text-xs text-muted-foreground">
              {new Date(stockCount.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {countedProducts}/{totalProducts} contado{countedProducts !== 1 ? 's' : ''}
            </p>
          </div>

          {totalProducts > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-border/70 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${progressPct === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums shrink-0 ${progressPct === 100 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {progressPct}%
              </span>
            </div>
          )}

          {readOnly && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-xs text-green-800 font-medium">
                Contagem confirmada em {stockCount.confirmed_at ? new Date(stockCount.confirmed_at).toLocaleString('pt-BR') : '—'} — somente leitura.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input text-sm bg-white text-foreground focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
            {groups.length > 1 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) jumpToCategory(e.target.value) }}
                className="h-[42px] rounded-xl border border-input text-sm bg-white px-2.5 text-foreground focus:ring-2 focus:ring-amber-400 focus:outline-none shrink-0 max-w-[45%]"
              >
                <option value="">Ir pra categoria…</option>
                {groups.map(([category]) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {groups.map(([category, categoryProducts]) => (
          <CategorySection
            key={category}
            sectionRef={(el) => { sectionRefs.current[category] = el }}
            category={category}
            colorIndex={categoryColorByName.get(category)}
            collapsed={!!collapsedMap[category]}
            onToggle={() => setCollapsedMap((prev) => ({ ...prev, [category]: !prev[category] }))}
            products={categoryProducts}
            itemsByProduct={itemsByProduct}
            readOnly={readOnly}
            onSave={handleSaveItem}
          />
        ))}

        {groups.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              {isSatellite && assortmentProducts.length === 0
                ? 'Nenhum produto cadastrado pra esta loja ainda — o sortimento é definido pelas metas de estoque (meta > 0) em Configurações.'
                : 'Nenhum produto encontrado.'}
            </p>
          </div>
        )}
      </div>

      {/* Barra fixa de confirmação */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border px-4 sm:px-6 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => navigate(`/estoque/contagem/${id}/confirmar`)}
            disabled={countedProducts === 0}
            className="w-full max-w-6xl mx-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl btn-gold text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PackageCheck className="w-4 h-4" />
            Revisar e Confirmar {countedProducts > 0 ? `(${countedProducts}/${totalProducts})` : ''}
          </button>
        </div>
      )}
    </EstoqueLayout>
  )
}
