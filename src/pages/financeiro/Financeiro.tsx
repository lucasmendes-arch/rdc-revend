import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  DollarSign, ShoppingCart, TrendingUp, Target,
  Package, UserCheck, ArrowUpRight, ArrowDownRight, Minus,
  Percent, Truck, Users, BarChart3, CalendarDays,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, Panel, StatCard, StatGrid, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter'
import { ADMIN_DEFAULT_PERIOD_PRESETS } from '@/components/admin/ui/presets'

// Cores do gráfico vêm dos tokens (já trocam no dark mode): ouro da logo para
// a série principal, neutro tracejado para a comparação, grid em hairline.
const CHART = {
  current: 'hsl(var(--brand))',
  previous: 'hsl(var(--ink-400))',
  grid: 'hsl(var(--border))',
  tick: 'hsl(var(--muted-foreground))',
  cursor: 'hsl(var(--ink-300))',
}

// Statuses that mean "payment confirmed" (post-payment flow)
const PAID_STATUSES = ['pago', 'separacao', 'enviado', 'entregue', 'concluido']

interface Order {
  id: string
  status: string
  total: number
  subtotal: number
  shipping: number
  discount_amount: number
  origin: string | null
  delivery_method: string
  created_at: string
  customer_name: string
  customer_whatsapp: string
  user_id: string
  seller_id?: string | null
  sellers?: { name: string; code: string | null; commission_pct: number; monthly_goal: number } | { name: string; code: string | null; commission_pct: number; monthly_goal: number }[] | null
}

// PostgREST returns FK joins as object (many-to-one) or array (one-to-many)
type SellerRow = { name: string; code: string | null; commission_pct: number; monthly_goal: number }
function getSeller(order: Order): SellerRow | null {
  if (!order.sellers) return null
  return Array.isArray(order.sellers) ? (order.sellers[0] ?? null) : order.sellers
}

interface OrderItem {
  product_name_snapshot: string
  qty: number
  line_total: number
  order_id: string
}

type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | '3months' | '6months' | 'custom'

