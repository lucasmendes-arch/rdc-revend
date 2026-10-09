import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  DollarSign, Receipt, TrendingUp, Users, Scissors, Package, CalendarDays,
  UserX, Loader, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CreditCard,
  BadgePercent, Repeat,
} from 'lucide-react'

import { useAdminTheme } from '@/contexts/AdminThemeContext'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter'
import { ADMIN_DEFAULT_PERIOD_PRESETS } from '@/components/admin/ui/presets'
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard'
import StyledSelect from '@/components/ui/styled-select'

// Dados do Trinks. Fontes: relatórios exportados e importados
// (scripts/trinks-import.ts) e, daqui para frente, o webhook oficial. O sync
// automático por login (sync-trinks) está barrado pelo WAF do Trinks desde
// 30/09/2026. Ver docs/trinks-endpoints.md.

interface DailyRow {
  store_id: string
  business_date: string
  gross_revenue: number
  services_revenue: number
  products_revenue: number
  packages_revenue: number
  discounts: number
  expenses: number
  tickets_count: number
  new_customers: number
  appointments_total: number
  appointments_done: number
  no_shows: number
  cancellations: number
}

interface FreshnessRow {
  store_id: string
  last_revenue_day: string | null
  imported_through: string | null
  last_import_at: string | null
  last_webhook_at: string | null
}

interface Breakdown {
  coverage: { transactions: number; first_day: string | null; last_day: string | null }
  payments: { credit: number; debit: number; cash: number; prepaid: number; other: number; tips: number }
  discounts: { reason: string; uses: number; total: number }[]
  clients: { unique: number; first_time: number; returning: number }
}

/** PostgREST corta em 1000 linhas: pagina até trazer tudo. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) return all
  }
}

const fmtDay = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—')

interface ItemRow {
  store_id: string
  business_date: string
  name: string
  qty: number
  revenue: number
}

interface ProfessionalRow {
  store_id: string
  business_date: string
  professional_name: string
  services_count: number
  visits_count: number
  revenue: number
  commission: number
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtBRLCents = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Período exibido e período de comparação.
 *
 * A comparação depende do tipo de período — antes era sempre "os N dias
 * imediatamente antes", e "este mês" (01–08/10) virava 23–30/09, uma semana
 * de fim de mês: a tela mostrava queda num mês que estava 27% acima.
 *   • mês (este/passado): mesmos dias do mês anterior (01–08/10 × 01–08/09)
 *   • hoje/ontem: mesmo dia da semana passada (salão tem padrão semanal)
 *   • demais: mesmo nº de dias imediatamente antes
 *
 * `dataThrough` = último dia com faturamento: a comparação para nele, para
 * um dia ainda sem fechamento não ser comparado com um dia cheio.
 */
