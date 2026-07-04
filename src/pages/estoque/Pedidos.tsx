import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Package, PlayCircle, Truck, X, Check, Store } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useMyStore } from '@/hooks/useMyStore'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'

interface RequestItem {
  id: string
  product_id: string
  suggested_quantity: number
  shipped_quantity: number | null
  catalog_products: { name: string; main_image: string | null } | null
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
  onAdvance,
  isPending,
}: {
  request: ReplenishmentRequest
  onAdvance: (requestId: string, newStatus: 'picking' | 'shipped', shippedItems?: { item_id: string; shipped_quantity: number }[]) => void
  isPending: boolean
}) {
  // Modo "conferindo envio": mostra um input de quantidade por item,
  // pré-preenchido com o sugerido, antes de confirmar o envio.
  const [shipping, setShipping] = useState(false)
  const [shipQty, setShipQty] = useState<Record<string, string>>({})

  const items = request.replenishment_request_items
  const totalSuggested = items.reduce((sum, i) => sum + i.suggested_quantity, 0)
  const totalShipped = items.reduce((sum, i) => sum + (i.shipped_quantity ?? 0), 0)

  const startShipping = () => {
    setShipQty(Object.fromEntries(items.map((i) => [i.id, String(i.suggested_quantity)])))
    setShipping(true)
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
    <div className="bg-white rounded-2xl border border-border shadow-card p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm font-bold text-foreground truncate">{request.stores?.name || 'Loja'}</p>
        </div>
        <p className="text-[11px] text-muted-foreground shrink-0">
          {new Date(request.generated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {items.length} {items.length === 1 ? 'item' : 'itens'} ·{' '}
        {request.status === 'shipped' ? `${totalShipped} un. enviadas` : `${totalSuggested} un. sugeridas`}
        {request.status === 'shipped' && request.shipped_at && (
          <> · {new Date(request.shipped_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</>
        )}
      </p>

      <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-surface-alt border border-border">
              {item.catalog_products?.main_image ? (
                <img src={item.catalog_products.main_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package className="w-3 h-3" /></div>
              )}
            </div>
            <span className="flex-1 min-w-0 truncate text-foreground">{item.catalog_products?.name || 'Produto removido'}</span>
            {shipping ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={shipQty[item.id] ?? ''}
                onChange={(e) => setShipQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="w-14 h-7 rounded-lg border border-input text-center font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-400 shrink-0"
              />
            ) : (
              <span className="font-bold shrink-0 tabular-nums">
                {request.status === 'shipped' ? (item.shipped_quantity ?? item.suggested_quantity) : item.suggested_quantity}
              </span>
            )}
          </div>
        ))}
      </div>

      {request.status === 'open' && (
        <button
          onClick={() => onAdvance(request.id, 'picking')}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <PlayCircle className="w-3.5 h-3.5" /> Iniciar separação
        </button>
      )}

      {request.status === 'picking' && !shipping && (
        <button
          onClick={startShipping}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <Truck className="w-3.5 h-3.5" /> Confirmar envio
        </button>
      )}

      {request.status === 'picking' && shipping && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={confirmShipping}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
          >
            {isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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

  const canView = isCentral || isAdmin

  const { data: requests = [], isLoading: requestsLoading } = useQuery<ReplenishmentRequest[]>({
    queryKey: ['replenishment-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('replenishment_requests')
        .select('id, destination_store_id, status, generated_at, shipped_at, stores(name), replenishment_request_items(id, product_id, suggested_quantity, shipped_quantity, catalog_products(name, main_image))')
        .order('generated_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return (data || []) as unknown as ReplenishmentRequest[]
    },
    enabled: canView,
    staleTime: 30 * 1000,
  })

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
                      onAdvance={(requestId, newStatus, shippedItems) => updateStatus.mutate({ requestId, newStatus, shippedItems })}
                      isPending={updateStatus.isPending}
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
