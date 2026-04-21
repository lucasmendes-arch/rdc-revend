import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import {
  Loader, ArrowLeft, Plus, Trash2, Search, Save,
  UserCheck, AlertTriangle,
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

const STATUS_LABELS: Record<string, string> = {
  recebido: 'Recebido', aguardando_pagamento: 'Aguardando Pagamento',
  pago: 'Pago', separacao: 'Em Separação', enviado: 'Enviado',
  entregue: 'Entregue', concluido: 'Concluído', cancelado: 'Cancelado',
  expirado: 'Expirado',
}

const PAYMENT_OPTIONS = ['PIX', 'Boleto', 'Dinheiro', 'Cartão de Crédito', 'pay_on_delivery']
const PAYMENT_LABELS: Record<string, string> = { pay_on_delivery: 'Pagar na Entrega' }

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
        .eq('active', true)
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
    setItems(prev => [...prev, { product_id: p.id, product_name: p.name, qty: 1, unit_price: p.price }])
    setProductSearch('')
    setShowProductSearch(false)
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  if (!canEdit) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <AlertTriangle className="w-10 h-10 text-red-500" />
          <p className="text-foreground font-semibold">Sem permissão para editar pedidos.</p>
          <p className="text-sm text-muted-foreground">Solicite ao administrador que habilite <code>can_edit_orders</code> no seu perfil.</p>
          <button onClick={() => navigate('/admin/pedidos')} className="btn-action px-4 py-2 rounded-xl text-sm font-semibold">
            Voltar
          </button>
        </div>
      </AdminLayout>
    )
  }

  if (loadingOrder) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-32">
          <Loader className="w-7 h-7 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    )
  }

  if (!order) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <p className="text-foreground font-semibold">Pedido não encontrado.</p>
          <button onClick={() => navigate('/admin/pedidos')} className="btn-action px-4 py-2 rounded-xl text-sm font-semibold">
            Voltar
          </button>
        </div>
      </AdminLayout>
    )
  }

  const orderNumber = order.id.slice(0, 8).toUpperCase()

  return (
    <AdminLayout>
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/pedidos')}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Editar Pedido #{orderNumber}</h1>
          <p className="text-xs text-muted-foreground">{order.customer_name}</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || items.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors disabled:opacity-60"
        >
          {saveMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </button>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto space-y-6">

        {/* ─── Itens ───────────────────────────────────────────────────── */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-sm text-foreground">Itens do pedido</h2>
            <button
              onClick={() => setShowProductSearch(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar produto
            </button>
          </div>

          {/* Product search */}
          {showProductSearch && (
            <div className="px-5 py-3 border-b border-border bg-muted/30">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar produto pelo nome..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              {products.length > 0 && (
                <div className="mt-2 space-y-1">
                  {products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-card text-left transition-colors"
                    >
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">R$ {p.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
              {productSearch.length > 1 && products.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2 px-1">Nenhum produto encontrado.</p>
              )}
            </div>
          )}

          {/* Items list */}
          <div className="divide-y divide-border">
            {items.length === 0 && (
              <p className="px-5 py-8 text-sm text-center text-muted-foreground">Nenhum item. Adicione pelo menos um produto.</p>
            )}
            {items.map((item, idx) => (
              <div key={idx} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                </div>
                {/* qty */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateItem(idx, 'qty', Math.max(1, item.qty - 1))}
                    className="w-6 h-6 rounded-md bg-muted hover:bg-muted/80 text-foreground text-sm font-bold flex items-center justify-center"
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={e => updateItem(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-10 text-center text-sm font-semibold bg-card border border-border rounded-md py-0.5 focus:outline-none focus:ring-1 focus:ring-ring/40"
                  />
                  <button
                    onClick={() => updateItem(idx, 'qty', item.qty + 1)}
                    className="w-6 h-6 rounded-md bg-muted hover:bg-muted/80 text-foreground text-sm font-bold flex items-center justify-center"
                  >+</button>
                </div>
                {/* unit price */}
                <div className="shrink-0">
                  <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-card">
                    <span className="text-xs text-muted-foreground">R$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unit_price}
                      onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-16 text-sm font-semibold bg-transparent focus:outline-none"
                    />
                  </div>
                </div>
                {/* line total */}
                <span className="text-sm font-bold text-foreground w-20 text-right shrink-0">
                  R$ {(item.qty * item.unit_price).toFixed(2)}
                </span>
                <button
                  onClick={() => removeItem(idx)}
                  className="text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Totals footer */}
          {items.length > 0 && (
            <div className="px-5 py-4 border-t border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Desconto (R$)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={discount}
                  onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                  className="w-24 text-right text-sm font-medium bg-card border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring/40"
                />
              </div>
              <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span className="text-emerald-600">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </section>

        {/* ─── Detalhes ────────────────────────────────────────────────── */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold text-sm text-foreground">Detalhes do pedido</h2>
          </div>
          <div className="px-5 py-4 space-y-4">

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Vendedor */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Vendedor
              </label>
              <select
                value={sellerId}
                onChange={e => setSellerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Sem vendedor</option>
                {sellers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Forma de pagamento */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Forma de pagamento</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Não informado</option>
                {PAYMENT_OPTIONS.map(p => (
                  <option key={p} value={p}>{PAYMENT_LABELS[p] ?? p}</option>
                ))}
              </select>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Observações</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Anotações internas sobre o pedido..."
              />
            </div>
          </div>
        </section>

        {/* Save button (bottom) */}
        <div className="flex justify-end pb-8">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || items.length === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors disabled:opacity-60"
          >
            {saveMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar alterações
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
