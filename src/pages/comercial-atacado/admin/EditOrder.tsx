import { useState, useEffect } from 'react'
import { formatBRL } from '@/lib/format'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getOrderStatus, toneClasses } from '@/lib/design/orderStatus'
import {
  Loader, Plus, Trash2, Search, Save,
  AlertTriangle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  product_id: string | null
  product_name: string
  qty: number
  unit_price: number
}

interface OrderData {
  id: string
  status: string
  total: number
  subtotal: number
  discount_amount: number
  customer_name: string
  payment_method: string | null
  payment_splits: Array<{ method: string; amount: number }> | null
  notes: string | null
  seller_id: string | null
  order_items: Array<{
    id: string
    product_id: string | null
    product_name_snapshot: string
    unit_price_snapshot: number
    qty: number
    line_total: number
  }>
}

const STATUS_OPTIONS = [
  'recebido', 'aguardando_pagamento', 'pago', 'separacao',
  'enviado', 'entregue', 'concluido', 'cancelado', 'expirado',
] as const

const PAYMENT_OPTIONS = ['PIX', 'Boleto', 'Dinheiro', 'Cartão de Crédito', 'pay_on_delivery']
const PAYMENT_LABELS: Record<string, string> = { pay_on_delivery: 'Pagar na entrega' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditOrder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()

  const canEdit = hasPermission('can_edit_orders')

  // form state
  const [items, setItems] = useState<CartItem[]>([])
  const [sellerId, setSellerId] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [status, setStatus] = useState<string>('recebido')
  const [notes, setNotes] = useState<string>('')
  const [discount, setDiscount] = useState<number>(0)

  // product search
  const [productSearch, setProductSearch] = useState('')
  const [showProductSearch, setShowProductSearch] = useState(false)

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: order, isLoading: loadingOrder } = useQuery({
    queryKey: ['edit-order', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(id, product_id, product_name_snapshot, unit_price_snapshot, qty, line_total)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as OrderData
    },
    enabled: !!id,
  })

  const { data: sellers = [] } = useQuery({
    queryKey: ['sellers-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sellers')
        .select('id, name, code')
        .eq('active', true)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string; code: string | null }[]
    },
    staleTime: 60_000,
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: async () => {
      if (!productSearch.trim()) return []
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, name, price')
        .eq('is_active', true)
        .ilike('name', `%${productSearch}%`)
        .limit(10)
      if (error) throw error
      return data as { id: string; name: string; price: number }[]
    },
    enabled: productSearch.length > 1,
    staleTime: 30_000,
  })

  // ─── Populate form when order loads ───────────────────────────────────────

  useEffect(() => {
    if (!order) return
    setItems(order.order_items.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name_snapshot,
      qty: i.qty,
      unit_price: i.unit_price_snapshot,
    })))
    setSellerId(order.seller_id ?? '')
    setPaymentMethod(order.payment_method ?? '')
    setStatus(order.status)
    setNotes(order.notes ?? '')
    setDiscount(order.discount_amount ?? 0)
  }, [order])

  // ─── Computed totals ──────────────────────────────────────────────────────

  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const total = Math.max(subtotal - discount, 0)

  // ─── Mutations ────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_update_order', {
        p_order_id:       id,
        p_seller_id:      sellerId || null,
        p_payment_method: paymentMethod || null,
        p_payment_splits: null,
        p_notes:          notes || null,
        p_status:         status,
        p_discount:       discount,
        p_items:          items.map(i => ({
          product_id:   i.product_id ?? '',
          product_name: i.product_name,
          qty:          i.qty,
          unit_price:   i.unit_price,
        })),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      toast.success('Pedido atualizado')
      navigate('/admin/pedidos')
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'desconhecido')),
  })

  // ─── Item helpers ─────────────────────────────────────────────────────────

  const updateItem = (index: number, field: keyof CartItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const addProduct = (p: { id: string; name: string; price: number }) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.product_id === p.id)
      if (existing >= 0) {
        return prev.map((item, i) => i === existing ? { ...item, qty: item.qty + 1 } : item)
      }
      return [...prev, { product_id: p.id, product_name: p.name, qty: 1, unit_price: Number(p.price) }]
    })
    setProductSearch('')
    setShowProductSearch(false)
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  const back = { to: '/admin/pedidos', label: 'Pedidos' }

  if (!canEdit) {
    return (
      <AdminLayout>
        <AdminPage title="Editar pedido" back={back} width="narrow">
          <Panel>
            <EmptyState
              icon={AlertTriangle}
              title="Sem permissão para editar pedidos"
              description={<>Peça ao administrador para habilitar <code className="font-mono text-[12px]">can_edit_orders</code> no seu perfil.</>}
              action={<Button variant="secondary" onClick={() => navigate('/admin/pedidos')}>Voltar para pedidos</Button>}
            />
          </Panel>
        </AdminPage>
      </AdminLayout>
    )
  }

  if (loadingOrder) {
    return (
      <AdminLayout>
        <AdminPage title="Editar pedido" back={back} width="narrow">
          <PageLoading label="Carregando pedido…" />
        </AdminPage>
      </AdminLayout>
    )
  }

  if (!order) {
    return (
      <AdminLayout>
        <AdminPage title="Editar pedido" back={back} width="narrow">
          <Panel>
            <EmptyState
              icon={AlertTriangle}
              title="Pedido não encontrado"
              description="O pedido pode ter sido excluído. Volte para a lista e tente de novo."
              action={<Button variant="secondary" onClick={() => navigate('/admin/pedidos')}>Voltar para pedidos</Button>}
            />
          </Panel>
        </AdminPage>
      </AdminLayout>
    )
  }

  const orderNumber = order.id.slice(0, 8).toUpperCase()
  const brl = formatBRL

  return (
    <AdminLayout>
      <AdminPage
        title={<>Editar pedido <span className="font-mono text-[0.8em] text-muted-foreground">#{orderNumber}</span></>}
        description={order.customer_name}
        back={back}
        width="narrow"
      >
        <div className="space-y-6">

          {/* ─── Itens ───────────────────────────────────────────────────── */}
          <Panel
            flush
            title="Itens do pedido"
            actions={
              <Button variant="secondary" size="sm" onClick={() => setShowProductSearch(v => !v)} aria-expanded={showProductSearch}>
                <Plus />
                Adicionar produto
              </Button>
            }
          >
            {/* Busca de produto */}
            {showProductSearch && (
              <div className="px-4 sm:px-5 py-3 border-b border-border bg-surface">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Buscar produto pelo nome…"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    autoFocus
                    className="pl-8 bg-card"
                  />
                </div>
                {products.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {products.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-card text-left transition-colors"
                      >
                        <span className="text-[13px] font-medium text-foreground truncate">{p.name}</span>
                        <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">{brl(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {productSearch.length > 1 && products.length === 0 && (
                  <p className="text-[12px] text-muted-foreground mt-2 px-1">Nenhum produto encontrado.</p>
                )}
              </div>
            )}

            {/* Lista de itens */}
            <div className="divide-y divide-border">
              {items.length === 0 && (
                <EmptyState
                  title="Nenhum item"
                  description="Adicione pelo menos um produto para salvar o pedido."
                  className="py-8"
                />
              )}
              {items.map((item, idx) => (
                <div key={idx} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="basis-full sm:basis-0 sm:flex-1 min-w-0 text-[13.5px] font-medium text-foreground truncate">{item.product_name}</p>
                  {/* qtd */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => updateItem(idx, 'qty', Math.max(1, item.qty - 1))}
                      aria-label="Diminuir quantidade"
                    >−</Button>
                    <Input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={e => updateItem(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                      aria-label="Quantidade"
                      className="w-12 h-7 px-1 text-center tabular-nums"
                    />
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => updateItem(idx, 'qty', item.qty + 1)}
                      aria-label="Aumentar quantidade"
                    >+</Button>
                  </div>
                  {/* preço unitário */}
                  <div className="relative shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground pointer-events-none">R$</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unit_price}
                      onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      aria-label="Preço unitário"
                      className="w-24 h-7 pl-7 pr-2 tabular-nums"
                    />
                  </div>
                  {/* total da linha */}
                  <span className="ml-auto sm:ml-0 text-[13.5px] font-semibold text-foreground w-24 text-right shrink-0 tabular-nums">
                    {brl(item.qty * item.unit_price)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItem(idx)}
                    className="h-7 w-7 shrink-0 hover:text-danger hover:bg-danger-subtle"
                    aria-label="Remover item"
                    title="Remover item"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>

            {/* Totais */}
            {items.length > 0 && (
              <div className="px-4 sm:px-5 py-4 border-t border-border bg-surface space-y-2 text-[13px] tabular-nums rounded-b-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{brl(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="edit-order-discount" className="text-muted-foreground">Desconto (R$)</label>
                  <Input
                    id="edit-order-discount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                    className="w-28 h-8 text-right tabular-nums bg-card"
                  />
                </div>
                <div className="flex items-center justify-between text-[15px] font-semibold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">{brl(total)}</span>
                </div>
              </div>
            )}
          </Panel>

          {/* ─── Detalhes ────────────────────────────────────────────────── */}
          <Panel title="Detalhes do pedido">
            <div className="space-y-4">
              <div>
                <span className="field-label">Status</span>
                <StyledSelect
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS.map(s => ({ value: s, label: getOrderStatus(s).label, dotClassName: toneClasses(getOrderStatus(s).tone).dot }))}
                  searchable={false}
                />
              </div>

              <div>
                <span className="field-label">Vendedor</span>
                <StyledSelect
                  value={sellerId}
                  onChange={setSellerId}
                  options={sellers.map(s => ({ value: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ''}` }))}
                  emptyLabel="Sem vendedor"
                  placeholder="Sem vendedor"
                />
              </div>

              <div>
                <span className="field-label">Forma de pagamento</span>
                <StyledSelect
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  options={PAYMENT_OPTIONS.map(p => ({ value: p, label: PAYMENT_LABELS[p] ?? p }))}
                  emptyLabel="Não informado"
                  placeholder="Não informado"
                />
              </div>

              <div>
                <label htmlFor="edit-order-notes" className="field-label">Observações</label>
                <Textarea
                  id="edit-order-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="resize-none"
                  placeholder="Anotações internas sobre o pedido…"
                />
              </div>
            </div>
          </Panel>

          {/* Barra de ação do rodapé (única ação primária da tela) */}
          <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-background/95 backdrop-blur-sm border-t border-border flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/pedidos')}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || items.length === 0}
            >
              {saveMutation.isPending ? <Loader className="animate-spin" /> : <Save />}
              Salvar alterações
            </Button>
          </div>
        </div>
      </AdminPage>
    </AdminLayout>
  )
}
