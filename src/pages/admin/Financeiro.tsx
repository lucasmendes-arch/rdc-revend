import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DollarSign, ShoppingCart, TrendingUp, Target, Loader, Clock, Package, UserCheck } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AdminLayout from '@/components/admin/AdminLayout'

// Statuses that mean "payment confirmed" (post-payment flow)
const PAID_STATUSES = ['pago', 'separacao', 'enviado', 'entregue', 'concluido']

interface Order {
  id: string
  status: string
  total: number
  subtotal: number
  shipping: number
  created_at: string
  customer_name: string
  customer_whatsapp: string
  seller_id?: string | null
  sellers?: { name: string; code: string | null; commission_pct: number } | null
}

interface OrderItem {
  product_name_snapshot: string
  qty: number
  line_total: number
  order_id: string
}

// Default monthly goal — could be made configurable via DB later
const DEFAULT_MONTHLY_GOAL = 50000

export default function AdminFinanceiro() {
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')

  // Fetch store settings for the monthly goal
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['admin-store-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('monthly_revenue_goal')
        .eq('id', 1)
        .single()
      
      if (error) throw error
      return data
    }
  })

  const monthlyGoal = settings?.monthly_revenue_goal || DEFAULT_MONTHLY_GOAL

  // Custom date filter
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['admin-financeiro-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total, subtotal, shipping, created_at, customer_name, customer_whatsapp, seller_id, sellers(name, code, commission_pct)')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as Order[]
    },
    staleTime: 60 * 1000,
  })

  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['admin-financeiro-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('product_name_snapshot, qty, line_total, order_id')

      if (error) throw error
      return (data || []) as OrderItem[]
    },
    staleTime: 60 * 1000,
  })

  const stats = useMemo(() => {
    const now = new Date()

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const paidOrders = allOrders.filter(o => PAID_STATUSES.includes(o.status))
    const pendingOrders = allOrders.filter(o => o.status === 'aguardando_pagamento')

    const todayOrders = paidOrders.filter(o => new Date(o.created_at) >= startOfToday)
    const weekOrders = paidOrders.filter(o => new Date(o.created_at) >= startOfWeek)
    const monthOrders = paidOrders.filter(o => new Date(o.created_at) >= startOfMonth)

    const todayRevenue = todayOrders.reduce((sum, o) => sum + Number(o.total), 0)
    const weekRevenue = weekOrders.reduce((sum, o) => sum + Number(o.total), 0)
    const monthRevenue = monthOrders.reduce((sum, o) => sum + Number(o.total), 0)

    const avgTicket = paidOrders.length > 0
      ? paidOrders.reduce((sum, o) => sum + Number(o.total), 0) / paidOrders.length
      : 0

    const goalPct = monthlyGoal > 0 ? Math.min((monthRevenue / monthlyGoal) * 100, 100) : 0

    // Daily target to reach goal
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const todayDay = now.getDate()
    const daysRemaining = Math.max(lastDayOfMonth - todayDay + 1, 1) // include today
    const remainingGoal = Math.max(monthlyGoal - monthRevenue, 0)
    const dailyTarget = remainingGoal / daysRemaining

    const pendingTotal = pendingOrders.reduce((sum, o) => sum + Number(o.total), 0)

    // Custom date filter
    let customOrders = paidOrders
    let customRevenue = 0
    if (dateFrom || dateTo) {
      customOrders = paidOrders.filter(o => {
        const d = new Date(o.created_at)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo) {
          const to = new Date(dateTo)
          to.setHours(23, 59, 59, 999)
          if (d > to) return false
        }
        return true
      })
      customRevenue = customOrders.reduce((sum, o) => sum + Number(o.total), 0)
    }

    // Last 30 days chart data
    const chartData: { date: string; revenue: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = `${d.getDate()}/${d.getMonth() + 1}`
      const dayRevenue = paidOrders
        .filter(o => o.created_at.slice(0, 10) === key)
        .reduce((sum, o) => sum + Number(o.total), 0)
      chartData.push({ date: label, revenue: Math.round(dayRevenue * 100) / 100 })
    }

    // Top 5 products this month
    const monthOrderIds = new Set(monthOrders.map(o => o.id))
    const monthItems = allOrderItems.filter(i => monthOrderIds.has(i.order_id))
    const productMap = new Map<string, { qty: number; revenue: number }>()
    for (const item of monthItems) {
      const existing = productMap.get(item.product_name_snapshot) || { qty: 0, revenue: 0 }
      existing.qty += item.qty
      existing.revenue += Number(item.line_total)
      productMap.set(item.product_name_snapshot, existing)
    }
    const topProducts = Array.from(productMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)

    // Seller breakdown — month paid orders
    const sellerMap = new Map<string, { name: string; code: string | null; commission_pct: number; count: number; revenue: number }>()
    for (const order of monthOrders) {
      if (!order.sellers) continue
      const key = order.seller_id!
      const existing = sellerMap.get(key) || {
        name: order.sellers.name,
        code: order.sellers.code,
        commission_pct: order.sellers.commission_pct,
        count: 0,
        revenue: 0,
      }
      existing.count += 1
      existing.revenue += Number(order.total)
      sellerMap.set(key, existing)
    }
    const sellerBreakdown = Array.from(sellerMap.values()).sort((a, b) => b.revenue - a.revenue)

    return {
      todayRevenue, weekRevenue, monthRevenue,
      todayCount: todayOrders.length,
      weekCount: weekOrders.length,
      monthCount: monthOrders.length,
      avgTicket, goalPct, dailyTarget, daysRemaining, remainingGoal,
      pendingOrders, pendingTotal,
      chartData, topProducts,
      customOrders, customRevenue,
      sellerBreakdown,
    }
  }, [allOrders, allOrderItems, monthlyGoal, dateFrom, dateTo])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral de faturamento e recebimentos</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dados financeiros...</p>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-6 space-y-6">

          {/* === TOP CARDS === */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Today */}
            <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Hoje</span>
              </div>
              <p className="text-lg sm:text-xl font-black text-foreground">R$ {fmt(stats.todayRevenue)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{stats.todayCount} pedido{stats.todayCount !== 1 ? 's' : ''}</p>
            </div>

            {/* Week */}
            <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Semana</span>
              </div>
              <p className="text-lg sm:text-xl font-black text-foreground">R$ {fmt(stats.weekRevenue)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{stats.weekCount} pedido{stats.weekCount !== 1 ? 's' : ''}</p>
            </div>

            {/* Month */}
            <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Mês</span>
              </div>
              <p className="text-lg sm:text-xl font-black text-foreground">R$ {fmt(stats.monthRevenue)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{stats.monthCount} pedido{stats.monthCount !== 1 ? 's' : ''}</p>
            </div>

            {/* Ticket Médio */}
            <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Ticket Médio</span>
              </div>
              <p className="text-lg sm:text-xl font-black text-foreground">R$ {fmt(stats.avgTicket)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Geral (pagos)</p>
            </div>
          </div>

          {/* === MONTHLY GOAL === */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-gold-text" />
                <span className="text-sm font-bold text-foreground">Meta do Mês</span>
              </div>
              {editingGoal ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    className="w-28 px-2 py-1 text-sm border border-border rounded-lg focus:ring-2 focus:ring-gold"
                  />
                  <button
                    onClick={async () => {
                      const v = parseFloat(goalInput)
                      if (isNaN(v) || v <= 0) return

                      const { error } = await supabase
                        .from('store_settings')
                        .update({ monthly_revenue_goal: v })
                        .eq('id', 1)

                      if (error) {
                        alert('Erro ao salvar meta: ' + error.message)
                      } else {
                        await refetchSettings()
                        setEditingGoal(false)
                      }
                    }}
                    className="px-3 py-1 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setGoalInput(String(monthlyGoal)); setEditingGoal(true) }}
                  className="text-xs text-gold-text font-semibold hover:underline"
                >
                  R$ {fmt(monthlyGoal)} — Editar
                </button>
              )}
            </div>
            <div className="w-full bg-surface-alt rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full gradient-gold transition-all duration-500"
                style={{ width: `${stats.goalPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>R$ {fmt(stats.monthRevenue)} faturado</span>
              <span className="font-bold text-foreground">{stats.goalPct.toFixed(1)}%</span>
            </div>

            {/* Daily Target */}
            {stats.remainingGoal > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-amber-800">Meta diária para bater a meta:</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-amber-700">R$ {fmt(stats.dailyTarget)}</span>
                  <span className="text-[10px] text-amber-600 ml-1">/ dia</span>
                  <p className="text-[10px] text-amber-600">Faltam R$ {fmt(stats.remainingGoal)} em {stats.daysRemaining} dia{stats.daysRemaining !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )}
            {stats.remainingGoal <= 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <span className="text-sm font-bold text-green-700">🎉 Meta do mês atingida! Parabéns!</span>
              </div>
            )}
          </div>

          {/* === CUSTOM DATE FILTER === */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-3">Filtro por Período</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Data Início</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Data Fim</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-gold"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo('') }}
                  className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Limpar
                </button>
              )}
            </div>
            {(dateFrom || dateTo) && (
              <div className="mt-4 flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Faturamento:</span>{' '}
                  <span className="font-black text-foreground">R$ {fmt(stats.customRevenue)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pedidos:</span>{' '}
                  <span className="font-bold text-foreground">{stats.customOrders.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* === CHART: Last 30 Days === */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-4">Faturamento — Últimos 30 dias</h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`R$ ${fmt(value)}`, 'Faturamento']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#d4a017"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#d4a017' }}
                    activeDot={{ r: 5, fill: '#d4a017' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* === SELLER BREAKDOWN === */}
          {stats.sellerBreakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <UserCheck className="w-4 h-4 text-gold-text" />
                <h3 className="text-sm font-bold text-foreground">Por Vendedor — Mês Atual</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 font-semibold">Vendedor</th>
                    <th className="text-center py-2 font-semibold">Pedidos</th>
                    <th className="text-right py-2 font-semibold">Faturamento</th>
                    <th className="text-right py-2 font-semibold">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.sellerBreakdown.map((seller) => {
                    const commission = seller.revenue * (seller.commission_pct / 100)
                    return (
                      <tr key={seller.name} className="hover:bg-surface-alt/50">
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground text-xs">{seller.name}</span>
                            {seller.code && (
                              <span className="px-1.5 py-0.5 rounded bg-surface-alt text-[9px] font-mono font-semibold text-muted-foreground">
                                {seller.code}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-center text-muted-foreground text-xs">{seller.count}</td>
                        <td className="py-2.5 text-right font-bold text-foreground text-xs">R$ {fmt(seller.revenue)}</td>
                        <td className="py-2.5 text-right text-xs">
                          {seller.commission_pct > 0 ? (
                            <span className="font-semibold text-amber-700">R$ {fmt(commission)}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* === BOTTOM SECTION: Side by side === */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Top 5 Products */}
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-4 h-4 text-gold-text" />
                <h3 className="text-sm font-bold text-foreground">Top 5 Produtos — Mês Atual</h3>
              </div>
              {stats.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma venda no mês</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-2 font-semibold">Produto</th>
                      <th className="text-center py-2 font-semibold">Qtd</th>
                      <th className="text-right py-2 font-semibold">Receita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.topProducts.map(([name, data], i) => (
                      <tr key={name} className="hover:bg-surface-alt/50">
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-surface-alt text-[10px] font-bold flex items-center justify-center text-muted-foreground flex-shrink-0">
                              {i + 1}
                            </span>
                            <span className="font-medium text-foreground text-xs truncate max-w-[180px]">{name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-center text-muted-foreground text-xs">{data.qty}</td>
                        <td className="py-2.5 text-right font-bold text-foreground text-xs">R$ {fmt(data.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pending Orders */}
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm font-bold text-foreground">Aguardando Pagamento</h3>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                  R$ {fmt(stats.pendingTotal)}
                </span>
              </div>
              {stats.pendingOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum pedido pendente</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {stats.pendingOrders.map(order => {
                    const orderDate = new Date(order.created_at)
                    const hoursAgo = Math.round((Date.now() - orderDate.getTime()) / (1000 * 60 * 60))
                    return (
                      <div key={order.id} className="flex items-center justify-between p-3 bg-surface-alt rounded-lg border border-border">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{order.customer_name}</p>
                          <p className="text-[10px] text-muted-foreground">{order.customer_whatsapp}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-xs font-black text-foreground">R$ {fmt(Number(order.total))}</p>
                          <p className="text-[10px] text-orange-600 font-medium">{hoursAgo}h atrás</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </AdminLayout>
  )
}
