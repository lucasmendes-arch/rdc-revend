import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, AlertTriangle, CheckCircle2, ArrowLeft, PackageCheck, TrendingUp, TrendingDown, Pencil, Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { naturalCompare } from '@/lib/naturalSort'
import { getCategoryColor } from '@/lib/stockCategoryColors'

interface StockCount {
  id: string
  store_id: string
  status: 'draft' | 'confirmed'
  created_at: string
  confirmed_at: string | null
}

interface CountItemWithProduct {
  id: string
  product_id: string
  closed_boxes: number
  loose_units: number
  total_units: number | null
  catalog_products: {
    name: string
    units_per_box: number | null
    stock_category: string | null
    package_type: string | null
  } | null
}

interface ConfirmSummary {
  stock_count_id: string
  store_id: string
  confirmed_at: string
  items_total: number
  items_replenished: number
  items_sufficient: number
  items_skipped: { product_id: string; reason: string }[]
  replenishment_request_id: string | null
}

interface StockCategoryOption {
  id: string
  name: string
  sort_order: number
  color_index: number
}

const SKIP_REASON_LABEL: Record<string, string> = {
  no_units_per_box: 'Produto não classificado (sem itens/caixa)',
  no_target_defined: 'Meta de estoque não cadastrada para esta loja',
}

