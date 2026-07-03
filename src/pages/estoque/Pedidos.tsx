import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Package, PlayCircle, Truck, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useMyStore } from '@/hooks/useMyStore'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'

interface ReplenishmentOrder {
  id: string
  product_id: string
  destination_store_id: string
  suggested_quantity: number
  shipped_quantity: number | null
  status: 'open' | 'picking' | 'shipped'
  generated_at: string
  catalog_products: { name: string; main_image: string | null } | null
  stores: { name: string; slug: string } | null
}

function ShipAction({ order, onShip }: { order: ReplenishmentOrder; onShip: (orderId: string, qty: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState(String(order.suggested_quantity))

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
      >
        <Truck className="w-3.5 h-3.5" /> Confirmar envio
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-20 h-8 rounded-lg border border-input text-center text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
        autoFocus
      />
      <button
        onClick={() => {
          const parsed = parseInt(qty)
          if (!parsed || parsed <= 0) {
            toast.error('Informe uma quantidade válida')
            return
          }
          onShip(order.id, parsed)
          setEditing(false)
        }}
        className="w-8 h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center justify-center"
        title="Confirmar"
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        onClick={() => setEditing(false)}
        className="w-8 h-8 rounded-lg border border-border hover:bg-surface-alt flex items-center justify-center"
        title="Cancelar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function EstoquePedidos() {
  const queryClient = useQueryClient()
  const { isCentral, isLoading: storeLoading, needsStoreSelection } = useMyStore()

  const { data: orders = [], isLoading: ordersLoading } = useQuery<ReplenishmentOrder[]>({
    queryKey: ['replenishment-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('replenishment_orders')
        .select('id, product_id, destination_store_id, suggested_quantity, shipped_quantity, status, generated_at, catalog_products(name, main_image), stores(name, slug)')
        .in('status', ['open', 'picking'])
        .order('generated_at', { ascending: true })
      if (error) throw error
      return (data || []) as unknown as ReplenishmentOrder[]
    },
    enabled: isCentral,
    staleTime: 30 * 1000,
  })

  const updateStatus = useMutation({
    mutationFn: async ({ orderId, newStatus, shippedQuantity }: { orderId: string; newStatus: 'picking' | 'shipped'; shippedQuantity?: number }) => {
      const { error } = await supabase.rpc('update_replenishment_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
        p_shipped_quantity: shippedQuantity ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment-orders'] })
    },
    onError: (err) => {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  if (needsStoreSelection) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Selecione uma loja no menu acima para começar.</p>
        </div>
      </EstoqueLayout>
    )
  }

  if (storeLoading) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
        </div>
      </EstoqueLayout>
    )
  }

  // Gate de UI complementar à RLS — satélite não vê esta tela nem no menu, nem na rota.
  if (!isCentral) {
    return <Navigate to="/estoque/contagem" replace />
  }

  const openOrders = orders.filter((o) => o.status === 'open')
  const pickingOrders = orders.filter((o) => o.status === 'picking')

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card p-5">
        <h1 className="text-lg font-bold text-foreground">Pedidos de reposição em aberto</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {openOrders.length} aberto{openOrders.length !== 1 ? 's' : ''} · {pickingOrders.length} em separação
        </p>
      </div>

      {ordersLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando pedidos…</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border shadow-card p-8 text-center">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Nenhum pedido de reposição em aberto.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Produto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Loja destino</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Sugerido</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Ação</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr key={order.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-surface-alt border border-border">
                          {order.catalog_products?.main_image ? (
                            <img src={order.catalog_products.main_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-foreground">{order.catalog_products?.name || 'Produto removido'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{order.stores?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold">{order.suggested_quantity}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                        order.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {order.status === 'open' ? 'Aberto' : 'Separando'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex justify-end">
                        {order.status === 'open' ? (
                          <button
                            onClick={() => updateStatus.mutate({ orderId: order.id, newStatus: 'picking' })}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors disabled:opacity-60"
                          >
                            <PlayCircle className="w-3.5 h-3.5" /> Iniciar separação
                          </button>
                        ) : (
                          <ShipAction
                            order={order}
                            onShip={(orderId, qty) => updateStatus.mutate({ orderId, newStatus: 'shipped', shippedQuantity: qty })}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </EstoqueLayout>
  )
}