function computeBounds(preset: string, customFrom: string, customTo: string, dataThrough: string | null) {
  const now = new Date()
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)

  let start = sod(now)
  let end = sod(now)

  switch (preset) {
    case 'today': break
    case 'yesterday': start = shift(start, -1); end = start; break
    case 'week': start = shift(start, -6); break
    case 'month': start = new Date(now.getFullYear(), now.getMonth(), 1); break
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case '3months': start = shift(start, -89); break
    case '6months': start = shift(start, -179); break
    case 'custom':
      if (customFrom) start = new Date(`${customFrom}T12:00:00`)
      if (customTo) end = new Date(`${customTo}T12:00:00`)
      break
  }

  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  // Fim efetivo da comparação: não passa do último dia com dado.
  let cmpEnd = end
  if (dataThrough) {
    const dt = sod(new Date(`${dataThrough}T12:00:00`))
    if (dt < cmpEnd && dt >= start) cmpEnd = dt
  }

  let prevStart: Date
  let prevEnd: Date
  let compareLabel: string
  if (preset === 'month' || preset === 'last_month') {
    const y = start.getFullYear()
    const m = start.getMonth()
    const daysInPrev = new Date(y, m, 0).getDate()
    const fullMonth = cmpEnd.getDate() === new Date(y, m + 1, 0).getDate()
    prevStart = new Date(y, m - 1, 1)
    // Mês inteiro × mês anterior inteiro (fev completo × jan completo);
    // mês em andamento × os mesmos dias do mês anterior.
    prevEnd = new Date(y, m - 1, fullMonth ? daysInPrev : Math.min(cmpEnd.getDate(), daysInPrev))
    compareLabel = fullMonth
      ? 'vs. mês anterior'
      : `vs. 01–${String(prevEnd.getDate()).padStart(2, '0')} do mês anterior`
  } else if (preset === 'today' || preset === 'yesterday') {
    prevStart = shift(start, -7)
    prevEnd = shift(cmpEnd, -7)
    compareLabel = 'vs. mesmo dia da semana passada'
  } else {
    const cmpDays = Math.round((cmpEnd.getTime() - start.getTime()) / 86400000) + 1
    prevEnd = shift(start, -1)
    prevStart = shift(prevEnd, -(cmpDays - 1))
    compareLabel = `vs. ${cmpDays} dias anteriores`
  }

  return {
    from: toISO(start), to: toISO(end),
    // Fim do período atual usado na comparação (≤ to).
    compareTo: toISO(cmpEnd),
    prevFrom: toISO(prevStart), prevTo: toISO(prevEnd),
    compareLabel,
    days,
  }
}