// ─── Correção de admin — mesmo padrão de stepper da tela de contagem ────────

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="w-9 h-9 rounded-xl border border-border bg-surface-alt flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-14 h-9 rounded-xl border border-input text-center text-base font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-9 h-9 rounded-xl border border-border bg-surface-alt flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function EditCountModal({
  item,
  saving,
  onClose,
  onSave,
}: {
  item: CountItemWithProduct
  saving: boolean
  onClose: () => void
  onSave: (closedBoxes: number, looseUnits: number) => void
}) {
  const [closedBoxes, setClosedBoxes] = useState(item.closed_boxes)
  const [looseUnits, setLooseUnits] = useState(item.loose_units)
  const unitsPerBox = item.catalog_products?.units_per_box ?? null
  const showBoxes = item.catalog_products?.package_type === 'CX' || closedBoxes > 0
  const previewTotal = unitsPerBox != null ? closedBoxes * unitsPerBox + looseUnits : looseUnits

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Corrigir contagem (admin)</p>
            <h2 className="text-base font-bold text-foreground">{item.catalog_products?.name || 'Produto'}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          {showBoxes && <NumberField label="Caixas fechadas" value={closedBoxes} onChange={setClosedBoxes} />}
          <NumberField label="Unidades avulsas" value={looseUnits} onChange={setLooseUnits} />
        </div>

        <div className="bg-surface-alt rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-foreground">{previewTotal}</p>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">novo total</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(closedBoxes, looseUnits)}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl btn-gold text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EstoqueConfirmacao() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'administrativo'
  const [result, setResult] = useState<ConfirmSummary | null>(null)
  const [editingItem, setEditingItem] = useState<CountItemWithProduct | null>(null)

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

  const { data: items = [], isLoading: itemsLoading } = useQuery<CountItemWithProduct[]>({
    queryKey: ['stock-count-items-review', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_count_items')
        .select('id, product_id, closed_boxes, loose_units, total_units, catalog_products(name, units_per_box, stock_category, package_type)')
        .eq('stock_count_id', id as string)
      if (error) throw error
      return (data || []) as unknown as CountItemWithProduct[]
    },
    enabled: !!id,
  })

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) map.set(item.product_id, item.catalog_products?.name || 'Produto')
    return map
  }, [items])

  const storeId = stockCount?.store_id

  const { data: countStore, isLoading: countStoreLoading } = useQuery<{ id: string; type: 'central' | 'satellite' } | null>({
    queryKey: ['store-type', storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, type').eq('id', storeId as string).maybeSingle()
      if (error) throw error
      return data as { id: string; type: 'central' | 'satellite' } | null
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  })
  const isCentral = countStore?.type === 'central'
  const isSatellite = countStore?.type === 'satellite'

  // Sortimento completo da loja (mesma regra da tela de contagem) — usado só
  // pra travar a confirmação enquanto faltar item do sortimento, caso o
  // usuário chegue direto nesta tela por URL sem passar pela trava de lá.
  const { data: assortmentProductIds = [], isLoading: assortmentLoading } = useQuery<string[]>({
    queryKey: ['stock-products-ids'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_countable_products').select('id')
      if (error) throw error
      return (data || []).map((p: { id: string }) => p.id)
    },
    staleTime: 5 * 60 * 1000,
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

  const { data: storeTargets = [], isLoading: storeTargetsLoading } = useQuery<{ product_id: string; target_quantity: number }[]>({
    queryKey: ['store-stock-targets', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_stock_targets')
        .select('product_id, target_quantity')
        .eq('store_id', storeId as string)
      if (error) throw error
      return (data || []) as { product_id: string; target_quantity: number }[]
    },
    enabled: !!storeId,
  })

  const targetByProduct = useMemo(() => {
    const map = new Map<string, number>()
    storeTargets.forEach((t) => map.set(t.product_id, t.target_quantity))
    return map
  }, [storeTargets])

  // Total do sortimento da loja: central conta o catálogo inteiro, satélite só
  // produtos com meta > 0 (ou já contados neste rascunho).
  const totalAssortment = useMemo(() => {
    if (isCentral) return assortmentProductIds.length
    const allowed = new Set(storeTargets.filter((t) => t.target_quantity > 0).map((t) => t.product_id))
    const countedIds = new Set(items.map((i) => i.product_id))
    return assortmentProductIds.filter((pid) => allowed.has(pid) || countedIds.has(pid)).length
  }, [assortmentProductIds, isCentral, storeTargets, items])

  const assortmentReady = !countStoreLoading && !assortmentLoading && !storeTargetsLoading && (isCentral || isSatellite)
  const missingCount = assortmentReady ? Math.max(totalAssortment - items.length, 0) : 0

  // Contagem anterior confirmada da mesma loja, pra comparação (▲/▼) — só
  // busca em tela já confirmada (readOnly), comparando com o que veio antes
  // desta contagem.
  const readOnlyForCompare = stockCount?.status === 'confirmed' || !!result
  const referenceConfirmedAt = stockCount?.confirmed_at || result?.confirmed_at || null

  const { data: previousCountId } = useQuery<string | null>({
    queryKey: ['stock-count-previous', storeId, id, referenceConfirmedAt],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id')
        .eq('store_id', storeId as string)
        .eq('status', 'confirmed')
        .lt('confirmed_at', referenceConfirmedAt as string)
        .neq('id', id as string)
        .order('confirmed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
    enabled: !!storeId && !!id && !!referenceConfirmedAt && readOnlyForCompare,
  })

  const { data: previousItems = [] } = useQuery<{ product_id: string; total_units: number | null }[]>({
    queryKey: ['stock-count-items-previous', previousCountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_count_items')
        .select('product_id, total_units')
        .eq('stock_count_id', previousCountId as string)
      if (error) throw error
      return (data || []) as { product_id: string; total_units: number | null }[]
    },
    enabled: !!previousCountId,
  })

  const previousTotalByProduct = useMemo(() => {
    const map = new Map<string, number | null>()
    previousItems.forEach((i) => map.set(i.product_id, i.total_units))
    return map
  }, [previousItems])

  const categoryOrderByName = useMemo(() => {
    const map = new Map<string, number>()
    stockCategories.forEach((c) => map.set(c.name, c.sort_order))
    return map
  }, [stockCategories])

  const categoryColorByName = useMemo(() => {
    const map = new Map<string, number>()
    stockCategories.forEach((c) => map.set(c.name, c.color_index))
    return map
  }, [stockCategories])

  // Agrupa por categoria (mesma ordem/desempate da tela de contagem) —
  // "Sem categoria" sempre por último, ordem natural do nome dentro do grupo.
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, CountItemWithProduct[]>()
    for (const item of items) {
      const key = item.catalog_products?.stock_category || 'Sem categoria'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => naturalCompare(a.catalog_products?.name || '', b.catalog_products?.name || ''))
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Sem categoria') return 1
      if (b === 'Sem categoria') return -1
      const orderA = categoryOrderByName.get(a) ?? Infinity
      const orderB = categoryOrderByName.get(b) ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }, [items, categoryOrderByName])

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('confirm_stock_count', { p_stock_count_id: id })
      if (error) throw error
      return data as ConfirmSummary
    },
    onSuccess: (summary) => {
      setResult(summary)
      queryClient.invalidateQueries({ queryKey: ['stock-count-by-id', id] })
      queryClient.invalidateQueries({ queryKey: ['stock-counts-list'] })
      toast.success('Contagem confirmada com sucesso!')
      // Notificação WhatsApp pro número do negócio quando a contagem gera
      // reposição — fire-and-forget: falha de notificação não afeta o fluxo.
      if (summary.replenishment_request_id) {
        supabase.functions
          .invoke('notify-replenishment', { body: { request_id: summary.replenishment_request_id } })
          .catch((err) => console.warn('notify-replenishment falhou:', err))
      }
      // Contagem da central não gera replenishment_request (é compra do
      // fornecedor, não pedido entre lojas) — notifica direto pela contagem.
      if (isCentral) {
        supabase.functions
          .invoke('notify-stock-count', { body: { stock_count_id: summary.stock_count_id } })
          .catch((err) => console.warn('notify-stock-count falhou:', err))
      }
    },
    onError: (err) => {
      toast.error(`Erro ao confirmar: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  // Correção pós-confirmação — só admin (RLS: stock_count_items_admin_all
  // permite update mesmo com a contagem já confirmada; colaborador comum só
  // edita em draft, via tela de contagem).
  const updateCountMutation = useMutation({
    mutationFn: async ({ itemId, closedBoxes, looseUnits }: { itemId: string; closedBoxes: number; looseUnits: number }) => {
      const { error } = await supabase
        .from('stock_count_items')
        .update({ closed_boxes: closedBoxes, loose_units: looseUnits })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count-items-review', id] })
      toast.success('Quantidade corrigida.')
      setEditingItem(null)
    },
    onError: (err) => {
      toast.error(`Erro ao corrigir: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  if (countLoading) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando…</p>
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

  // ── Já confirmada (ou acabou de ser confirmada nesta sessão) ──────────────
  if (stockCount.status === 'confirmed' || result) {
    const summary = result
    return (
      <EstoqueLayout>
        <div className="bg-white rounded-2xl border border-border shadow-card p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Contagem confirmada</h1>
            <p className="text-sm text-muted-foreground">
              {stockCount.confirmed_at
                ? `Confirmada em ${new Date(stockCount.confirmed_at).toLocaleString('pt-BR')}`
                : 'Confirmada agora'}
            </p>
          </div>

          {summary && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-surface-alt rounded-xl p-3">
                <p className="text-xl font-bold text-foreground">{summary.items_total}</p>
                <p className="text-[11px] text-muted-foreground">Itens contados</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-xl font-bold text-amber-700">{summary.items_replenished}</p>
                <p className="text-[11px] text-amber-700">{isCentral ? 'Abaixo da meta' : 'Geraram reposição'}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xl font-bold text-green-700">{summary.items_sufficient}</p>
                <p className="text-[11px] text-green-700">Estoque suficiente</p>
              </div>
            </div>
          )}

          {summary && summary.items_skipped.length > 0 && (
            <div className="text-left bg-amber-50/50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Itens não conciliados ({summary.items_skipped.length})
              </p>
              {summary.items_skipped.map((skip) => (
                <p key={skip.product_id} className="text-xs text-amber-700">
                  {productNameById.get(skip.product_id) || skip.product_id} — {SKIP_REASON_LABEL[skip.reason] || skip.reason}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={() => navigate('/estoque/contagem')}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl btn-gold text-sm font-bold"
          >
            Voltar ao histórico
          </button>
        </div>

        {/* Detalhe por produto, agrupado por categoria (mesma ordem da tela de
            contagem) — cruza com meta e com a contagem confirmada anterior da
            loja, pra dar visibilidade real do que foi contado, não só os 3
            números do resumo. */}
        {itemsLoading ? (
          <div className="text-center py-8">
            <Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" />
          </div>
        ) : (
          <div className="space-y-4 pb-8">
            {groupedByCategory.map(([category, categoryItems]) => {
              const color = category === 'Sem categoria' ? { bg: '#F3F4F6', text: '#6B7280' } : getCategoryColor(categoryColorByName.get(category))
              return (
                <section key={category} className="space-y-2">
                  <span
                    className="inline-block px-2.5 py-1 rounded-lg text-sm font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: color.bg, color: color.text }}
                  >
                    {category}
                  </span>
                  <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed min-w-[640px]">
                        <colgroup>
                          <col className="w-[30%]" />
                          <col className="w-[12%]" />
                          <col className="w-[10%]" />
                          <col className="w-[12%]" />
                          <col className="w-[12%]" />
                          <col className="w-[24%]" />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border bg-surface-alt">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Produto</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Contado</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Meta</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Anterior</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Saldo</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryItems.map((item, index) => {
                            const target = targetByProduct.get(item.product_id)
                            const previous = previousTotalByProduct.get(item.product_id)
                            const unclassified = item.catalog_products?.units_per_box == null
                            const hasTarget = !unclassified && target !== undefined
                            const saldo = hasTarget ? (item.total_units ?? 0) - (target as number) : null
                            const isLow = hasTarget && (item.total_units ?? 0) < (target as number)
                            return (
                              <tr key={item.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                                <td className="px-4 py-2.5 text-sm font-medium text-foreground truncate" title={item.catalog_products?.name || 'Produto'}>
                                  {item.catalog_products?.name || 'Produto'}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-center font-bold">
                                  <div className="inline-flex items-center gap-1.5">
                                    <span>{item.total_units ?? <span className="text-amber-600 text-xs font-semibold">não classif.</span>}</span>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => setEditingItem(item)}
                                        title="Corrigir quantidade (admin)"
                                        className="text-muted-foreground hover:text-amber-700 transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-sm text-center text-muted-foreground">{target ?? '—'}</td>
                                <td className="px-4 py-2.5 text-sm text-center">
                                  {previous === undefined ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : previous === null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : item.total_units == null ? (
                                    <span className="text-muted-foreground">{previous}</span>
                                  ) : item.total_units > previous ? (
                                    <span className="inline-flex items-center gap-0.5 text-green-600 font-semibold">
                                      <TrendingUp className="w-3 h-3" /> {previous}
                                    </span>
                                  ) : item.total_units < previous ? (
                                    <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold">
                                      <TrendingDown className="w-3 h-3" /> {previous}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">{previous}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-center font-semibold">
                                  {saldo === null ? (
                                    <span className="text-muted-foreground font-normal">—</span>
                                  ) : saldo > 0 ? (
                                    <span className="text-green-600">+{saldo}</span>
                                  ) : saldo < 0 ? (
                                    <span className="text-red-600">{saldo}</span>
                                  ) : (
                                    <span className="text-muted-foreground font-normal">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {unclassified ? (
                                    <span className="text-[10px] font-semibold text-muted-foreground">não classificado</span>
                                  ) : !hasTarget ? (
                                    <span className="text-[10px] text-muted-foreground">sem meta</span>
                                  ) : isLow ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                                      <AlertTriangle className="w-3 h-3" /> {isCentral ? 'Comprar do fornecedor' : 'Abaixo da meta'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">OK</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {editingItem && (
          <EditCountModal
            item={editingItem}
            saving={updateCountMutation.isPending}
            onClose={() => setEditingItem(null)}
            onSave={(closedBoxes, looseUnits) =>
              updateCountMutation.mutate({ itemId: editingItem.id, closedBoxes, looseUnits })
            }
          />
        )}
      </EstoqueLayout>
    )
  }

  // ── Rascunho: revisão antes de confirmar ───────────────────────────────────
  // Todo registro conta — inclusive 0/0 (item zerado), que gera reposição da
  // meta cheia na confirmação e por isso precisa aparecer na revisão.
  const countedItems = [...items].sort((a, b) =>
    naturalCompare(a.catalog_products?.name || '', b.catalog_products?.name || '')
  )
  const itemsUnclassified = items.filter((i) => i.catalog_products?.units_per_box == null)

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold text-foreground">Revisar contagem</h1>
            <p className="text-xs text-muted-foreground">
              {countedItems.length} produto{countedItems.length !== 1 ? 's' : ''} contado{countedItems.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => navigate(`/estoque/contagem/${id}`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar e editar
          </button>
        </div>

        {itemsUnclassified.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              {itemsUnclassified.length} produto{itemsUnclassified.length !== 1 ? 's' : ''} sem itens/caixa cadastrado — não vão gerar total nem conciliação até serem classificados pelo admin.
            </p>
          </div>
        )}

        {missingCount > 0 && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800">
              Faltam {missingCount} produto{missingCount !== 1 ? 's' : ''} contar. Volte e preencha todos os itens antes de confirmar.
            </p>
          </div>
        )}
      </div>

      {itemsLoading ? (
        <div className="text-center py-8">
          <Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" />
        </div>
      ) : countedItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border shadow-card p-8 text-center">
          <p className="text-muted-foreground">Nenhum item preenchido ainda. Volte para a tela de contagem.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Produto</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Caixas</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Avulsas</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {countedItems.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {item.catalog_products?.name || 'Produto'}
                      {item.closed_boxes === 0 && item.loose_units === 0 && (
                        <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 uppercase align-middle">Zerado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">{item.closed_boxes}</td>
                    <td className="px-4 py-3 text-sm text-center">{item.loose_units}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold">
                      {item.total_units ?? <span className="text-amber-600 text-xs font-semibold">não classificado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="pb-8">
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending || countedItems.length === 0 || !assortmentReady || missingCount > 0}
          className="w-full px-6 py-3.5 rounded-xl btn-gold text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {confirmMutation.isPending ? (
            <><Loader className="w-4 h-4 animate-spin" /> Confirmando…</>
          ) : !assortmentReady ? (
            <><Loader className="w-4 h-4 animate-spin" /> Verificando…</>
          ) : missingCount > 0 ? (
            <><AlertTriangle className="w-4 h-4" /> Faltam {missingCount} itens</>
          ) : (
            <><PackageCheck className="w-4 h-4" /> Confirmar e enviar</>
          )}
        </button>
      </div>
    </EstoqueLayout>
  )
}
