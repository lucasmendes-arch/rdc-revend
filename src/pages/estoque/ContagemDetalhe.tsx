import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Search, AlertTriangle, ChevronDown, ChevronUp, Minus, Plus, PackageCheck, CheckCircle2, CircleSlash, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import EstoqueLayout, { useEstoqueStickyTop } from '@/components/estoque/EstoqueLayout'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getCategoryColor } from '@/lib/stockCategoryColors'
import { naturalCompare } from '@/lib/naturalSort'
import StyledSelect from '@/components/ui/styled-select'

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
// Usado no celular pela equipe da loja: alvos de toque de 44px e número grande.

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
      <p className="text-[12.5px] font-medium text-muted-foreground min-w-0 truncate">{label}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value === 0}
          className="w-11 h-11 rounded-md border border-border bg-card text-foreground flex items-center justify-center hover:bg-muted active:bg-muted transition-colors disabled:opacity-30 shrink-0"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={label}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-14 h-11 rounded-md border border-input text-center text-lg font-semibold tabular-nums bg-card text-foreground disabled:bg-muted disabled:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => onChange(value + 1)}
          disabled={disabled}
          className="w-11 h-11 rounded-md border border-border bg-card text-foreground flex items-center justify-center hover:bg-muted active:bg-muted transition-colors disabled:opacity-30 shrink-0"
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
    <div className={`rounded-lg border p-3 flex gap-3 transition-colors ${
      unclassified
        ? 'border-warning-border bg-warning-subtle'
        : isZeroed
          // Zerado = em falta: o card inteiro fica permanentemente vermelho claro
          ? 'border-danger-border bg-danger-subtle'
          : counted
            ? 'border-success-border bg-success-subtle'
            // Pendente = ainda não contado: destaque laranja pra chamar atenção
            : 'border-warning-border bg-warning-subtle ring-1 ring-warning-border'
    }`}>
      {/* Imagem grande à esquerda — identificação visual rápida do produto */}
      {/* Escalona pela largura real do aparelho — em telas ≤ 400px a imagem
          encolhe pra sobrar largura mínima pros steppers sem estourar a página */}
      <div className="w-20 h-20 min-[420px]:w-28 min-[420px]:h-28 sm:w-32 sm:h-32 rounded-md overflow-hidden shrink-0 bg-card border border-border self-center">
        {product.main_image ? (
          <img src={product.main_image} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted text-ink-400 text-2xl font-semibold">
            {product.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Nome + controles orientados à direita */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground leading-snug">{product.name}</p>
            {unclassified ? (
              <p className="flex items-center gap-1 text-[12px] text-warning font-medium mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Não classificado
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {product.package_type === 'CX' ? `${product.units_per_box} un./caixa` : 'Conta por unidade avulsa'}
              </p>
            )}
            {!unclassified && !counted && (
              <p className="flex items-center gap-1 text-[12px] text-warning font-medium mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Ainda não contado
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {dirty && <Loader className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            {previewTotal != null && (
              <div className="text-right">
                <p className="font-title text-[26px] font-semibold text-foreground leading-none tabular-nums">{previewTotal}</p>
                <p className="text-[11.5px] text-muted-foreground mt-1">total</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
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
            <p className="flex items-center justify-center gap-1.5 h-10 rounded-md border border-danger-border bg-card text-[13px] font-medium text-danger">
              <CircleSlash className="w-4 h-4" /> Zerado — sem estoque
            </p>
          ) : (
            <button
              type="button"
              onClick={markZero}
              className="w-full flex items-center justify-center gap-1.5 h-10 rounded-md border border-danger-border bg-card text-[13px] font-medium text-danger hover:bg-danger-subtle transition-colors"
            >
              <CircleSlash className="w-4 h-4" /> Zerado — sem estoque
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
  scrollMarginClass,
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
  scrollMarginClass: string
}) {
  // Item com registro (mesmo 0/0 = zerado) conta como preenchido.
  const filledCount = products.filter((p) => itemsByProduct.has(p.id)).length

  // "Sem categoria" fica neutro — não é uma categoria real com cor própria.
  const isUncategorized = category === 'Sem categoria'
  const color = isUncategorized ? null : getCategoryColor(colorIndex)

  return (
    <section ref={sectionRef} className={`space-y-2 ${scrollMarginClass}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 px-1 rounded-md hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Cor da categoria é escolhida pelo usuário (exceção categórica) */}
          <span
            className={`inline-flex items-center h-7 px-2.5 rounded-md text-[13px] font-medium truncate ${isUncategorized ? 'bg-muted text-ink-600' : ''}`}
            style={color ? { backgroundColor: color.bg, color: color.text } : undefined}
          >
            {category}
          </span>
          <Badge variant={filledCount === products.length ? 'success' : 'neutral'} className="tabular-nums">
            {filledCount}/{products.length}
          </Badge>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-ink-400 shrink-0" /> : <ChevronUp className="w-4 h-4 text-ink-400 shrink-0" />}
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
  const stickyTop = useEstoqueStickyTop()

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
  const allCounted = totalProducts > 0 && countedProducts === totalProducts
  const readOnly = stockCount?.status === 'confirmed'

  // Espera também o tipo da loja/metas pra não piscar a lista completa
  // numa loja satélite antes do filtro de sortimento entrar.
  if (countLoading || productsLoading || storeLoading || (isSatellite && targetsLoading)) {
    return (
      <EstoqueLayout>
        <AdminPage title="Contagem" back={{ to: '/estoque/contagem', label: 'Histórico' }}>
          <PageLoading label="Carregando contagem…" />
        </AdminPage>
      </EstoqueLayout>
    )
  }

  if (!stockCount) {
    return (
      <EstoqueLayout>
        <AdminPage title="Contagem" back={{ to: '/estoque/contagem', label: 'Histórico' }}>
          <Panel flush>
            <EmptyState
              icon={ClipboardList}
              title="Contagem não encontrada"
              description="Ela pode ter sido apagada ou o link está errado."
              action={<Button variant="secondary" asChild><Link to="/estoque/contagem">Voltar ao histórico</Link></Button>}
            />
          </Panel>
        </AdminPage>
      </EstoqueLayout>
    )
  }

  const createdLabel = new Date(stockCount.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

  return (
    <EstoqueLayout>
      <AdminPage
        title={`Contagem de ${createdLabel}`}
        description={`${countedProducts}/${totalProducts} contado${countedProducts !== 1 ? 's' : ''}`}
        badge={readOnly ? <Badge variant="success">Confirmada</Badge> : <Badge variant="neutral">Rascunho</Badge>}
        back={{ to: '/estoque/contagem', label: 'Histórico' }}
      >
        <div className="space-y-6">
          {/* Barra sticky: progresso + busca + atalho de categoria */}
          <div className={`sticky ${stickyTop} z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur-sm border-b border-border space-y-2.5`}>
            {totalProducts > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progressPct === 100 ? 'bg-success-solid' : 'bg-primary'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className={`text-[12px] font-semibold tabular-nums shrink-0 ${progressPct === 100 ? 'text-success' : 'text-muted-foreground'}`}>
                  {progressPct}%
                </span>
              </div>
            )}

            {readOnly && (
              <div className="flex items-center gap-2 bg-success-subtle border border-success-border rounded-md px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <p className="text-[12.5px] text-success font-medium">
                  Contagem confirmada em {stockCount.confirmed_at ? new Date(stockCount.confirmed_at).toLocaleString('pt-BR') : '—'} — somente leitura.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar produto…"
                  aria-label="Buscar produto"
                  className="h-11 pl-9"
                />
              </div>
              {groups.length > 1 && (
                <StyledSelect
                  value=""
                  onChange={(v) => { if (v) jumpToCategory(v) }}
                  options={groups.map(([category]) => ({ value: category, label: category }))}
                  placeholder="Categoria…"
                  className="w-auto h-11 shrink-0 max-w-[45%]"
                />
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
              scrollMarginClass="scroll-mt-[220px] lg:scroll-mt-40"
            />
          ))}

          {groups.length === 0 && (
            <Panel flush>
              <EmptyState
                icon={Search}
                title={isSatellite && assortmentProducts.length === 0 ? 'Nenhum produto para esta loja' : 'Nenhum produto encontrado'}
                description={isSatellite && assortmentProducts.length === 0
                  ? 'O sortimento da loja é definido pelas metas de estoque (meta > 0) em Config.'
                  : 'Tente outro termo de busca.'}
              />
            </Panel>
          )}

          {/* Barra de confirmação sticky no rodapé — só libera quando todo o
              sortimento foi contado, pra não deixar item esquecido passar
              batido pra reposição. */}
          {!readOnly && (
            <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-sm border-t border-border">
              <Button
                size="lg"
                onClick={() => navigate(`/estoque/contagem/${id}/confirmar`)}
                disabled={!allCounted}
                className="w-full h-12"
              >
                <PackageCheck />
                {allCounted
                  ? `Revisar e confirmar (${countedProducts}/${totalProducts})`
                  : `Faltam ${totalProducts - countedProducts} de ${totalProducts} itens`}
              </Button>
            </div>
          )}
        </div>
      </AdminPage>
    </EstoqueLayout>
  )
}