const DEFAULT_MONTHLY_GOAL = 50000

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtCompact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k` : fmt(v)

const daysBetween = (a: Date, b: Date) =>
  Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1

function computePeriodBounds(preset: PeriodPreset, customFrom: string, customTo: string) {
  const now = new Date()
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const eod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

  let periodStart: Date
  let periodEnd: Date
  let compStart: Date
  let compEnd: Date
  let periodLabel: string
  let compLabel: string

  switch (preset) {
    case 'today': {
      periodStart = sod(now)
      periodEnd = eod(now)
      const yesterday = new Date(periodStart)
      yesterday.setDate(yesterday.getDate() - 1)
      compStart = sod(yesterday)
      compEnd = eod(yesterday)
      periodLabel = 'Hoje'
      compLabel = 'ontem'
      break
    }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      periodStart = sod(y)
      periodEnd = eod(y)
      const dy = new Date(y)
      dy.setDate(dy.getDate() - 1)
      compStart = sod(dy)
      compEnd = eod(dy)
      periodLabel = 'Ontem'
      compLabel = 'anteontem'
      break
    }
    case 'week': {
      periodStart = sod(now)
      periodStart.setDate(periodStart.getDate() - 6)
      periodEnd = eod(now)
      compEnd = new Date(periodStart)
      compEnd.setDate(compEnd.getDate() - 1)
      compEnd = eod(compEnd)
      compStart = sod(new Date(compEnd))
      compStart.setDate(compStart.getDate() - 6)
      periodLabel = 'Últimos 7 dias'
      compLabel = '7 dias anteriores'
      break
    }
    case 'month': {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      periodEnd = eod(now)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
      const equivDay = Math.min(now.getDate(), prevMonthLastDay)
      compStart = prevMonthStart
      compEnd = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), equivDay, 23, 59, 59, 999)
      const curName = now.toLocaleString('pt-BR', { month: 'long' })
      const prevName = prevMonthStart.toLocaleString('pt-BR', { month: 'long' })
      periodLabel = curName.charAt(0).toUpperCase() + curName.slice(1)
      compLabel = prevName
      break
    }
    case 'last_month': {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      periodStart = lmStart
      periodEnd = lmEnd
      const ppStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const ppEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999)
      compStart = ppStart
      compEnd = ppEnd
      const lmName = lmStart.toLocaleString('pt-BR', { month: 'long' })
      const ppName = ppStart.toLocaleString('pt-BR', { month: 'long' })
      periodLabel = lmName.charAt(0).toUpperCase() + lmName.slice(1)
      compLabel = ppName
      break
    }
    case '3months': {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      periodEnd = eod(now)
      compStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      compEnd = new Date(periodStart.getTime() - 1)
      periodLabel = 'Últimos 3 meses'
      compLabel = '3 meses anteriores'
      break
    }
    case '6months': {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      periodEnd = eod(now)
      compStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      compEnd = new Date(periodStart.getTime() - 1)
      periodLabel = 'Últimos 6 meses'
      compLabel = '6 meses anteriores'
      break
    }
    case 'custom': {
      if (customFrom) {
        periodStart = sod(new Date(customFrom + 'T00:00:00'))
      } else {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      }
      if (customTo) {
        periodEnd = eod(new Date(customTo + 'T00:00:00'))
      } else {
        periodEnd = eod(now)
      }
      const duration = periodEnd.getTime() - periodStart.getTime()
      compEnd = new Date(periodStart.getTime() - 1)
      compStart = new Date(compEnd.getTime() - duration)
      compStart = sod(compStart)
      compEnd = eod(compEnd)
      const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      periodLabel = `${fmtD(periodStart)} a ${fmtD(periodEnd)}`
      compLabel = `${fmtD(compStart)} a ${fmtD(compEnd)}`
      break
    }
  }

  return { periodStart, periodEnd, compStart, compEnd, periodLabel, compLabel }
}

// --- Variation badge ---
function VariationBadge({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-muted-foreground">—</span>
  if (previous === 0) return (
    <span className="inline-flex items-center gap-0.5 font-medium text-success">
      <ArrowUpRight className="w-3.5 h-3.5" /> novo
    </span>
  )

  const pct = ((current - previous) / previous) * 100
  const isPositive = invert ? pct < 0 : pct > 0
  const isNeutral = Math.abs(pct) < 0.5

  if (isNeutral) return (
    <span className="inline-flex items-center gap-0.5 font-medium text-muted-foreground">
      <Minus className="w-3.5 h-3.5" /> 0%
    </span>
  )

  return (
    <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${isPositive ? 'text-success' : 'text-danger'}`}>
      {pct > 0
        ? <ArrowUpRight className="w-3.5 h-3.5" />
        : <ArrowDownRight className="w-3.5 h-3.5" />
      }
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export default function AdminFinanceiro() {
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [activePreset, setActivePreset] = useState<PeriodPreset>('month')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

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
    },
  })

  const monthlyGoal = settings?.monthly_revenue_goal || DEFAULT_MONTHLY_GOAL

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['admin-financeiro-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total, subtotal, shipping, discount_amount, origin, delivery_method, created_at, customer_name, customer_whatsapp, user_id, seller_id, sellers(name, code, commission_pct, monthly_goal)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Order[]
    },
    staleTime: 60_000,
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
    staleTime: 60_000,
  })

  // Fetch client sessions to match CRM funnel conversion logic
  const { data: allSessions = [] } = useQuery({
    queryKey: ['admin-financeiro-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_sessions')
        .select('id, status, created_at')
      if (error) throw error
      return data || []
    },
    staleTime: 60_000,
  })

  const bounds = useMemo(
    () => computePeriodBounds(activePreset, customDateFrom, customDateTo),
    [activePreset, customDateFrom, customDateTo],
  )

  const stats = useMemo(() => {
    const now = new Date()
    const { periodStart, periodEnd, compStart, compEnd } = bounds

    const paidOrders = allOrders.filter(o => PAID_STATUSES.includes(o.status))
    const pendingOrders = allOrders.filter(o => o.status === 'aguardando_pagamento')

    // Index revenue by date for O(1) chart lookups
    const revenueByDate = new Map<string, number>()
    for (const o of paidOrders) {
      const key = o.created_at.slice(0, 10)
      revenueByDate.set(key, (revenueByDate.get(key) || 0) + Number(o.total))
    }

    // Period orders
    const periodOrders = paidOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= periodStart && d <= periodEnd
    })
    const compOrders = paidOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= compStart && d <= compEnd
    })

    const periodRevenue = periodOrders.reduce((s, o) => s + Number(o.total), 0)
    const compRevenue = compOrders.reduce((s, o) => s + Number(o.total), 0)
    const periodCount = periodOrders.length
    const compCount = compOrders.length
    const periodTicket = periodCount > 0 ? periodRevenue / periodCount : 0
    const compTicket = compCount > 0 ? compRevenue / compCount : 0

    // Goal: always monthly
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthOrders = paidOrders.filter(o => new Date(o.created_at) >= startOfMonth)
    const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total), 0)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const goalPct = monthlyGoal > 0 ? Math.min((monthRevenue / monthlyGoal) * 100, 100) : 0
    const daysRemaining = Math.max(lastDayOfMonth - now.getDate() + 1, 1)
    const remainingGoal = Math.max(monthlyGoal - monthRevenue, 0)
    const dailyTarget = remainingGoal / daysRemaining

    // Pending: always global (current state, not historical)
    const pendingTotal = pendingOrders.reduce((s, o) => s + Number(o.total), 0)

    // Period aggregates for mini-cards
    const periodDiscount = periodOrders.reduce((s, o) => s + Number(o.discount_amount || 0), 0)
    const periodShipping = periodOrders.reduce((s, o) => s + Number(o.shipping || 0), 0)
    const periodCustomerIds = new Set(periodOrders.map(o => o.user_id))
    const compCustomerIds = new Set(compOrders.map(o => o.user_id))

    // Funnel Conversion logic (Matching CRM Clientes tab): Comprou / Total Sessions
    const periodSessions = allSessions.filter(s => {
      const d = new Date(s.created_at)
      return d >= periodStart && d <= periodEnd
    })
    const boughtSessions = periodSessions.filter(s => s.status === 'comprou')
    const totalSessions = periodSessions.length
    const conversionRate = totalSessions > 0 ? (boughtSessions.length / totalSessions) * 100 : 0

    // Today/week quick stats (always from today, regardless of filter)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayOrders = paidOrders.filter(o => new Date(o.created_at) >= startOfToday)
    const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total), 0)
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const weekOrders = paidOrders.filter(o => new Date(o.created_at) >= startOfWeek)
    const weekRevenue = weekOrders.reduce((s, o) => s + Number(o.total), 0)

    // Commission total
    const periodCommission = periodOrders.reduce((s, o) => {
      const seller = getSeller(o)
      if (!seller) return s
      return s + Number(o.total) * (seller.commission_pct / 100)
    }, 0)

    // Origin breakdown
    const originMap = new Map<string, { count: number; revenue: number }>()
    for (const o of periodOrders) {
      const key = o.origin || 'outro'
      const e = originMap.get(key) || { count: 0, revenue: 0 }
      e.count += 1
      e.revenue += Number(o.total)
      originMap.set(key, e)
    }
    const originBreakdown = Array.from(originMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)

    // Chart: always current month vs previous month (day-by-day)
    const chartStartOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const chartPrevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const chartDaysInMonth = lastDayOfMonth
    const chartData: { label: string; atual: number; anterior: number }[] = []
    for (let d = 1; d <= chartDaysInMonth; d++) {
      if (d > now.getDate()) break
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const prevKey = `${chartPrevMonthStart.getFullYear()}-${String(chartPrevMonthStart.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      chartData.push({
        label: String(d),
        atual: Math.round((revenueByDate.get(curKey) || 0) * 100) / 100,
        anterior: Math.round((revenueByDate.get(prevKey) || 0) * 100) / 100,
      })
    }
    const chartCurrentMonthName = now.toLocaleString('pt-BR', { month: 'long' })
    const chartPrevMonthName = chartPrevMonthStart.toLocaleString('pt-BR', { month: 'long' })

    // Top 5 products
    const periodOrderIds = new Set(periodOrders.map(o => o.id))
    const periodItems = allOrderItems.filter(i => periodOrderIds.has(i.order_id))
    const productMap = new Map<string, { qty: number; revenue: number }>()
    for (const item of periodItems) {
      const e = productMap.get(item.product_name_snapshot) || { qty: 0, revenue: 0 }
      e.qty += item.qty
      e.revenue += Number(item.line_total)
      productMap.set(item.product_name_snapshot, e)
    }
    const topProducts = Array.from(productMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)

    // Seller breakdown (period)
    const sellerMap = new Map<string, { name: string; code: string | null; commission_pct: number; monthly_goal: number; count: number; revenue: number; monthRevenue: number }>()
    // First pass: month revenue per seller (for goal tracking)
    const monthStartSeller = new Date(now.getFullYear(), now.getMonth(), 1)
    for (const order of paidOrders) {
      const seller = getSeller(order)
      if (!seller) continue
      const orderDate = new Date(order.created_at)
      if (orderDate < monthStartSeller) continue
      const key = order.seller_id!
      const e = sellerMap.get(key) || {
        name: seller.name, code: seller.code,
        commission_pct: seller.commission_pct, monthly_goal: seller.monthly_goal || 0,
        count: 0, revenue: 0, monthRevenue: 0,
      }
      e.monthRevenue += Number(order.total)
      sellerMap.set(key, e)
    }
    // Second pass: period revenue per seller
    for (const order of periodOrders) {
      const seller = getSeller(order)
      if (!seller) continue
      const key = order.seller_id!
      const e = sellerMap.get(key) || {
        name: seller.name, code: seller.code,
        commission_pct: seller.commission_pct, monthly_goal: seller.monthly_goal || 0,
        count: 0, revenue: 0, monthRevenue: 0,
      }
      e.count += 1
      e.revenue += Number(order.total)
      sellerMap.set(key, e)
    }
    const sellerBreakdown = Array.from(sellerMap.values()).sort((a, b) => b.revenue - a.revenue)

    return {
      periodRevenue, compRevenue,
      periodCount, compCount,
      periodTicket, compTicket,
      goalPct, dailyTarget, daysRemaining, remainingGoal, monthRevenue,
      todayRevenue, todayCount: todayOrders.length,
      weekRevenue, weekCount: weekOrders.length,
      pendingOrders, pendingTotal,
      periodDiscount, periodShipping, periodCommission,
      periodCustomerCount: periodCustomerIds.size,
      compCustomerCount: compCustomerIds.size,
      conversionRate, totalSessions, boughtSessions: boughtSessions.length,
      originBreakdown,
      chartData,
      chartCurrentMonthName, chartPrevMonthName,
      topProducts, sellerBreakdown,
    }
  }, [allOrders, allOrderItems, monthlyGoal, bounds, allSessions])

  const originLabels: Record<string, string> = {
    site: 'Site', whatsapp: 'WhatsApp', loja_fisica: 'Loja física',
    salao: 'Salão', outro: 'Outro',
  }

  const handlePresetClick = (preset: PeriodPreset) => {
    setActivePreset(preset)
    if (preset !== 'custom') {
      setCustomDateFrom('')
      setCustomDateTo('')
    }
  }

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <AdminLayout>
      <AdminPage
        title="Financeiro"
        description={`${bounds.periodLabel} — comparando com ${bounds.compLabel}`}
        toolbar={
          <AdminPeriodFilter
            presets={ADMIN_DEFAULT_PERIOD_PRESETS}
            activePreset={activePreset}
            onPresetChange={(k) => handlePresetClick(k as PeriodPreset)}
            customDateFrom={customDateFrom}
            customDateTo={customDateTo}
            onCustomDateFromChange={setCustomDateFrom}
            onCustomDateToChange={setCustomDateTo}
          />
        }
      >
        {isLoading ? (
          <PageLoading label="Carregando dados financeiros…" />
        ) : (
          <div className="space-y-6">
            {/* KPIs principais */}
            <StatGrid>
              <StatCard
                label="Faturamento"
                icon={DollarSign}
                tone="brand"
                value={`R$ ${fmt(stats.periodRevenue)}`}
                hint={<span className="inline-flex items-center gap-1.5"><VariationBadge current={stats.periodRevenue} previous={stats.compRevenue} /> vs {bounds.compLabel}</span>}
              />
              <StatCard
                label="Pedidos pagos"
                icon={ShoppingCart}
                value={stats.periodCount}
                hint={<span className="inline-flex items-center gap-1.5"><VariationBadge current={stats.periodCount} previous={stats.compCount} /> vs {bounds.compLabel}</span>}
              />
              <StatCard
                label="Ticket médio"
                icon={BarChart3}
                value={`R$ ${fmt(stats.periodTicket)}`}
                hint={<span className="inline-flex items-center gap-1.5"><VariationBadge current={stats.periodTicket} previous={stats.compTicket} /> vs {bounds.compLabel}</span>}
              />

              {/* Meta mensal — mesmo visual do StatCard, com edição inline */}
              <div className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-xs min-w-0">
                <div className="flex items-center justify-between gap-2 h-5">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground min-w-0">
                    <Target className="w-3.5 h-3.5 shrink-0 text-ink-400" />
                    <span className="truncate">Meta mensal</span>
                  </div>
                  {editingGoal ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
                        aria-label="Meta mensal em reais"
                        className="w-20 h-6 px-1.5 text-[12px] tabular-nums border border-input bg-background rounded-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button
                        size="xs"
                        className="h-6"
                        onClick={async () => {
                          const v = parseFloat(goalInput)
                          if (isNaN(v) || v <= 0) return
                          const { error } = await supabase
                            .from('store_settings').update({ monthly_revenue_goal: v }).eq('id', 1)
                          if (error) { toast.error('Erro ao salvar a meta: ' + error.message) } else {
                            await refetchSettings(); setEditingGoal(false)
                          }
                        }}
                      >OK</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setGoalInput(String(monthlyGoal)); setEditingGoal(true) }}
                      className="text-[12px] text-brand-strong font-medium hover:underline shrink-0"
                    >
                      Editar
                    </button>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="font-title text-[22px] sm:text-[24px] leading-none font-semibold text-foreground tabular-nums">{stats.goalPct.toFixed(0)}%</span>
                  <span className="text-[12px] text-muted-foreground tabular-nums truncate">de R$ {fmtCompact(monthlyGoal)}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stats.goalPct >= 100 ? 'bg-success-solid' : stats.goalPct >= 70 ? 'bg-brand' : 'bg-warning-solid'
                    }`}
                    style={{ width: `${stats.goalPct}%` }}
                  />
                </div>
                {stats.remainingGoal > 0 ? (
                  <p className="text-[12px] text-muted-foreground mt-1.5 truncate tabular-nums">
                    Faltam R$ {fmtCompact(stats.remainingGoal)} · R$ {fmtCompact(stats.dailyTarget)}/dia · {stats.daysRemaining}d
                  </p>
                ) : (
                  <p className="text-[12px] font-medium text-success mt-1.5">Meta atingida</p>
                )}
              </div>
            </StatGrid>

            {/* KPIs secundários */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                icon={DollarSign} label="Hoje"
                value={`R$ ${fmt(stats.todayRevenue)}`}
                hint={`${stats.todayCount} pedido${stats.todayCount !== 1 ? 's' : ''}`}
              />
              <StatCard
                icon={CalendarDays} label="Semana"
                value={`R$ ${fmt(stats.weekRevenue)}`}
                hint={`${stats.weekCount} pedido${stats.weekCount !== 1 ? 's' : ''}`}
              />
              <StatCard
                icon={Percent} label="Descontos"
                value={`R$ ${fmt(stats.periodDiscount)}`}
                hint="No período"
              />
              <StatCard
                icon={Truck} label="Frete"
                value={`R$ ${fmt(stats.periodShipping)}`}
                hint="No período"
              />
              <StatCard
                icon={Users} label="Clientes"
                value={stats.periodCustomerCount}
                hint={stats.compCustomerCount > 0 ? `${stats.compCustomerCount} no período anterior` : 'No período'}
                className="col-span-2 sm:col-span-1"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Gráfico: mês atual vs mês anterior */}
              <Panel
                className="lg:col-span-2"
                title={`${capitalize(stats.chartCurrentMonthName)} vs ${stats.chartPrevMonthName}`}
                actions={
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: CHART.current }} />
                      <span className="capitalize">{stats.chartCurrentMonthName}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0 inline-block border-t-2 border-dashed" style={{ borderColor: CHART.previous }} />
                      <span className="capitalize">{stats.chartPrevMonthName}</span>
                    </span>
                  </div>
                }
              >
                {stats.chartData.length === 0 ? (
                  <div className="h-44 flex items-center justify-center">
                    <p className="text-[13px] text-muted-foreground">Sem dados no mês</p>
                  </div>
                ) : (
                  <div className="h-48 sm:h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: CHART.tick }}
                          interval="preserveStartEnd"
                          axisLine={{ stroke: CHART.grid }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: CHART.tick }}
                          tickFormatter={v => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                          axisLine={false}
                          tickLine={false}
                          width={48}
                        />
                        <Tooltip
                          cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
                          formatter={(value: number, name: string) => [
                            `R$ ${fmt(value)}`,
                            capitalize(name === 'atual' ? stats.chartCurrentMonthName : stats.chartPrevMonthName),
                          ]}
                          labelFormatter={l => `Dia ${l}`}
                          contentStyle={{
                            borderRadius: 8,
                            border: '1px solid hsl(var(--border))',
                            boxShadow: 'var(--shadow-md)',
                            fontSize: 12,
                            backgroundColor: 'hsl(var(--popover))',
                            color: 'hsl(var(--popover-foreground))',
                            padding: '8px 10px',
                          }}
                          labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}
                          itemStyle={{ color: 'hsl(var(--foreground))', padding: 0, fontVariantNumeric: 'tabular-nums' }}
                        />
                        <Legend content={() => null} />
                        <Line
                          type="monotone" dataKey="anterior" name="anterior"
                          stroke={CHART.previous} strokeWidth={1.5} strokeDasharray="5 4"
                          dot={false} activeDot={{ r: 4, fill: CHART.previous, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                        />
                        <Line
                          type="monotone" dataKey="atual" name="atual"
                          stroke={CHART.current} strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: CHART.current, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>

              {/* Vendas por vendedor */}
              <Panel title="Vendas por vendedor">
                {stats.sellerBreakdown.length === 0 ? (
                  <EmptyState icon={UserCheck} title="Nenhuma venda com vendedor" description="Vendas com vendedor vinculado aparecem aqui." className="py-8" />
                ) : (
                  <div className="space-y-4">
                    {stats.sellerBreakdown.map(seller => {
                      const commission = seller.revenue * (seller.commission_pct / 100)
                      const pctOfTotal = stats.periodRevenue > 0 ? (seller.revenue / stats.periodRevenue) * 100 : 0
                      return (
                        <div key={seller.name} className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[13px] font-medium text-foreground truncate">{seller.name}</span>
                              {seller.code && (
                                <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[11px] font-mono text-muted-foreground flex-shrink-0">
                                  {seller.code}
                                </span>
                              )}
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${pctOfTotal}%` }} />
                            </div>
                            <p className="text-[12px] text-muted-foreground mt-1.5">{seller.count} pedido{seller.count !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[13px] font-semibold text-foreground tabular-nums">R$ {fmt(seller.revenue)}</p>
                            {seller.commission_pct > 0 ? (
                              <p className="text-[12px] text-muted-foreground mt-1 tabular-nums">
                                Comissão R$ {fmt(commission)}
                              </p>
                            ) : (
                              <p className="text-[12px] text-muted-foreground mt-1">Sem comissão</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>

              {/* Metas individuais */}
              {stats.sellerBreakdown.some(s => s.monthly_goal > 0) && (
                <Panel
                  title="Metas individuais"
                  actions={<span className="text-[12px] text-muted-foreground">Mês atual</span>}
                >
                  <div className="space-y-4">
                    {stats.sellerBreakdown
                      .filter(s => s.monthly_goal > 0)
                      .sort((a, b) => (b.monthRevenue / b.monthly_goal) - (a.monthRevenue / a.monthly_goal))
                      .map(seller => {
                        const pct = Math.min((seller.monthRevenue / seller.monthly_goal) * 100, 100)
                        const remaining = Math.max(seller.monthly_goal - seller.monthRevenue, 0)
                        const now = new Date()
                        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                        const daysLeft = daysInMonth - now.getDate()
                        const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : 0
                        return (
                          <div key={seller.name}>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[13px] font-medium text-foreground truncate">{seller.name}</span>
                                {seller.code && (
                                  <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[11px] font-mono text-muted-foreground shrink-0">
                                    {seller.code}
                                  </span>
                                )}
                              </div>
                              <span className={`text-[13px] font-semibold tabular-nums ${pct >= 100 ? 'text-success' : pct >= 70 ? 'text-foreground' : 'text-warning'}`}>
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct >= 100 ? 'bg-success-solid' : pct >= 70 ? 'bg-brand' : 'bg-warning-solid'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 mt-1.5 text-[12px] tabular-nums">
                              <span className="text-muted-foreground">
                                R$ {fmt(seller.monthRevenue)} de R$ {fmtCompact(seller.monthly_goal)}
                              </span>
                              {remaining > 0 ? (
                                <span className="text-muted-foreground">
                                  Faltam R$ {fmtCompact(remaining)}{daysLeft > 0 && <> · R$ {fmtCompact(dailyNeeded)}/dia</>}
                                </span>
                              ) : (
                                <span className="font-medium text-success">Meta atingida</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </Panel>
              )}

              {/* Top 5 produtos */}
              <Panel title="Top 5 produtos">
                {stats.topProducts.length === 0 ? (
                  <EmptyState icon={Package} title="Nenhuma venda no período" className="py-8" />
                ) : (
                  <div className="space-y-4">
                    {stats.topProducts.map(([name, data], i) => {
                      const maxRevenue = stats.topProducts[0]?.[1].revenue || 1
                      const pct = (data.revenue / maxRevenue) * 100
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-muted text-[11px] font-medium flex items-center justify-center text-muted-foreground tabular-nums flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-foreground truncate mb-1.5">{name}</p>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 w-24">
                            <p className="text-[13px] font-semibold text-foreground tabular-nums">R$ {fmt(data.revenue)}</p>
                            <p className="text-[12px] text-muted-foreground tabular-nums">{data.qty} un</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>

              {/* Vendas por canal */}
              <Panel title="Vendas por canal">
                {stats.originBreakdown.length === 0 ? (
                  <EmptyState icon={TrendingUp} title="Nenhuma venda no período" className="py-8" />
                ) : (
                  <div className="space-y-4">
                    {stats.originBreakdown.map(([origin, data]) => {
                      const pct = stats.periodRevenue > 0 ? (data.revenue / stats.periodRevenue) * 100 : 0
                      return (
                        <div key={origin}>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[13px] font-medium text-foreground">{originLabels[origin] || origin}</span>
                            <span className="text-[12px] text-muted-foreground tabular-nums">{pct.toFixed(0)}% · R$ {fmt(data.revenue)}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    {stats.periodCommission > 0 && (
                      <div className="pt-3 border-t border-border flex items-center justify-between">
                        <span className="text-[12px] font-medium text-muted-foreground">Comissão total</span>
                        <span className="text-[13px] font-semibold text-foreground tabular-nums">R$ {fmt(stats.periodCommission)}</span>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}
      </AdminPage>
    </AdminLayout>
  )
}
