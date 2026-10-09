import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, AlertTriangle, CheckCircle2, ArrowLeft, PackageCheck, TrendingUp, TrendingDown, Pencil, Minus, Plus, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { AdminPage, Panel, EmptyState, PageLoading, StatCard, StatGrid } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
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

/// ─── Correção de admin — mesmo padrão de stepper da tela de contagem ────────

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="w-11 h-11 rounded-md border border-border bg-card text-foreground flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-14 h-11 rounded-md border border-input text-center text-lg font-semibold tabular-nums bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => onChange(value + 1)}
          className="w-11 h-11 rounded-md border border-border bg-card text-foreground flex items-center justify-center hover:bg-muted transition-colors"
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
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{item.catalog_products?.name || 'Produto'}</DialogTitle>
          <DialogDescription>Corrigir contagem (admin)</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {showBoxes && <NumberField label="Caixas fechadas" value={closedBoxes} onChange={setClosedBoxes} />}
          <NumberField label="Unidades avulsas" value={looseUnits} onChange={setLooseUnits} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="font-title text-[28px] font-semibold text-foreground leading-none tabular-nums">{previewTotal}</p>
          <p className="text-[12px] text-muted-foreground mt-1">Novo total</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="lg" onClick={() => onSave(closedBoxes, looseUnits)} disabled={saving}>
            {saving && <Loader className="animate-spin" />}
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <AdminPage title="Revisar contagem" back={{ to: '/estoque/contagem', label: 'Histórico' }}>
          <PageLoading />
        </AdminPage>
      </EstoqueLayout>
    )
  }

  if (!stockCount) {
    return (
      <EstoqueLayout>
        <AdminPage title="Revisar contagem" back={{ to: '/estoque/contagem', label: 'Histórico' }}>
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

  // ── Já confirmada (ou acabou de ser confirmada nesta sessão) ──────────────
  if (stockCount.status === 'confirmed' || result) {
    const summary = result
    return (
      <EstoqueLayout>
        <AdminPage
          title="Contagem confirmada"
          badge={<Badge variant="success" dot>Confirmada</Badge>}
          description={stockCount.confirmed_at
            ? `Confirmada em ${new Date(stockCount.confirmed_at).toLocaleString('pt-BR')}`
            : 'Confirmada agora'}
          back={{ to: '/estoque/contagem', label: 'Histórico' }}
          actions={<Button variant="secondary" onClick={() => navigate('/estoque/contagem')}>Voltar ao histórico</Button>}
        >
          <div className="space-y-6">
            {summary && (
              <StatGrid className="grid-cols-1 min-[420px]:grid-cols-3 lg:grid-cols-3">
                <StatCard label="Itens contados" value={summary.items_total} icon={ClipboardList} />
                <StatCard label={isCentral ? 'Abaixo da meta' : 'Geraram reposição'} value={summary.items_replenished} icon={AlertTriangle} tone="warning" />
                <StatCard label="Estoque suficiente" value={summary.items_sufficient} icon={CheckCircle2} tone="success" />
              </StatGrid>
            )}

            {summary && summary.items_skipped.length > 0 && (
              <div className="bg-warning-subtle border border-warning-border rounded-lg p-3 sm:p-4 space-y-1.5">
                <p className="text-[13px] font-semibold text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Itens não conciliados ({summary.items_skipped.length})
                </p>
                {summary.items_skipped.map((skip) => (
                  <p key={skip.product_id} className="text-[12.5px] text-warning">
                    {productNameById.get(skip.product_id) || skip.product_id} — {SKIP_REASON_LABEL[skip.reason] || skip.reason}
                  </p>
                ))}
              </div>
            )}

            {/* Detalhe por produto, agrupado por categoria (mesma ordem da tela de
                contagem) — cruza com meta e com a contagem confirmada anterior da
                loja, pra dar visibilidade real do que foi contado, não só os 3
                números do resumo. */}
            {itemsLoading ? (
              <PageLoading className="py-8" />
            ) : (
              <div className="space-y-6">
                {groupedByCategory.map(([category, categoryItems]) => {
                  const isUncategorized = category === 'Sem categoria'
                  const color = isUncategorized ? null : getCategoryColor(categoryColorByName.get(category))
                  return (
                    <section key={category} className="space-y-2">
                      {/* Cor da categoria é escolhida pelo usuário (exceção categórica) */}
                      <span
                        className={`inline-flex items-center h-6 px-2 rounded-md text-[12.5px] font-medium ${isUncategorized ? 'bg-muted text-ink-600' : ''}`}
                        style={color ? { backgroundColor: color.bg, color: color.text } : undefined}
                      >
                        {category}
                      </span>
                      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="data-table table-fixed min-w-[640px]">
                            <colgroup>
                              <col className="w-[30%]" />
                              <col className="w-[12%]" />
                              <col className="w-[10%]" />
                              <col className="w-[12%]" />
                              <col className="w-[12%]" />
                              <col className="w-[24%]" />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th className="!text-center">Contado</th>
                                <th className="!text-center">Meta</th>
                                <th className="!text-center">Anterior</th>
                                <th className="!text-center">Saldo</th>
                                <th className="!text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {categoryItems.map((item) => {
                                const target = targetByProduct.get(item.product_id)
                                const previous = previousTotalByProduct.get(item.product_id)
                                const unclassified = item.catalog_products?.units_per_box == null
                                const hasTarget = !unclassified && target !== undefined
                                const saldo = hasTarget ? (item.total_units ?? 0) - (target as number) : null
                                const isLow = hasTarget && (item.total_units ?? 0) < (target as number)
                                return (
                                  <tr key={item.id}>
                                    <td className="font-medium text-foreground truncate" title={item.catalog_products?.name || 'Produto'}>
                                      {item.catalog_products?.name || 'Produto'}
                                    </td>
                                    <td className="text-center font-semibold">
                                      <div className="inline-flex items-center gap-1">
                                        <span>{item.total_units ?? <span className="text-warning text-[12px] font-medium">não classif.</span>}</span>
                                        {isAdmin && (
                                          <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => setEditingItem(item)}
                                            title="Corrigir quantidade (admin)"
                                            aria-label="Corrigir quantidade"
                                            className="h-7 w-7"
                                          >
                                            <Pencil className="!size-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="text-center text-muted-foreground">{target ?? '—'}</td>
                                    <td className="text-center">
                                      {previous === undefined ? (
                                        <span className="text-muted-foreground">—</span>
                                      ) : previous === null ? (
                                        <span className="text-muted-foreground">—</span>
                                      ) : item.total_units == null ? (
                                        <span className="text-muted-foreground">{previous}</span>
                                      ) : item.total_units > previous ? (
                                        <span className="inline-flex items-center gap-0.5 text-success font-medium">
                                          <TrendingUp className="w-3 h-3" /> {previous}
                                        </span>
                                      ) : item.total_units < previous ? (
                                        <span className="inline-flex items-center gap-0.5 text-danger font-medium">
                                          <TrendingDown className="w-3 h-3" /> {previous}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">{previous}</span>
                                      )}
                                    </td>
                                    <td className="text-center font-semibold">
                                      {saldo === null ? (
                                        <span className="text-muted-foreground font-normal">—</span>
                                      ) : saldo > 0 ? (
                                        <span className="text-success">+{saldo}</span>
                                      ) : saldo < 0 ? (
                                        <span className="text-danger">{saldo}</span>
                                      ) : (
                                        <span className="text-muted-foreground font-normal">0</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      {unclassified ? (
                                        <span className="text-[12px] text-muted-foreground">Não classificado</span>
                                      ) : !hasTarget ? (
                                        <span className="text-[12px] text-muted-foreground">Sem meta</span>
                                      ) : isLow ? (
                                        <Badge variant="danger">
                                          <AlertTriangle className="w-3 h-3" /> {isCentral ? 'Comprar do fornecedor' : 'Abaixo da meta'}
                                        </Badge>
                                      ) : (
                                        <Badge variant="success">OK</Badge>
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
          </div>
        </AdminPage>

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
      <AdminPage
        title="Revisar contagem"
        description={`${countedItems.length} produto${countedItems.length !== 1 ? 's' : ''} contado${countedItems.length !== 1 ? 's' : ''}`}
        back={{ to: `/estoque/contagem/${id}`, label: 'Contagem' }}
        actions={
          <Button variant="secondary" onClick={() => navigate(`/estoque/contagem/${id}`)}>
            <ArrowLeft /> Voltar e editar
          </Button>
        }
      >
        <div className="space-y-4">
          {itemsUnclassified.length > 0 && (
            <div className="flex items-start gap-2 bg-warning-subtle border border-warning-border rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-[13px] text-warning">
                {itemsUnclassified.length} produto{itemsUnclassified.length !== 1 ? 's' : ''} sem itens/caixa cadastrado — não vão gerar total nem conciliação até serem classificados pelo admin.
              </p>
            </div>
          )}

          {missingCount > 0 && (
            <div className="flex items-start gap-2 bg-danger-subtle border border-danger-border rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-[13px] text-danger">
                Faltam {missingCount} produto{missingCount !== 1 ? 's' : ''} contar. Volte e preencha todos os itens antes de confirmar.
              </p>
            </div>
          )}

          {itemsLoading ? (
            <PageLoading className="py-8" />
          ) : countedItems.length === 0 ? (
            <Panel flush>
              <EmptyState
                icon={ClipboardList}
                title="Nenhum item preenchido ainda"
                description="Volte para a tela de contagem e preencha os produtos."
              />
            </Panel>
          ) : (
            <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="!text-right">Caixas</th>
                      <th className="!text-right">Avulsas</th>
                      <th className="!text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countedItems.map((item) => (
                      <tr key={item.id}>
                        <td className="font-medium text-foreground">
                          {item.catalog_products?.name || 'Produto'}
                          {item.closed_boxes === 0 && item.loose_units === 0 && (
                            <Badge variant="danger" className="ml-2 align-middle">Zerado</Badge>
                          )}
                        </td>
                        <td className="text-right">{item.closed_boxes}</td>
                        <td className="text-right">{item.loose_units}</td>
                        <td className="text-right font-semibold text-[14px]">
                          {item.total_units ?? <span className="text-warning text-[12px] font-medium">não classificado</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Barra de confirmação sticky no rodapé */}
          <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-sm border-t border-border">
            <Button
              size="lg"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || countedItems.length === 0 || !assortmentReady || missingCount > 0}
              className="w-full h-12"
            >
              {confirmMutation.isPending ? (
                <><Loader className="animate-spin" /> Confirmando…</>
              ) : !assortmentReady ? (
                <><Loader className="animate-spin" /> Verificando…</>
              ) : missingCount > 0 ? (
                <><AlertTriangle /> Faltam {missingCount} itens</>
              ) : (
                <><PackageCheck /> Confirmar e enviar</>
              )}
            </Button>
          </div>
        </div>
      </AdminPage>
    </EstoqueLayout>
  )
}
