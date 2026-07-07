import { useState, useEffect, useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Package, PlayCircle, Truck, X, Check, Store } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useMyStore } from '@/hooks/useMyStore'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
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
  { status: 'open' as const, label: 'Aberto', dot: 'bg-amber-500', header: 'text-amber-700' },
  { status: 'picking' as const, label: 'Em separação', dot: 'bg-blue-500', header: 'text-blue-700' },
  { status: 'shipped' as const, label: 'Enviado', dot: 'bg-green-500', header: 'text-green-700' },
]

function RequestCard({
  request,
  categoryOrderByName,
  onAdvance,
  onTogglePicked,
  onDeclareQty,
  isPending,
  highlighted,
}: {
  request: ReplenishmentRequest
  categoryOrderByName: Map<string, number>
  onAdvance: (requestId: string, newStatus: 'picking' | 'shipped', shippedItems?: { item_id: string; shipped_quantity: number }[]) => void
  onTogglePicked: (itemId: string, picked: boolean) => void
  onDeclareQty: (itemId: string, qty: number | null) => void
  isPending: boolean
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
      className={`bg-white rounded-2xl border shadow-card p-4 space-y-3 scroll-mt-24 transition-shadow ${
        highlighted ? 'border-amber-400 ring-2 ring-amber-300' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-base font-bold text-foreground truncate">{request.stores?.name || 'Loja'}</p>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {new Date(request.generated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {items.length} {items.length === 1 ? 'item' : 'itens'} ·{' '}
        {request.status === 'shipped' ? `${totalShipped} un. enviadas` : `${totalSuggested} un. sugeridas`}
        {request.status === 'shipped' && request.shipped_at && (
          <> · {new Date(request.shipped_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</>
        )}
        {isPicking && (
          <span className={`ml-1.5 font-bold ${pickedCount === items.length ? 'text-green-600' : 'text-blue-600'}`}>
            · {pickedCount}/{items.length} separados
          </span>
        )}
      </p>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {items.map((item) => (
          // Item com painel de declaração aberto ganha um "envelope" destacado
          // (fundo + borda) cobrindo linha e painel juntos. Todo item tem a
          // mesma moldura (transparente quando fechado): o destaque acende no
          // lugar, sem deslocar o conteúdo nem vazar do card.
          <div
            key={item.id}
            className={`text-sm rounded-xl border p-1.5 transition-colors ${
              declareItemId === item.id && isPicking && !shipping
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-transparent'
            }`}
          >
          <div className="flex items-center gap-2.5">
            {/* Checklist de separação — só em picking, persiste no banco */}
            {isPicking && !shipping && (
              <button
                type="button"
                onClick={() => onTogglePicked(item.id, item.picked_at === null)}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                  item.picked_at ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-border text-transparent hover:border-green-400'
                }`}
                title={item.picked_at ? 'Desmarcar separação' : 'Marcar como separado'}
              >
                <Check className="w-[18px] h-[18px]" />
              </button>
            )}
            <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white border border-border">
              {item.catalog_products?.main_image ? (
                <img src={item.catalog_products.main_image} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-surface-alt"><Package className="w-4 h-4" /></div>
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
              className={`flex-1 min-w-0 text-left leading-snug line-clamp-2 ${isPicking && item.picked_at ? 'text-muted-foreground line-through' : 'text-foreground'}`}
              title={isPicking && !shipping ? 'Toque para declarar falta ou quantidade parcial' : undefined}
            >
              {item.catalog_products?.name || 'Produto removido'}
            </button>
            {isPicking && !shipping && item.shipped_quantity !== null && (
              item.shipped_quantity === 0 ? (
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-red-100 text-red-600 uppercase shrink-0">Em falta</span>
              ) : item.shipped_quantity < item.suggested_quantity ? (
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-amber-100 text-amber-700 shrink-0">
                  {item.shipped_quantity} de {item.suggested_quantity}
                </span>
              ) : null
            )}
            {shipping ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={shipQty[item.id] ?? ''}
                onChange={(e) => setShipQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="w-16 h-9 rounded-lg border border-input text-center text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-400 shrink-0"
              />
            ) : (
              <span className="text-base font-bold shrink-0 tabular-nums">
                {request.status === 'shipped' ? (item.shipped_quantity ?? item.suggested_quantity) : item.suggested_quantity}
              </span>
            )}
          </div>

          {declareItemId === item.id && isPicking && !shipping && (
            <div className="mt-2 pt-2 border-t border-amber-200 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Separação parcial — sugerido: {item.suggested_quantity}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={item.suggested_quantity}
                  value={declareQty}
                  onChange={(e) => setDeclareQty(e.target.value)}
                  className="w-16 h-8 rounded-lg border border-input text-center font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseInt(declareQty)
                    if (Number.isNaN(parsed) || parsed < 0 || parsed > item.suggested_quantity) {
                      toast.error(`Informe entre 0 e ${item.suggested_quantity}`)
                      return
                    }
                    onDeclareQty(item.id, parsed)
                    setDeclareItemId(null)
                  }}
                  className="px-2.5 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors"
                >
                  Declarar
                </button>
                <button
                  type="button"
                  onClick={() => { onDeclareQty(item.id, 0); setDeclareItemId(null) }}
                  className="px-2.5 h-8 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-[11px] font-bold transition-colors"
                >
                  Em falta
                </button>
                {item.shipped_quantity !== null && (
                  <button
                    type="button"
                    onClick={() => { onDeclareQty(item.id, null); setDeclareItemId(null) }}
                    className="px-2.5 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground text-[11px] font-semibold transition-colors"
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeclareItemId(null)}
                  className="px-2 h-8 text-muted-foreground hover:text-foreground text-[11px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          </div>
        ))}
      </div>

      {request.status === 'open' && (
        <button
          onClick={() => onAdvance(request.id, 'picking')}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          <PlayCircle className="w-4 h-4" /> Iniciar separação
        </button>
      )}

      {request.status === 'picking' && !shipping && (
        <button
          onClick={startShipping}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          <Truck className="w-4 h-4" /> Confirmar envio
        </button>
      )}

      {request.status === 'picking' && shipping && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={confirmShipping}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors disabled:opacity-60"
          >
            {isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Enviar
          </button>
          <button
            onClick={() => setShipping(false)}
            className="px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-surface-alt transition-colors"
            title="Cancelar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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

  if (storeLoading) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
        </div>
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
      <div className="bg-white rounded-2xl border border-border shadow-card p-5">
        <h1 className="text-lg font-bold text-foreground">Pedidos de reposição</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Um pedido consolidado por loja, gerado automaticamente na confirmação da contagem — com todos os itens abaixo da meta.
        </p>
      </div>

      {requestsLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando pedidos…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start pb-8">
          {COLUMNS.map((col) => {
            const colRequests = col.status === 'shipped'
              ? shippedRecent
              : requests.filter((r) => r.status === col.status)
            return (
              <section key={col.status} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h2 className={`text-xs font-bold uppercase tracking-wide ${col.header}`}>{col.label}</h2>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-alt text-muted-foreground">
                    {colRequests.length}
                  </span>
                </div>
                {colRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                    <p className="text-xs text-muted-foreground">Nenhum pedido</p>
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
                      isPending={updateStatus.isPending}
                      highlighted={request.id === focusRequestId}
                    />
                  ))
                )}
              </section>
            )
          })}
        </div>
      )}
    </EstoqueLayout>
  )
}
