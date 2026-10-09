import { useState, useEffect, useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Package, PlayCircle, Truck, X, Check, CheckCircle2, Store, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useMyStore } from '@/hooks/useMyStore'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { AdminPage, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { naturalCompare } from '@/lib/naturalSort'

interface RequestItem {
  id: string
  product_id: string
  suggested_quantity: number
  shipped_quantity: number | null
  picked_at: string | null
  catalog_products: { name: string; main_image: string | null; stock_category: string | null } | null
}

interface ReplenishmentRequest {
  id: string
  destination_store_id: string
  status: 'open' | 'picking' | 'shipped'
  generated_at: string
  shipped_at: string | null
  stores: { name: string } | null
  replenishment_request_items: RequestItem[]
}

const COLUMNS = [
  { status: 'open' as const, label: 'Aberto', dot: 'bg-warning-solid' },
  { status: 'picking' as const, label: 'Em separação', dot: 'bg-info-solid' },
  { status: 'shipped' as const, label: 'Enviado', dot: 'bg-success-solid' },
]

function RequestCard({
  request,
  categoryOrderByName,
  onAdvance,
  onTogglePicked,
  onDeclareQty,
  onDelete,
  isPending,
  isDeletePending,
  highlighted,
}: {
  request: ReplenishmentRequest
  categoryOrderByName: Map<string, number>
  onAdvance: (requestId: string, newStatus: 'picking' | 'shipped', shippedItems?: { item_id: string; shipped_quantity: number }[]) => void
  onTogglePicked: (itemId: string, picked: boolean) => void
  onDeclareQty: (itemId: string, qty: number | null) => void
  onDelete: (requestId: string) => void
  isPending: boolean
  isDeletePending: boolean
  highlighted: boolean
}) {
  // Modo "conferindo envio": mostra um input de quantidade por item,
  // pré-preenchido com o declarado/sugerido, antes de confirmar o envio.
  const [shipping, setShipping] = useState(false)
  const [shipQty, setShipQty] = useState<Record<string, string>>({})
  // Painel de declaração (tocar no nome do item durante a separação):
  // "em falta" (0) ou quantidade parcial menor que a sugerida.
  const [declareItemId, setDeclareItemId] = useState<string | null>(null)
  const [declareQty, setDeclareQty] = useState('')
  // Pedido "enviado" nasce colapsado — só mostra os produtos ao clicar no card.
  const [expanded, setExpanded] = useState(false)

  // Mesma ordem de categorias da tela de contagem (sort_order manual em
  // stock_categories), com "Sem categoria" sempre por último; dentro da
  // categoria, ordem natural pelo nome.
  const items = [...request.replenishment_request_items].sort((a, b) => {
    const categoryA = a.catalog_products?.stock_category || 'Sem categoria'
    const categoryB = b.catalog_products?.stock_category || 'Sem categoria'
    if (categoryA !== categoryB) {
      if (categoryA === 'Sem categoria') return 1
      if (categoryB === 'Sem categoria') return -1
      const orderA = categoryOrderByName.get(categoryA) ?? Infinity
      const orderB = categoryOrderByName.get(categoryB) ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      const categoryCompare = categoryA.localeCompare(categoryB)
      if (categoryCompare !== 0) return categoryCompare
    }
    return naturalCompare(a.catalog_products?.name || '', b.catalog_products?.name || '')
  })
  const totalSuggested = items.reduce((sum, i) => sum + i.suggested_quantity, 0)
  const totalShipped = items.reduce((sum, i) => sum + (i.shipped_quantity ?? 0), 0)
  const pickedCount = items.filter((i) => i.picked_at !== null).length
  const isPicking = request.status === 'picking'
  const isShipped = request.status === 'shipped'
  const showItems = !isShipped || expanded

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Excluir o pedido de reposição de "${request.stores?.name || 'loja'}"? Esta ação não pode ser desfeita.`)) return
    onDelete(request.id)
  }

  const startShipping = () => {
    setShipQty(Object.fromEntries(items.map((i) => [i.id, String(i.shipped_quantity ?? i.suggested_quantity)])))
    setShipping(true)
    setDeclareItemId(null)
  }

  const confirmShipping = () => {
    const shippedItems = items.map((i) => {
      const parsed = parseInt(shipQty[i.id] ?? '')
      return { item_id: i.id, shipped_quantity: Number.isNaN(parsed) || parsed < 0 ? i.suggested_quantity : parsed }
    })
    onAdvance(request.id, 'shipped', shippedItems)
    setShipping(false)
  }

  return (
    // id usado pelo deep-link ?pedido=<id> (rolagem + destaque)
    <div
      id={`pedido-${request.id}`}
      onClick={() => isShipped && setExpanded((v) => !v)}
      className={`bg-card rounded-lg border shadow-xs p-4 space-y-3 scroll-mt-24 transition-colors ${
        highlighted ? 'border-brand ring-1 ring-brand/40' : 'border-border'
      } ${isShipped ? 'cursor-pointer hover:border-ink-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-ink-400 shrink-0" />
          <p className="text-[14px] font-semibold text-foreground truncate">{request.stores?.name || 'Loja'}</p>
          {isShipped && (
            expanded ? <ChevronUp className="w-3.5 h-3.5 text-ink-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-400 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <p className="text-[12px] text-muted-foreground">
            {new Date(request.generated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </p>
          {isShipped ? (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDelete}
              disabled={isDeletePending}
              className="hover:text-danger hover:bg-danger-subtle"
              title="Excluir pedido"
              aria-label="Excluir pedido"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <p className="text-[12.5px] text-muted-foreground tabular-nums">
        {items.length} {items.length === 1 ? 'item' : 'itens'} ·{' '}
        {request.status === 'shipped' ? `${totalShipped} un. enviadas` : `${totalSuggested} un. sugeridas`}
        {request.status === 'shipped' && request.shipped_at && (
          <> · {new Date(request.shipped_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</>
        )}
        {isPicking && (
          <span className={`ml-1.5 font-semibold ${pickedCount === items.length ? 'text-success' : 'text-info'}`}>
            · {pickedCount}/{items.length} separados
          </span>
        )}
      </p>

      {showItems && (
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {items.map((item) => (
          // Item com painel de declaração aberto ganha um "envelope" destacado
          // (fundo + borda) cobrindo linha e painel juntos. Todo item tem a
          // mesma moldura (transparente quando fechado): o destaque acende no
          // lugar, sem deslocar o conteúdo nem vazar do card.
          <div
            key={item.id}
            className={`text-[13.5px] rounded-md border p-1.5 transition-colors ${
              declareItemId === item.id && isPicking && !shipping
                ? 'border-warning-border bg-warning-subtle'
                : 'border-transparent'
            }`}
          >
          <div className="flex items-center gap-2.5">
            {/* Checklist de separação — só em picking, persiste no banco */}
            {isPicking && !shipping && (
              <button
                type="button"
                onClick={() => onTogglePicked(item.id, item.picked_at === null)}
                className={`w-10 h-10 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                  item.picked_at ? 'bg-success-solid border-success-solid text-white' : 'bg-card border-border text-transparent hover:border-success-border'
                }`}
                title={item.picked_at ? 'Desmarcar separação' : 'Marcar como separado'}
                aria-label={item.picked_at ? 'Desmarcar separação' : 'Marcar como separado'}
                aria-pressed={!!item.picked_at}
              >
                <Check className="w-[18px] h-[18px]" />
              </button>
            )}
            <div className="w-11 h-11 rounded-md overflow-hidden shrink-0 bg-card border border-border">
              {item.catalog_products?.main_image ? (
                <img src={item.catalog_products.main_image} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-400 bg-muted"><Package className="w-4 h-4" /></div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!isPicking || shipping) return
                if (declareItemId === item.id) { setDeclareItemId(null); return }
                setDeclareItemId(item.id)
                setDeclareQty(String(item.shipped_quantity ?? item.suggested_quantity))
              }}
              className={`flex-1 min-w-0 min-h-[40px] text-left leading-snug line-clamp-2 ${isPicking && item.picked_at ? 'text-muted-foreground line-through' : 'text-foreground'}`}
              title={isPicking && !shipping ? 'Toque para declarar falta ou quantidade parcial' : undefined}
            >
              {item.catalog_products?.name || 'Produto removido'}
            </button>
            {isPicking && !shipping && item.shipped_quantity !== null && (
              item.shipped_quantity === 0 ? (
                <Badge variant="danger" className="shrink-0">Em falta</Badge>
              ) : item.shipped_quantity < item.suggested_quantity ? (
                <Badge variant="warning" className="shrink-0 tabular-nums">
                  {item.shipped_quantity} de {item.suggested_quantity}
                </Badge>
              ) : null
            )}
            {shipping ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={`Quantidade enviada de ${item.catalog_products?.name || 'produto'}`}
                value={shipQty[item.id] ?? ''}
                onChange={(e) => setShipQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="w-16 h-10 rounded-md border border-input text-center text-base font-semibold tabular-nums bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              />
            ) : (
              <span className="font-title text-[17px] font-semibold shrink-0 tabular-nums">
                {request.status === 'shipped' ? (item.shipped_quantity ?? item.suggested_quantity) : item.suggested_quantity}
              </span>
            )}
          </div>

          {declareItemId === item.id && isPicking && !shipping && (
            <div className="mt-2 pt-2 border-t border-warning-border space-y-1.5">
              <p className="text-[12px] font-medium text-muted-foreground">
                Separação parcial — sugerido: {item.suggested_quantity}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={item.suggested_quantity}
                  aria-label="Quantidade separada"
                  value={declareQty}
                  onChange={(e) => setDeclareQty(e.target.value)}
                  className="w-16 h-10 rounded-md border border-input text-center text-base font-semibold tabular-nums bg-card text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  size="lg"
                  className="px-3"
                  onClick={() => {
                    const parsed = parseInt(declareQty)
                    if (Number.isNaN(parsed) || parsed < 0 || parsed > item.suggested_quantity) {
                      toast.error(`Informe entre 0 e ${item.suggested_quantity}`)
                      return
                    }
                    onDeclareQty(item.id, parsed)
                    setDeclareItemId(null)
                  }}
                >
                  Declarar
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="px-3 text-danger border-danger-border hover:bg-danger-subtle"
                  onClick={() => { onDeclareQty(item.id, 0); setDeclareItemId(null) }}
                >
                  Em falta
                </Button>
                {item.shipped_quantity !== null && (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="px-3"
                    onClick={() => { onDeclareQty(item.id, null); setDeclareItemId(null) }}
                  >
                    Limpar
                  </Button>
                )}
                <Button variant="ghost" size="lg" className="px-3" onClick={() => setDeclareItemId(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          </div>
        ))}
      </div>
      )}

      {request.status === 'open' && (
        <Button size="lg" onClick={() => onAdvance(request.id, 'picking')} disabled={isPending} className="w-full">
          <PlayCircle /> Iniciar separação
        </Button>
      )}

      {request.status === 'picking' && !shipping && (
        <Button size="lg" onClick={startShipping} disabled={isPending} className="w-full">
          <Truck /> Confirmar envio
        </Button>
      )}

      {request.status === 'picking' && shipping && (
        <div className="flex items-center gap-1.5">
          <Button size="lg" onClick={confirmShipping} disabled={isPending} className="flex-1">
            {isPending ? <Loader className="animate-spin" /> : <Check />}
            Enviar
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setShipping(false)}
            className="h-10 w-10"
            title="Cancelar"
            aria-label="Cancelar envio"
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  )
}

export default function EstoquePedidos() {
  const queryClient = useQueryClient()
  const { isCentral, isAdmin, isLoading: storeLoading } = useMyStore()
  // Deep-link vindo da notificação de WhatsApp: ?pedido=<request_id>
  const [searchParams] = useSearchParams()
  const focusRequestId = searchParams.get('pedido')

  const canView = isCentral || isAdmin

  const { data: requests = [], isLoading: requestsLoading } = useQuery<ReplenishmentRequest[]>({
    queryKey: ['replenishment-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('replenishment_requests')
        .select('id, destination_store_id, status, generated_at, shipped_at, stores(name), replenishment_request_items(id, product_id, suggested_quantity, shipped_quantity, picked_at, catalog_products(name, main_image, stock_category))')
        .order('generated_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return (data || []) as unknown as ReplenishmentRequest[]
    },
    enabled: canView,
    staleTime: 30 * 1000,
  })

  const { data: stockCategories = [] } = useQuery<{ name: string; sort_order: number }[]>({
    queryKey: ['stock-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_categories').select('name, sort_order')
      if (error) throw error
      return (data || []) as { name: string; sort_order: number }[]
    },
    enabled: canView,
    staleTime: 5 * 60 * 1000,
  })

  const categoryOrderByName = useMemo(() => {
    const orderMap = new Map<string, number>()
    stockCategories.forEach((c) => orderMap.set(c.name, c.sort_order))
    return orderMap
  }, [stockCategories])

  const togglePicked = useMutation({
    mutationFn: async ({ itemId, picked }: { itemId: string; picked: boolean }) => {
      const { error } = await supabase.rpc('set_replenishment_item_picked', {
        p_item_id: itemId,
        p_picked: picked,
      })
      if (error) throw error
    },
    // Otimista: o checkbox responde na hora; rollback se a RPC falhar.
    onMutate: async ({ itemId, picked }) => {
      await queryClient.cancelQueries({ queryKey: ['replenishment-requests'] })
      const previous = queryClient.getQueryData<ReplenishmentRequest[]>(['replenishment-requests'])
      queryClient.setQueryData<ReplenishmentRequest[]>(['replenishment-requests'], (old) =>
        (old || []).map((r) => ({
          ...r,
          replenishment_request_items: r.replenishment_request_items.map((i) =>
            i.id === itemId ? { ...i, picked_at: picked ? new Date().toISOString() : null } : i
          ),
        }))
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['replenishment-requests'], context.previous)
      toast.error(`Erro ao marcar item: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment-requests'] })
    },
  })

  // Declaração durante a separação: em falta (0) ou quantidade parcial.
  // Grava em shipped_quantity — o "Confirmar envio" herda o valor.
  const declareQty = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number | null }) => {
      const { error } = await supabase.rpc('set_replenishment_item_shipped_qty', {
        p_item_id: itemId,
        p_shipped_quantity: qty,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['replenishment-requests'] })
      if (vars.qty === null) toast.success('Declaração removida')
      else if (vars.qty === 0) toast.success('Item marcado como em falta')
      else toast.success(`Declarado: ${vars.qty} un.`)
    },
    onError: (err) => toast.error(`Erro ao declarar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const requestsLoaded = requests.length > 0

  useEffect(() => {
    if (!focusRequestId || !requestsLoaded) return
    // Espera o DOM montar os cards antes de rolar até o pedido destacado.
    const timer = setTimeout(() => {
      document.getElementById(`pedido-${focusRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => clearTimeout(timer)
  }, [focusRequestId, requestsLoaded])

  const updateStatus = useMutation({
    mutationFn: async ({ requestId, newStatus, shippedItems }: {
      requestId: string
      newStatus: 'picking' | 'shipped'
      shippedItems?: { item_id: string; shipped_quantity: number }[]
    }) => {
      const { error } = await supabase.rpc('update_replenishment_request_status', {
        p_request_id: requestId,
        p_new_status: newStatus,
        p_shipped_items: shippedItems ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['replenishment-requests'] })
      toast.success(vars.newStatus === 'picking' ? 'Separação iniciada' : 'Envio confirmado')
    },
    onError: (err) => {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  const deleteRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('admin_delete_replenishment_request', { p_request_id: requestId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment-requests'] })
      toast.success('Pedido excluído')
    },
    onError: (err) => {
      toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  if (storeLoading) {
    return (
      <EstoqueLayout>
        <AdminPage title="Pedidos de reposição">
          <PageLoading />
        </AdminPage>
      </EstoqueLayout>
    )
  }

  // Gate de UI complementar à RLS — satélite não vê esta tela. Admin sempre vê,
  // independente da loja de teste selecionada no header.
  if (!canView) {
    return <Navigate to="/estoque/contagem" replace />
  }

  // Coluna "Enviado" mostra só os despachos recentes pra não crescer pra sempre.
  const shippedRecent = requests.filter((r) => r.status === 'shipped').slice(0, 10)

  return (
    <EstoqueLayout>
      <AdminPage
        title="Pedidos de reposição"
        description="Um pedido consolidado por loja, gerado automaticamente na confirmação da contagem — com todos os itens abaixo da meta."
      >
        {requestsLoading ? (
          <PageLoading label="Carregando pedidos…" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {COLUMNS.map((col) => {
              const colRequests = col.status === 'shipped'
                ? shippedRecent
                : requests.filter((r) => r.status === col.status)
              return (
                <section key={col.status} className="space-y-2">
                  <div className="flex items-center gap-2 px-1 h-7">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} aria-hidden />
                    <h2 className="text-[13px] font-semibold text-foreground">{col.label}</h2>
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-medium tabular-nums inline-flex items-center justify-center bg-muted text-ink-500">
                      {colRequests.length}
                    </span>
                  </div>
                  {colRequests.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center">
                      <p className="text-[12.5px] text-muted-foreground">Nenhum pedido</p>
                    </div>
                  ) : (
                    colRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        categoryOrderByName={categoryOrderByName}
                        onAdvance={(requestId, newStatus, shippedItems) => updateStatus.mutate({ requestId, newStatus, shippedItems })}
                        onTogglePicked={(itemId, picked) => togglePicked.mutate({ itemId, picked })}
                        onDeclareQty={(itemId, qty) => declareQty.mutate({ itemId, qty })}
                        onDelete={(requestId) => deleteRequest.mutate(requestId)}
                        isPending={updateStatus.isPending}
                        isDeletePending={deleteRequest.isPending}
                        highlighted={request.id === focusRequestId}
                      />
                    ))
                  )}
                </section>
              )
            })}
          </div>
        )}
      </AdminPage>
    </EstoqueLayout>
  )
}
