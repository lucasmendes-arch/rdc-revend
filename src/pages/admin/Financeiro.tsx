import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown, Target, Loader,
  Clock, Package, UserCheck, ArrowUpRight, ArrowDownRight, Minus,
  Percent, Truck, Users, BarChart3, CalendarDays,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter'
import { ADMIN_DEFAULT_PERIOD_PRESETS } from '@/components/admin/ui/presets'
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard'

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
  sellers?: { name: string; code: string | null; commission_pct: number; monthly_goal: number }[] | null
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
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">--</span>
  if (previous === 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
      <ArrowUpRight className="w-3.5 h-3.5" /> novo
    </span>
  )

  const pct = ((current - previous) / previous) * 100
  const isPositive = invert ? pct < 0 : pct > 0
  const isNeutral = Math.abs(pct) < 0.5

  if (isNeutral) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Minus className="w-3.5 h-3.5" /> 0%
    </span>
  )

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
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
      const seller = o.sellers?.[0]
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
      const seller = order.sellers?.[0]
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
      const seller = order.sellers?.[0]
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
    site: 'Site', whatsapp: 'WhatsApp', loja_fisica: 'Loja Fisica',
    salao: 'Salao', outro: 'Outro',
  }

  const handlePresetClick = (preset: PeriodPreset) => {
    setActivePreset(preset)
    if (preset !== 'custom') {
      setCustomDateFrom('')
      setCustomDateTo('')
    }
  }

  return (
    <AdminLayout>
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <AdminHeader 
          title="Financeiro"
          subtitle={`${bounds.periodLabel} — comparando com ${bounds.compLabel}`}
        />
        <AdminPeriodFilter 
          presets={ADMIN_DEFAULT_PERIOD_PRESETS}
          activePreset={activePreset}
          onPresetChange={(k) => handlePresetClick(k as PeriodPreset)}
          customDateFrom={customDateFrom}
          customDateTo={customDateTo}
          onCustomDateFromChange={setCustomDateFrom}
          onCustomDateToChange={setCustomDateTo}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Carregando dados financeiros...</p>
        </div>
      ) : (
        <div className="px-3 sm:px-6 lg:px-8 py-4 lg:py-6 space-y-3 sm:space-y-4 lg:space-y-6 max-w-[1680px]">

          <div className="grid grid-cols-2 lg:grid-cols-[1fr_0.7fr_0.7fr_1fr] gap-2 sm:gap-3 lg:gap-4">

            {/* 1 — Faturamento (hero) */}
            <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-gray-900 via-[#2a1a05] to-amber-950 rounded-xl p-3 lg:p-4 shadow-lg text-white relative overflow-hidden border border-amber-900/30 flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full -translate-y-10 translate-x-10 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-amber-500/8 rounded-full translate-y-6 -translate-x-6 blur-xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <span className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-widest text-amber-300/70">Faturamento</span>
                </div>
                <p className="text-xl sm:text-2xl lg:text-2xl font-black tracking-tight">R$ {fmt(stats.periodRevenue)}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <VariationBadge current={stats.periodRevenue} previous={stats.compRevenue} />
                  <span className="text-[10px] text-white/50">vs {bounds.compLabel}</span>
                </div>
              </div>
            </div>

            {/* 2 — Pedidos Pagos (compact) */}
            <div className="bg-white rounded-xl border border-border p-3 shadow-sm h-full flex flex-col justify-between">
              <div className="flex items-center gap-1.5 mb-1">
                <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pagos</span>
              </div>
              <p className="text-lg font-black text-foreground">{stats.periodCount}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <VariationBadge current={stats.periodCount} previous={stats.compCount} />
                <span className="text-[9px] text-muted-foreground">vs {bounds.compLabel}</span>
              </div>
            </div>

            {/* 3 — Ticket Médio (compact) */}
            <div className="bg-white rounded-xl border border-border p-3 shadow-sm h-full flex flex-col justify-between">
              <div className="flex items-center gap-1.5 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ticket</span>
              </div>
              <p className="text-lg font-black text-foreground">R$ {fmt(stats.periodTicket)}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <VariationBadge current={stats.periodTicket} previous={stats.compTicket} />
                <span className="text-[9px] text-muted-foreground">vs {bounds.compLabel}</span>
              </div>
            </div>

            {/* 4 — Meta Mensal (same size as Faturamento) */}
            <div className="col-span-2 lg:col-span-1 bg-white rounded-xl border border-border p-3 lg:p-4 shadow-sm h-full flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-gold-text" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meta mensal</span>
                </div>
                {editingGoal ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
                      className="w-20 px-1.5 py-0.5 text-xs border border-border rounded focus:ring-2 focus:ring-gold"
                    />
                    <button
                      onClick={async () => {
                        const v = parseFloat(goalInput)
                        if (isNaN(v) || v <= 0) return
                        const { error } = await supabase
                          .from('store_settings').update({ monthly_revenue_goal: v }).eq('id', 1)
                        if (error) { alert('Erro: ' + error.message) } else {
                          await refetchSettings(); setEditingGoal(false)
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >OK</button>
                  </div>
                ) : (
                  <button onClick={() => { setGoalInput(String(monthlyGoal)); setEditingGoal(true) }}
                    className="text-[10px] text-gold-text font-semibold hover:underline">
                    Editar
                  </button>
                )}
              </div>

              <div className="flex items-end gap-2 mb-1">
                <span className="text-xl lg:text-2xl font-black text-foreground">{stats.goalPct.toFixed(0)}%</span>
                <span className="text-[10px] text-muted-foreground mb-0.5">de R$ {fmtCompact(monthlyGoal)}</span>
              </div>

              <div className="w-full bg-surface-alt rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    stats.goalPct >= 100
                      ? 'bg-emerald-500'
                      : stats.goalPct >= 70
                        ? 'bg-gold'
                        : 'bg-amber-400'
                  }`}
                  style={{ width: `${stats.goalPct}%` }}
                />
              </div>

              {stats.remainingGoal > 0 ? (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Faltam R$ {fmtCompact(stats.remainingGoal)} &middot; R$ {fmtCompact(stats.dailyTarget)}/dia &middot; {stats.daysRemaining}d restantes
                </p>
              ) : (
                <p className="text-[10px] font-semibold text-emerald-600 mt-1">Meta atingida!</p>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              SECTION 2 — SECONDARY MINI-CARDS
              ══════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
            <AdminSummaryCard
              icon={DollarSign} label="Hoje" iconColor="text-emerald-500"
              value={`R$ ${fmt(stats.todayRevenue)}`}
              subtitle={`${stats.todayCount} pedido${stats.todayCount !== 1 ? 's' : ''}`}
            />
            <AdminSummaryCard
              icon={CalendarDays} label="Semana" iconColor="text-blue-500"
              value={`R$ ${fmt(stats.weekRevenue)}`}
              subtitle={`${stats.weekCount} pedido${stats.weekCount !== 1 ? 's' : ''}`}
            />
            <AdminSummaryCard
              icon={Clock} label="Pendentes" iconColor="text-orange-500"
              value={`R$ ${fmt(stats.pendingTotal)}`}
              subtitle={`${stats.pendingOrders.length} pedido${stats.pendingOrders.length !== 1 ? 's' : ''}`}
            />
            <AdminSummaryCard
              icon={Percent} label="Descontos" iconColor="text-rose-500"
              value={`R$ ${fmt(stats.periodDiscount)}`}
              subtitle="no período"
            />
            <AdminSummaryCard
              icon={Truck} label="Frete" iconColor="text-sky-500"
              value={`R$ ${fmt(stats.periodShipping)}`}
              subtitle="no período"
            />
            <AdminSummaryCard
              icon={Users} label="Clientes" iconColor="text-violet-500"
              value={String(stats.periodCustomerCount)}
              subtitle={stats.compCustomerCount > 0 ? `${stats.compCustomerCount} no anterior` : undefined}
            />
          </div>

          {/* ══════════════════════════════════════════════════════
              SECTION 3 — CHART + BOTTOM BLOCKS
              ══════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">

            {/* Chart: always current month vs previous month */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-border p-4 lg:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs lg:text-sm font-bold text-foreground">
                  {stats.chartCurrentMonthName.charAt(0).toUpperCase() + stats.chartCurrentMonthName.slice(1)} vs {stats.chartPrevMonthName}
                </h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-[#d4a017] rounded-full inline-block" />
                    <span className="text-muted-foreground capitalize">{stats.chartCurrentMonthName}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-gray-300 rounded-full inline-block" style={{ borderTop: '1px dashed #d1d5db' }} />
                    <span className="text-muted-foreground capitalize">{stats.chartPrevMonthName}</span>
                  </span>
                </div>
              </div>
              {stats.chartData.length === 0 ? (
                <div className="h-40 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Sem dados no mês</p>
                </div>
              ) : (
                <div className="h-44 sm:h-48 lg:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        interval="preserveStartEnd"
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        tickFormatter={v => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `R$ ${fmt(value)}`,
                          name === 'atual' ? stats.chartCurrentMonthName : stats.chartPrevMonthName,
                        ]}
                        labelFormatter={l => `Dia ${l}`}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }}
                      />
                      <Legend content={() => null} />
                      <Line
                        type="monotone" dataKey="anterior" name="anterior"
                        stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 3"
                        dot={false} activeDot={{ r: 3, fill: '#d1d5db' }}
                      />
                      <Line
                        type="monotone" dataKey="atual" name="atual"
                        stroke="#d4a017" strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#d4a017' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Seller Breakdown */}
            <div className="bg-white rounded-xl border border-border p-4 lg:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3 lg:mb-5">
                <UserCheck className="w-4 h-4 text-gold-text" />
                <h3 className="text-sm lg:text-base font-bold text-foreground">Vendas por vendedor</h3>
              </div>
              {stats.sellerBreakdown.length === 0 ? (
                <div className="text-center py-10">
                  <UserCheck className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma venda com vendedor vinculado</p>
                </div>
              ) : (
                <div className="space-y-2.5 lg:space-y-4">
                  {stats.sellerBreakdown.map(seller => {
                    const commission = seller.revenue * (seller.commission_pct / 100)
                    const pctOfTotal = stats.periodRevenue > 0 ? (seller.revenue / stats.periodRevenue) * 100 : 0
                    return (
                      <div key={seller.name} className="flex items-start gap-3 lg:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-foreground truncate">{seller.name}</span>
                            {seller.code && (
                              <span className="px-1.5 py-0.5 rounded bg-surface-alt text-[9px] font-mono font-semibold text-muted-foreground flex-shrink-0">
                                {seller.code}
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-surface-alt rounded-full h-1.5 mb-1.5">
                            <div className="h-full rounded-full bg-gold" style={{ width: `${pctOfTotal}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{seller.count} pedido{seller.count !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-foreground">R$ {fmt(seller.revenue)}</p>
                          {seller.commission_pct > 0 ? (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-amber-50 text-[11px] font-semibold text-amber-700 border border-amber-200">
                              R$ {fmt(commission)} com.
                            </span>
                          ) : (
                            <p className="text-[10px] text-muted-foreground mt-1">s/ comissão</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Seller Monthly Goals */}
            {stats.sellerBreakdown.some(s => s.monthly_goal > 0) && (
              <div className="bg-white rounded-xl border border-border p-4 lg:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3 lg:mb-5">
                  <Target className="w-4 h-4 text-gold-text" />
                  <h3 className="text-sm lg:text-base font-bold text-foreground">Metas individuais</h3>
                  <span className="text-[10px] text-muted-foreground ml-auto">mês atual</span>
                </div>
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
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">{seller.name}</span>
                              {seller.code && (
                                <span className="px-1.5 py-0.5 rounded bg-surface-alt text-[9px] font-mono font-semibold text-muted-foreground">
                                  {seller.code}
                                </span>
                              )}
                            </div>
                            <span className={`text-xs font-black ${pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-foreground' : 'text-amber-600'}`}>
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-surface-alt rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-gold' : 'bg-amber-400'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">
                              R$ {fmt(seller.monthRevenue)} de R$ {fmtCompact(seller.monthly_goal)}
                            </span>
                            {remaining > 0 ? (
                              <span className="text-[10px] text-muted-foreground">
                                faltam R$ {fmtCompact(remaining)} {daysLeft > 0 && <>&middot; R$ {fmtCompact(dailyNeeded)}/dia</>}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-emerald-600">Meta atingida!</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Top Products */}
            <div className="bg-white rounded-xl border border-border p-4 lg:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3 lg:mb-5">
                <Package className="w-4 h-4 text-gold-text" />
                <h3 className="text-sm lg:text-base font-bold text-foreground">Top 5 produtos</h3>
              </div>
              {stats.topProducts.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma venda no período</p>
                </div>
              ) : (
                <div className="space-y-2.5 lg:space-y-4">
                  {stats.topProducts.map(([name, data], i) => {
                    const maxRevenue = stats.topProducts[0]?.[1].revenue || 1
                    const pct = (data.revenue / maxRevenue) * 100
                    return (
                      <div key={name} className="flex items-center gap-3 lg:gap-4">
                        <span className="w-5 h-5 rounded-full bg-surface-alt text-[10px] font-bold flex items-center justify-center text-muted-foreground flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate mb-1">{name}</p>
                          <div className="w-full bg-surface-alt rounded-full h-1.5">
                            <div className="h-full rounded-full bg-gold-light" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 w-24">
                          <p className="text-xs font-bold text-foreground">R$ {fmt(data.revenue)}</p>
                          <p className="text-[10px] text-muted-foreground">{data.qty} un</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pending Orders (always global) */}
            <div className="bg-white rounded-xl border border-border p-4 lg:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 lg:mb-5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm lg:text-base font-bold text-foreground">Aguardando pagamento</h3>
                </div>
                {stats.pendingOrders.length > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                    R$ {fmt(stats.pendingTotal)}
                  </span>
                )}
              </div>
              {stats.pendingOrders.length === 0 ? (
                <div className="text-center py-10">
                  <Clock className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum pedido pendente</p>
                </div>
              ) : (
                <div className="space-y-2.5 lg:space-y-3 max-h-[300px] overflow-y-auto">
                  {stats.pendingOrders.slice(0, 10).map(order => {
                    const hoursAgo = Math.round((Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60))
                    return (
                      <div key={order.id} className="flex items-center justify-between p-2.5 lg:p-3.5 bg-surface-alt rounded-lg border border-border">
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

            {/* Origin Breakdown */}
            <div className="bg-white rounded-xl border border-border p-4 lg:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3 lg:mb-5">
                <TrendingUp className="w-4 h-4 text-gold-text" />
                <h3 className="text-sm lg:text-base font-bold text-foreground">Vendas por canal</h3>
              </div>
              {stats.originBreakdown.length === 0 ? (
                <div className="text-center py-10">
                  <TrendingUp className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma venda no período</p>
                </div>
              ) : (
                <div className="space-y-2.5 lg:space-y-4">
                  {stats.originBreakdown.map(([origin, data]) => {
                    const pct = stats.periodRevenue > 0 ? (data.revenue / stats.periodRevenue) * 100 : 0
                    return (
                      <div key={origin}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground">{originLabels[origin] || origin}</span>
                          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% &middot; R$ {fmt(data.revenue)}</span>
                        </div>
                        <div className="w-full bg-surface-alt rounded-full h-1.5">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {stats.periodCommission > 0 && (
                    <div className="pt-2 mt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Comissão total</span>
                        <span className="text-xs font-bold text-amber-700">R$ {fmt(stats.periodCommission)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </AdminLayout>
  )
}