function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) return <span className="text-muted-foreground">sem base para comparar</span>
  const pct = ((current - previous) / previous) * 100
  const flat = Math.abs(pct) < 0.5
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  const color = flat ? 'text-muted-foreground' : pct > 0 ? 'text-success' : 'text-danger'
  return (
    <span className={`inline-flex items-center gap-0.5 ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(pct).toFixed(1)}% {label}
    </span>
  )
}

export default function Unidades() {
  const { isDark } = useAdminTheme()

  const ch = {
    grid: isDark ? 'hsl(279,18%,19%)' : '#F1EDF5',
    axis: isDark ? 'hsl(279,18%,22%)' : '#E8E3ED',
    tick: isDark ? '#64748b' : '#9ca3af',
    prevLine: isDark ? 'hsl(278,14%,34%)' : '#D2CCD8',
    tooltipBg: isDark ? 'hsl(280,21%,14%)' : '#ffffff',
    tooltipBorder: isDark ? 'hsl(279,18%,22%)' : '#E8E3ED',
    tooltipText: isDark ? 'hsl(214,18%,88%)' : '#111827',
  }

  const [activePreset, setActivePreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [storeFilter, setStoreFilter] = useState('all')

  // Até quando cada unidade tem dado. A fonte agora é a importação dos
  // relatórios + webhook (o sync automático morreu no WAF do Trinks), então
  // "última execução" deixou de significar algo: o que importa é a cobertura.
  // Vem antes de `bounds`: a comparação com o período anterior para no
  // último dia com dado.
  const { data: freshness = [] } = useQuery({
    queryKey: ['trinks-freshness'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trinks_data_freshness').select('*')
      if (error) throw error
      return data as FreshnessRow[]
    },
    refetchInterval: 5 * 60 * 1000,
  })

  const dataThrough = useMemo(() => {
    const days = freshness
      .filter(f => storeFilter === 'all' || f.store_id === storeFilter)
      .map(f => f.last_revenue_day)
      .filter(Boolean) as string[]
    return days.length ? days.reduce((a, b) => (a > b ? a : b)) : null
  }, [freshness, storeFilter])

  const bounds = useMemo(
    () => computeBounds(activePreset, customFrom, customTo, dataThrough),
    [activePreset, customFrom, customTo, dataThrough],
  )

  const { data: units = [] } = useQuery({
    queryKey: ['trinks-units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_units')
        .select('store_id, display_name, stores(name, slug)')
        .eq('active', true)
      if (error) throw error
      return data as unknown as { store_id: string; display_name: string; stores: { name: string } | null }[]
    },
  })

  const unitName = useMemo(() => {
    const map: Record<string, string> = {}
    for (const u of units) map[u.store_id] = u.stores?.name ?? u.display_name
    return map
  }, [units])

  // Uma consulta cobre período atual + anterior: o range vai de prevFrom a to.
  const { data: daily = [], isLoading } = useQuery({
    queryKey: ['trinks-daily', bounds.prevFrom, bounds.to],
    queryFn: () => fetchAll<DailyRow>((from, to) => supabase
      .from('trinks_daily_revenue')
      .select('*')
      .gte('business_date', bounds.prevFrom)
      .lte('business_date', bounds.to)
      .order('business_date')
      .order('store_id')
      .range(from, to)),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['trinks-services', bounds.from, bounds.to],
    queryFn: () => fetchAll<ItemRow>((from, to) => supabase
      .from('trinks_service_sales')
      .select('store_id, business_date, name, qty, revenue')
      .gte('business_date', bounds.from)
      .lte('business_date', bounds.to)
      .order('id')
      .range(from, to)),
  })

  const { data: products = [] } = useQuery({
    queryKey: ['trinks-products', bounds.from, bounds.to],
    queryFn: () => fetchAll<ItemRow>((from, to) => supabase
      .from('trinks_product_sales')
      .select('store_id, business_date, name, qty, revenue')
      .gte('business_date', bounds.from)
      .lte('business_date', bounds.to)
      .order('id')
      .range(from, to)),
  })

  const { data: professionals = [] } = useQuery({
    queryKey: ['trinks-professionals', bounds.from, bounds.to],
    queryFn: () => fetchAll<ProfessionalRow>((from, to) => supabase
      .from('trinks_professional_sales')
      .select('store_id, business_date, professional_name, services_count, visits_count, revenue, commission')
      .gte('business_date', bounds.from)
      .lte('business_date', bounds.to)
      .order('id')
      .range(from, to)),
  })

  // Formas de pagamento, descontos e recorrência — calculados no banco a
  // partir dos fechamentos importados (get_trinks_breakdown).
  const { data: breakdown } = useQuery({
    queryKey: ['trinks-breakdown', bounds.from, bounds.to, storeFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_trinks_breakdown', {
        p_from: bounds.from,
        p_to: bounds.to,
        p_store_id: storeFilter === 'all' ? null : storeFilter,
      })
      if (error) throw error
      return data as Breakdown
    },
  })

  const inStore = <T extends { store_id: string }>(rows: T[]) =>
    storeFilter === 'all' ? rows : rows.filter(r => r.store_id === storeFilter)

  const current = useMemo(
    () => inStore(daily).filter(d => d.business_date >= bounds.from && d.business_date <= bounds.to),
    [daily, bounds, storeFilter],
  )
  const previous = useMemo(
    () => inStore(daily).filter(d => d.business_date >= bounds.prevFrom && d.business_date <= bounds.prevTo),
    [daily, bounds, storeFilter],
  )

  const sum = (rows: DailyRow[], key: keyof DailyRow) =>
    rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)

  const gross = sum(current, 'gross_revenue')
  const tickets = sum(current, 'tickets_count')
  const avgTicket = tickets ? gross / tickets : 0

  // Lado atual da comparação: só até o último dia com dado (compareTo), para
  // casar dia a dia com o período anterior.
  const currentCmp = current.filter(d => d.business_date <= bounds.compareTo)
  const cmpGross = sum(currentCmp, 'gross_revenue')
  const cmpTickets = sum(currentCmp, 'tickets_count')
  const cmpAvgTicket = cmpTickets ? cmpGross / cmpTickets : 0
  const prevGross = sum(previous, 'gross_revenue')
  const prevTickets = sum(previous, 'tickets_count')
  const prevAvgTicket = prevTickets ? prevGross / prevTickets : 0

  const chartData = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const d of current) {
      byDate.set(d.business_date, (byDate.get(d.business_date) ?? 0) + Number(d.gross_revenue))
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        Faturamento: Math.round(value * 100) / 100,
      }))
  }, [current])

  const rank = (rows: ItemRow[]) => {
    const byName = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const r of inStore(rows)) {
      const e = byName.get(r.name) ?? { name: r.name, qty: 0, revenue: 0 }
      e.qty += Number(r.qty)
      e.revenue += Number(r.revenue)
      byName.set(r.name, e)
    }
    return [...byName.values()].sort((a, b) => b.revenue - a.revenue)
  }

  const topServices = useMemo(() => rank(services).slice(0, 8), [services, storeFilter])
  const topProducts = useMemo(() => rank(products).slice(0, 8), [products, storeFilter])

  const profRanking = useMemo(() => {
    // Mesma régua do "Ranking de Profissionais" do Trinks: atendimentos =
    // cliente distinto por dia; ticket = faturamento líquido ÷ atendimentos.
    const byName = new Map<string, { name: string; count: number; services: number; revenue: number; commission: number }>()
    for (const p of inStore(professionals)) {
      const e = byName.get(p.professional_name)
        ?? { name: p.professional_name, count: 0, services: 0, revenue: 0, commission: 0 }
      e.count += Number(p.visits_count)
      e.services += Number(p.services_count)
      e.revenue += Number(p.revenue)
      e.commission += Number(p.commission)
      byName.set(p.professional_name, e)
    }
    return [...byName.values()].sort((a, b) => b.revenue - a.revenue)
  }, [professionals, storeFilter])

  const servicesTotal = sum(current, 'services_revenue')
  const productsTotal = sum(current, 'products_revenue')
  const splitTotal = servicesTotal + productsTotal

  // Cobertura: uma unidade está "atrasada" no período quando o último dia com
  // faturamento é anterior ao fim do período (ou a ontem, se o período chega
  // até hoje — o dia corrente ainda pode não ter fechamento). Sem isso, um mês
  // sem dados aparece como R$ 0, como se fosse faturamento real.
  const freshByStore = useMemo(() => {
    const map: Record<string, FreshnessRow> = {}
    for (const f of freshness) map[f.store_id] = f
    return map
  }, [freshness])

  const yesterday = toISO(new Date(Date.now() - 86400000))
  const expectedThrough = bounds.to < yesterday ? bounds.to : yesterday
  const scopeUnits = storeFilter === 'all' ? units : units.filter(u => u.store_id === storeFilter)
  const lagging = scopeUnits
    .map(u => ({ name: unitName[u.store_id] ?? u.display_name, last: freshByStore[u.store_id]?.last_revenue_day ?? null }))
    .filter(u => !u.last || u.last < expectedThrough)

  const coverageLabel = (() => {
    const days = scopeUnits.map(u => freshByStore[u.store_id]?.last_revenue_day).filter(Boolean) as string[]
    if (!days.length) return 'sem dados'
    const max = days.reduce((a, b) => (a > b ? a : b))
    const min = days.reduce((a, b) => (a < b ? a : b))
    return min === max ? `dados até ${fmtDay(max)}` : `dados até ${fmtDay(min)}–${fmtDay(max)} (varia por unidade)`
  })()

  return (
    <AdminLayout>
      <AdminHeader
        title="Unidades"
        subtitle={
          <span className={`inline-flex items-center gap-1.5 ${lagging.length ? 'text-danger' : ''}`}>
            {lagging.length > 0 && <AlertTriangle className="w-3 h-3" />}
            Dados do Trinks · {coverageLabel}
          </span>
        }
        actionNode={
          <StyledSelect
            variant="inline"
            value={storeFilter}
            onChange={setStoreFilter}
            options={[
              { value: 'all', label: 'Todas as unidades' },
              ...units.map(u => ({ value: u.store_id, label: u.stores?.name ?? u.display_name })),
            ]}
          />
        }
      />

      <AdminPeriodFilter
        presets={ADMIN_DEFAULT_PERIOD_PRESETS}
        activePreset={activePreset}
        onPresetChange={setActivePreset}
        customDateFrom={customFrom}
        customDateTo={customTo}
        onCustomDateFromChange={setCustomFrom}
        onCustomDateToChange={setCustomTo}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-10 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader className="w-5 h-5 animate-spin mr-2" /> Carregando dados das unidades…
          </div>
        ) : (
          <>
            {lagging.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-subtle px-4 py-3 text-xs text-foreground">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Período incompleto.</span>{' '}
                  Os totais abaixo não incluem dias sem dados de:{' '}
                  {lagging.map((u, i) => (
                    <span key={u.name}>
                      {i > 0 && ', '}
                      <span className="font-medium">{u.name}</span>
                      <span className="text-muted-foreground"> (até {fmtDay(u.last)})</span>
                    </span>
                  ))}
                  . Importe os relatórios do Trinks dessas unidades para completar.
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <AdminSummaryCard
                icon={DollarSign} iconColor="text-gold"
                label="Faturamento" value={fmtBRL(gross)}
                subtitle={<Delta current={cmpGross} previous={prevGross} label={bounds.compareLabel} />}
              />
              <AdminSummaryCard
                icon={Receipt} label="Comandas" value={tickets.toLocaleString('pt-BR')}
                subtitle={<Delta current={cmpTickets} previous={prevTickets} label={bounds.compareLabel} />}
              />
              <AdminSummaryCard
                icon={TrendingUp} label="Ticket médio" value={fmtBRLCents(avgTicket)}
                subtitle={<Delta current={cmpAvgTicket} previous={prevAvgTicket} label={bounds.compareLabel} />}
              />
              <AdminSummaryCard
                icon={Users} label="Clientes novos"
                value={sum(current, 'new_customers').toLocaleString('pt-BR')}
                subtitle={<Delta current={sum(currentCmp, 'new_customers')} previous={sum(previous, 'new_customers')} label={bounds.compareLabel} />}
              />
            </div>

            {/* Faturamento por dia */}
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground mb-3">Faturamento por dia</h2>
              {chartData.length === 0 ? (
                <p className="text-xs text-muted-foreground py-10 text-center">
                  Nenhum dado sincronizado neste período.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} />
                    <XAxis dataKey="date" stroke={ch.axis} tick={{ fill: ch.tick, fontSize: 11 }} />
                    <YAxis
                      stroke={ch.axis} tick={{ fill: ch.tick, fontSize: 11 }}
                      tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: ch.tooltipBg,
                        border: `1px solid ${ch.tooltipBorder}`,
                        borderRadius: 8,
                        color: ch.tooltipText,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => fmtBRLCents(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone" dataKey="Faturamento"
                      stroke="#FF9A1A" strokeWidth={2} dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Serviços x Produtos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground mb-3">Serviços × Produtos</h2>
                {splitTotal === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem receita no período.</p>
                ) : (
                  <>
                    <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
                      <div className="bg-gold" style={{ width: `${(servicesTotal / splitTotal) * 100}%` }} />
                      <div className="bg-ink-400" style={{ width: `${(productsTotal / splitTotal) * 100}%` }} />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Scissors className="w-3.5 h-3.5" /> Serviços
                        </span>
                        <span className="font-semibold text-foreground">
                          {fmtBRLCents(servicesTotal)} ({((servicesTotal / splitTotal) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Package className="w-3.5 h-3.5" /> Produtos
                        </span>
                        <span className="font-semibold text-foreground">
                          {fmtBRLCents(productsTotal)} ({((productsTotal / splitTotal) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground inline-flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" /> Agendamentos
                    </div>
                    <div className="font-semibold text-foreground mt-0.5">
                      {sum(current, 'appointments_total').toLocaleString('pt-BR')}
                      <span className="text-muted-foreground font-normal">
                        {' '}· {sum(current, 'appointments_done').toLocaleString('pt-BR')} realizados
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground inline-flex items-center gap-1.5">
                      <UserX className="w-3.5 h-3.5" /> Faltas / cancelamentos
                    </div>
                    <div className="font-semibold text-foreground mt-0.5">
                      {sum(current, 'no_shows').toLocaleString('pt-BR')} · {sum(current, 'cancellations').toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              </div>

              <RankCard title="Top serviços" icon={Scissors} rows={topServices} />
              <RankCard title="Top produtos" icon={Package} rows={topProducts} />
            </div>

            {/* Fechamentos: pagamento, descontos, recorrência */}
            {breakdown && breakdown.coverage.transactions > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <PaymentsCard payments={breakdown.payments} />
                  <DiscountsCard discounts={breakdown.discounts} />
                  <ClientsCard clients={breakdown.clients} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Base: {breakdown.coverage.transactions.toLocaleString('pt-BR')} fechamentos importados
                  ({fmtDay(breakdown.coverage.first_day)} a {fmtDay(breakdown.coverage.last_day)}).
                  {' '}Unidades sem relatório importado não entram nestes três quadros.
                </p>
              </div>
            )}

            {/* Profissionais */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <h2 className="text-sm font-semibold text-foreground px-4 py-3 border-b border-border">
                Produção por profissional
              </h2>
              {profRanking.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4">
                  Sem dados de produção por profissional no período — vem do relatório de Comissões do Trinks.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left font-medium px-4 py-2">Profissional</th>
                        <th className="text-right font-medium px-4 py-2">Atendimentos</th>
                        <th className="text-right font-medium px-4 py-2">Serviços</th>
                        <th className="text-right font-medium px-4 py-2">Faturamento</th>
                        <th className="text-right font-medium px-4 py-2">Ticket médio</th>
                        <th className="text-right font-medium px-4 py-2">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profRanking.map(p => (
                        <tr key={p.name} className="border-b border-border last:border-0">
                          {/* O Trinks prefixa a ordem da agenda no nome ("2 Yasmin"). */}
                          <td className="px-4 py-2 text-foreground font-medium">{p.name.replace(/^\d+\s+/, '')}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{p.count}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{p.services}</td>
                          <td className="px-4 py-2 text-right text-foreground font-semibold">{fmtBRLCents(p.revenue)}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {p.count ? fmtBRLCents(p.revenue / p.count) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{fmtBRLCents(p.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Comparativo entre unidades */}
            {storeFilter === 'all' && (
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <h2 className="text-sm font-semibold text-foreground px-4 py-3 border-b border-border">
                  Comparativo entre unidades
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left font-medium px-4 py-2">Unidade</th>
                        <th className="text-right font-medium px-4 py-2">Faturamento</th>
                        <th className="text-right font-medium px-4 py-2">Comandas</th>
                        <th className="text-right font-medium px-4 py-2">Ticket médio</th>
                        <th className="text-right font-medium px-4 py-2">Clientes novos</th>
                        <th className="text-right font-medium px-4 py-2">Dados até</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map(u => {
                        const rows = current.filter(d => d.store_id === u.store_id)
                        const g = sum(rows, 'gross_revenue')
                        const t = sum(rows, 'tickets_count')
                        return (
                          <tr key={u.store_id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2 text-foreground font-medium">
                              {unitName[u.store_id] ?? u.display_name}
                            </td>
                            <td className="px-4 py-2 text-right text-foreground font-semibold">{fmtBRLCents(g)}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground">{t}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {t ? fmtBRLCents(g / t) : '—'}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">
                              {sum(rows, 'new_customers')}
                            </td>
                            <td className={`px-4 py-2 text-right ${lagging.some(l => l.name === (unitName[u.store_id] ?? u.display_name)) ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
                              {fmtDay(freshByStore[u.store_id]?.last_revenue_day ?? null)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}

function RankCard({
  title, icon: Icon, rows,
}: {
  title: string
  icon: React.ElementType
  rows: { name: string; qty: number; revenue: number }[]
}) {
  const max = rows[0]?.revenue ?? 0
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3 inline-flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-muted-foreground" /> {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-2 text-xs mb-0.5">
                <span className="text-foreground line-clamp-1">{r.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {r.qty.toLocaleString('pt-BR')}× · <span className="font-semibold text-foreground">{fmtBRL(r.revenue)}</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gold" style={{ width: `${max ? (r.revenue / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PaymentsCard({ payments }: { payments: Breakdown['payments'] }) {
  // No Trinks, "Outros" é onde cai o PIX na rede.
  const rows = [
    { label: 'Crédito', value: Number(payments.credit) },
    { label: 'PIX / Outros', value: Number(payments.other) },
    { label: 'Dinheiro', value: Number(payments.cash) },
    { label: 'Débito', value: Number(payments.debit) },
    { label: 'Pré-pago', value: Number(payments.prepaid) },
  ].filter(r => r.value > 0).sort((a, b) => b.value - a.value)
  const total = rows.reduce((a, r) => a + r.value, 0)
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3 inline-flex items-center gap-1.5">
        <CreditCard className="w-4 h-4 text-muted-foreground" /> Formas de pagamento
      </h2>
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-2 text-xs mb-0.5">
              <span className="text-foreground">{r.label}</span>
              <span className="text-muted-foreground shrink-0">
                {total ? ((r.value / total) * 100).toFixed(0) : 0}% · <span className="font-semibold text-foreground">{fmtBRL(r.value)}</span>
              </span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gold" style={{ width: `${total ? (r.value / total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {Number(payments.tips) > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3">Gorjetas: {fmtBRLCents(Number(payments.tips))}</p>
      )}
    </div>
  )
}

function DiscountsCard({ discounts }: { discounts: Breakdown['discounts'] }) {
  const total = discounts.reduce((a, d) => a + Number(d.total), 0)
  const uses = discounts.reduce((a, d) => a + Number(d.uses), 0)
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-1 inline-flex items-center gap-1.5">
        <BadgePercent className="w-4 h-4 text-muted-foreground" /> Descontos concedidos
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        <span className="font-semibold text-foreground">{fmtBRL(total)}</span> em {uses.toLocaleString('pt-BR')} comandas
      </p>
      {discounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum desconto no período.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {discounts.slice(0, 6).map(d => (
            <li key={d.reason} className="flex items-baseline justify-between gap-2">
              <span className="text-foreground line-clamp-1">{d.reason}</span>
              <span className="text-muted-foreground shrink-0">
                {Number(d.uses)}× · <span className="font-semibold text-foreground">{fmtBRL(Number(d.total))}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ClientsCard({ clients }: { clients: Breakdown['clients'] }) {
  const unique = Number(clients.unique)
  const returning = Number(clients.returning)
  const firstTime = Number(clients.first_time)
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3 inline-flex items-center gap-1.5">
        <Repeat className="w-4 h-4 text-muted-foreground" /> Clientes atendidos
      </h2>
      <div className="text-2xl font-bold text-foreground leading-none">{unique.toLocaleString('pt-BR')}</div>
      <p className="text-[11px] text-muted-foreground mt-1">clientes diferentes com comanda paga</p>
      {unique > 0 && (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden mt-3 mb-2">
            <div className="bg-gold" style={{ width: `${(returning / unique) * 100}%` }} />
            <div className="bg-ink-400" style={{ width: `${(firstTime / unique) * 100}%` }} />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Voltaram (já tinham comprado)</span>
              <span className="font-semibold text-foreground">{returning} ({((returning / unique) * 100).toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Primeira compra</span>
              <span className="font-semibold text-foreground">{firstTime} ({((firstTime / unique) * 100).toFixed(0)}%)</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
