import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  DollarSign, Receipt, TrendingUp, Users, Scissors, Package, CalendarDays,
  UserX, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CreditCard,
  BadgePercent, Repeat, CalendarX,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, Toolbar, Panel, StatCard, StatGrid, PageLoading } from '@/components/admin/ui/AdminPage'
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter'
import { ADMIN_DEFAULT_PERIOD_PRESETS } from '@/components/admin/ui/presets'
import StyledSelect from '@/components/ui/styled-select'

// Cores do gráfico vêm dos tokens (trocam sozinhas no dark mode).
const CHART = {
  line: 'hsl(var(--brand))',
  grid: 'hsl(var(--border))',
  tick: 'hsl(var(--muted-foreground))',
  cursor: 'hsl(var(--ink-300))',
}

const CARD = 'rounded-lg border border-border bg-card p-4 sm:p-5 shadow-xs'
const CARD_TITLE = 'text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-1.5'

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
  services_revenue: number
  products_revenue: number
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

function Delta({ current, previous, label }: { current: number; previous: number; label?: string }) {
  if (!previous) return <span className="text-muted-foreground">Sem base para comparar</span>
  const pct = ((current - previous) / previous) * 100
  const flat = Math.abs(pct) < 0.5
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  const color = flat ? 'text-muted-foreground' : pct > 0 ? 'text-success' : 'text-danger'
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(pct).toFixed(1)}%{label ? ` ${label}` : ''}
    </span>
  )
}

export default function Unidades() {
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
      .select('store_id, business_date, professional_name, services_count, visits_count, revenue, services_revenue, products_revenue, commission')
      .gte('business_date', bounds.from)
      .lte('business_date', bounds.to)
      .order('id')
      .range(from, to)),
  })

  // Comissão estimada: o webhook do Trinks não traz comissão, então os itens
  // dele recebem o percentual do histórico (trinks_commission_pct_guess). Só
  // valem nos dias DEPOIS do último relatório CSV de Comissões da unidade —
  // antes disso o CSV manda e o valor é o real.
  const { data: estimatedDays = [] } = useQuery({
    queryKey: ['trinks-commission-estimated', bounds.from, bounds.to],
    queryFn: async () => {
      const [{ data: items }, { data: imports }] = await Promise.all([
        supabase.from('trinks_sale_items')
          .select('store_id, business_date')
          .eq('source', 'webhook').eq('commission_estimated', true)
          .gte('business_date', bounds.from).lte('business_date', bounds.to),
        supabase.from('trinks_imports')
          .select('store_id, period_end')
          .eq('report_type', 'comissoes'),
      ])
      const coveredThrough = new Map<string, string>()
      for (const i of imports ?? []) {
        const prev = coveredThrough.get(i.store_id)
        if (!prev || i.period_end > prev) coveredThrough.set(i.store_id, i.period_end)
      }
      return (items ?? []).filter(i => i.business_date > (coveredThrough.get(i.store_id) ?? ''))
    },
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

  const estimatedRange = useMemo(() => {
    const days = inStore(estimatedDays).map(d => d.business_date).sort()
    return days.length ? { from: days[0], to: days[days.length - 1] } : null
  }, [estimatedDays, storeFilter])

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
    // Faturamento = serviços (inclui pacotes) + venda de produtos.
    const byName = new Map<string, {
      name: string; count: number; services: number
      revenue: number; servicesRevenue: number; productsRevenue: number; commission: number
    }>()
    for (const p of inStore(professionals)) {
      const e = byName.get(p.professional_name)
        ?? { name: p.professional_name, count: 0, services: 0, revenue: 0, servicesRevenue: 0, productsRevenue: 0, commission: 0 }
      e.count += Number(p.visits_count)
      e.services += Number(p.services_count)
      e.revenue += Number(p.revenue)
      e.servicesRevenue += Number(p.services_revenue)
      e.productsRevenue += Number(p.products_revenue)
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
      <AdminPage
        title="Unidades"
        description={
          <span className={`inline-flex items-center gap-1.5 ${lagging.length ? 'text-danger' : ''}`}>
            {lagging.length > 0 && <AlertTriangle className="w-3 h-3" />}
            Dados do Trinks · {coverageLabel}
          </span>
        }
        toolbar={
          <Toolbar className="justify-between">
            <AdminPeriodFilter
              presets={ADMIN_DEFAULT_PERIOD_PRESETS}
              activePreset={activePreset}
              onPresetChange={setActivePreset}
              customDateFrom={customFrom}
              customDateTo={customTo}
              onCustomDateFromChange={setCustomFrom}
              onCustomDateToChange={setCustomTo}
              className="w-full sm:w-auto min-w-0"
            />
            <StyledSelect
              variant="inline"
              value={storeFilter}
              onChange={setStoreFilter}
              options={[
                { value: 'all', label: 'Todas as unidades' },
                ...units.map(u => ({ value: u.store_id, label: u.stores?.name ?? u.display_name })),
              ]}
              className="bg-card text-[13px]"
            />
          </Toolbar>
        }
      >
      <div className="space-y-4">
        {isLoading ? (
          <PageLoading label="Carregando dados das unidades…" />
        ) : (
          <>
            {lagging.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-[13px] text-foreground">
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
            <div className="space-y-2">
              <StatGrid>
                <StatCard
                  icon={DollarSign} tone="brand"
                  label="Faturamento" value={fmtBRL(gross)}
                  hint={<Delta current={cmpGross} previous={prevGross} />}
                />
                <StatCard
                  icon={Receipt} label="Comandas" value={tickets.toLocaleString('pt-BR')}
                  hint={<Delta current={cmpTickets} previous={prevTickets} />}
                />
                <StatCard
                  icon={TrendingUp} label="Ticket médio" value={fmtBRLCents(avgTicket)}
                  hint={<Delta current={cmpAvgTicket} previous={prevAvgTicket} />}
                />
                <StatCard
                  icon={Users} label="Cadastros novos"
                  value={sum(current, 'new_customers').toLocaleString('pt-BR')}
                  hint={<Delta current={sum(currentCmp, 'new_customers')} previous={sum(previous, 'new_customers')} />}
                />
              </StatGrid>
              <p className="text-[12px] text-muted-foreground">Variações {bounds.compareLabel}.</p>
            </div>

            {/* Faturamento por dia */}
            <Panel title="Faturamento por dia">
              {chartData.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-10 text-center">
                  Nenhum dado importado neste período.
                </p>
              ) : (
                <div className="h-56 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis
                        dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }}
                        axisLine={{ stroke: CHART.grid }} tickLine={false} interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: CHART.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      />
                      <Tooltip
                        cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          boxShadow: 'var(--shadow-md)',
                          color: 'hsl(var(--popover-foreground))',
                          fontSize: 12,
                          padding: '8px 10px',
                        }}
                        labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}
                        itemStyle={{ color: 'hsl(var(--foreground))', padding: 0, fontVariantNumeric: 'tabular-nums' }}
                        formatter={(v: number) => fmtBRLCents(v)}
                      />
                      <Line
                        type="monotone" dataKey="Faturamento"
                        stroke={CHART.line} strokeWidth={2} dot={false}
                        activeDot={{ r: 4, fill: CHART.line, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            {/* Clientes atendidos + rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <ClientsCard
                clients={breakdown?.coverage && breakdown.coverage.transactions > 0 ? breakdown.clients : null}
                appointments={{
                  total: sum(current, 'appointments_total'),
                  done: sum(current, 'appointments_done'),
                  noShows: sum(current, 'no_shows'),
                  cancellations: sum(current, 'cancellations'),
                }}
              />
              <RankCard title="Top serviços" icon={Scissors} rows={topServices} />
              <RankCard title="Top produtos" icon={Package} rows={topProducts} />
            </div>

            {/* Fechamentos: pagamento, descontos + Serviços x Produtos */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {breakdown?.coverage && breakdown.coverage.transactions > 0 && (
                  <>
                    <PaymentsCard payments={breakdown.payments} />
                    <DiscountsCard discounts={breakdown.discounts} />
                  </>
                )}
                <div className={CARD}>
                  <h2 className={`${CARD_TITLE} mb-3`}>Serviços × Produtos</h2>
                  {splitTotal === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Sem receita no período.</p>
                  ) : (
                    <>
                      <div className="flex h-2 gap-0.5 rounded-full overflow-hidden mb-3">
                        <div className="bg-brand" style={{ width: `${(servicesTotal / splitTotal) * 100}%` }} />
                        <div className="bg-ink-400" style={{ width: `${(productsTotal / splitTotal) * 100}%` }} />
                      </div>
                      <div className="space-y-1.5 text-[13px]">
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
                </div>
              </div>
              {breakdown?.coverage && breakdown.coverage.transactions > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  Pagamentos, descontos e clientes atendidos: base de {breakdown.coverage.transactions.toLocaleString('pt-BR')} fechamentos importados
                  ({fmtDay(breakdown.coverage.first_day)} a {fmtDay(breakdown.coverage.last_day)}).
                  {' '}Unidades sem relatório importado não entram nesses quadros.
                </p>
              )}
            </div>

            {/* Profissionais */}
            <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
              <h2 className="text-[14px] font-semibold text-foreground tracking-tight px-4 sm:px-5 h-12 flex items-center border-b border-border">
                Produção por profissional
              </h2>
              {profRanking.length === 0 ? (
                <p className="text-[13px] text-muted-foreground p-4 sm:p-5">
                  Sem dados de produção por profissional no período — vem do relatório de Comissões do Trinks.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[820px]">
                    <thead>
                      <tr>
                        <th>Profissional</th>
                        <th className="text-right">Atendimentos</th>
                        <th className="text-right">Serviços</th>
                        <th className="text-right">Fat. serviços</th>
                        <th className="text-right">Venda produtos</th>
                        <th className="text-right">Faturamento</th>
                        <th className="text-right">Ticket médio</th>
                        <th className="text-right">Comissão{estimatedRange ? '*' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profRanking.map(p => (
                        <tr key={p.name}>
                          {/* O Trinks prefixa a ordem da agenda no nome ("2 Yasmin"). */}
                          <td className="text-foreground font-medium">{p.name.replace(/^\d+\s+/, '')}</td>
                          <td className="text-right text-muted-foreground">{p.count}</td>
                          <td className="text-right text-muted-foreground">{p.services}</td>
                          <td className="text-right text-foreground">{fmtBRLCents(p.servicesRevenue)}</td>
                          <td className="text-right text-foreground">
                            {p.productsRevenue ? fmtBRLCents(p.productsRevenue) : '—'}
                          </td>
                          <td className="text-right text-foreground font-semibold">{fmtBRLCents(p.revenue)}</td>
                          <td className="text-right text-muted-foreground">
                            {p.count ? fmtBRLCents(p.revenue / p.count) : '—'}
                          </td>
                          <td className="text-right text-muted-foreground">{fmtBRLCents(p.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {profRanking.length > 0 && estimatedRange && (
                <p className="text-[12px] text-muted-foreground px-4 sm:px-5 py-3 border-t border-border">
                  * Comissão {estimatedRange.from === estimatedRange.to
                    ? `de ${fmtDay(estimatedRange.from)}`
                    : `de ${fmtDay(estimatedRange.from)} a ${fmtDay(estimatedRange.to)}`} é estimada:
                  o Trinks não envia comissão em tempo real. Usa o percentual que cada profissional recebeu
                  no mesmo serviço; vira o valor exato quando o relatório de Comissões do período é importado.
                </p>
              )}
            </div>

            {/* Comparativo entre unidades */}
            {storeFilter === 'all' && (
              <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
                <h2 className="text-[14px] font-semibold text-foreground tracking-tight px-4 sm:px-5 h-12 flex items-center border-b border-border">
                  Comparativo entre unidades
                </h2>
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[600px]">
                    <thead>
                      <tr>
                        <th>Unidade</th>
                        <th className="text-right">Faturamento</th>
                        <th className="text-right">Comandas</th>
                        <th className="text-right">Ticket médio</th>
                        <th className="text-right">Cadastros novos</th>
                        <th className="text-right">Dados até</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map(u => {
                        const rows = current.filter(d => d.store_id === u.store_id)
                        const g = sum(rows, 'gross_revenue')
                        const t = sum(rows, 'tickets_count')
                        return (
                          <tr key={u.store_id}>
                            <td className="text-foreground font-medium">
                              {unitName[u.store_id] ?? u.display_name}
                            </td>
                            <td className="text-right text-foreground font-semibold">{fmtBRLCents(g)}</td>
                            <td className="text-right text-muted-foreground">{t}</td>
                            <td className="text-right text-muted-foreground">
                              {t ? fmtBRLCents(g / t) : '—'}
                            </td>
                            <td className="text-right text-muted-foreground">
                              {sum(rows, 'new_customers')}
                            </td>
                            <td className={`text-right ${lagging.some(l => l.name === (unitName[u.store_id] ?? u.display_name)) ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
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
      </AdminPage>
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
    <div className={CARD}>
      <h2 className={`${CARD_TITLE} mb-3`}>
        <Icon className="w-4 h-4 text-muted-foreground" /> {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-2 text-[13px] mb-0.5">
                <span className="text-foreground line-clamp-1">{r.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {r.qty.toLocaleString('pt-BR')}× · <span className="font-semibold text-foreground">{fmtBRL(r.revenue)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${max ? (r.revenue / max) * 100 : 0}%` }} />
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
    <div className={CARD}>
      <h2 className={`${CARD_TITLE} mb-3`}>
        <CreditCard className="w-4 h-4 text-muted-foreground" /> Formas de pagamento
      </h2>
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-2 text-[13px] mb-0.5">
              <span className="text-foreground">{r.label}</span>
              <span className="text-muted-foreground shrink-0">
                {total ? ((r.value / total) * 100).toFixed(0) : 0}% · <span className="font-semibold text-foreground">{fmtBRL(r.value)}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-brand" style={{ width: `${total ? (r.value / total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {Number(payments.tips) > 0 && (
        <p className="text-[12px] text-muted-foreground mt-3">Gorjetas: {fmtBRLCents(Number(payments.tips))}</p>
      )}
    </div>
  )
}

function DiscountsCard({ discounts }: { discounts: Breakdown['discounts'] }) {
  const total = discounts.reduce((a, d) => a + Number(d.total), 0)
  const uses = discounts.reduce((a, d) => a + Number(d.uses), 0)
  return (
    <div className={CARD}>
      <h2 className={`${CARD_TITLE} mb-1`}>
        <BadgePercent className="w-4 h-4 text-muted-foreground" /> Descontos concedidos
      </h2>
      <p className="text-[13px] text-muted-foreground mb-3">
        <span className="font-semibold text-foreground">{fmtBRL(total)}</span> em {uses.toLocaleString('pt-BR')} comandas
      </p>
      {discounts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhum desconto no período.</p>
      ) : (
        <ul className="space-y-1.5 text-[13px]">
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

/** Taxa sobre o total de agendamentos (que já inclui faltas e cancelamentos). */
const pctOf = (n: number, total: number) =>
  total ? `${((n / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'

function ClientsCard({ clients, appointments }: {
  /** null quando nenhuma unidade da seleção tem fechamentos importados. */
  clients: Breakdown['clients'] | null
  appointments: { total: number; done: number; noShows: number; cancellations: number }
}) {
  const unique = Number(clients?.unique ?? 0)
  const returning = Number(clients?.returning ?? 0)
  const firstTime = Number(clients?.first_time ?? 0)
  return (
    <div className={CARD}>
      <h2 className={`${CARD_TITLE} mb-3`}>
        <Repeat className="w-4 h-4 text-muted-foreground" /> Clientes atendidos
      </h2>
      {clients ? (
        <>
          <div className="font-title text-[24px] font-semibold text-foreground leading-none tabular-nums">{unique.toLocaleString('pt-BR')}</div>
          <p className="text-[12px] text-muted-foreground mt-1">Clientes diferentes com comanda paga</p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">Sem fechamentos importados no período.</p>
      )}
      {unique > 0 && (
        <>
          <div className="flex h-2 gap-0.5 rounded-full overflow-hidden mt-3 mb-2">
            <div className="bg-brand" style={{ width: `${(returning / unique) * 100}%` }} />
            <div className="bg-ink-400" style={{ width: `${(firstTime / unique) * 100}%` }} />
          </div>
          <div className="space-y-1 text-[13px]">
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

      <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-[13px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" /> Agendamentos
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {appointments.total.toLocaleString('pt-BR')}
            <span className="text-muted-foreground font-normal"> · {appointments.done.toLocaleString('pt-BR')} realizados</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <UserX className="w-3.5 h-3.5" /> Faltas (no-show)
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {appointments.noShows.toLocaleString('pt-BR')}
            <span className="text-muted-foreground font-normal"> · {pctOf(appointments.noShows, appointments.total)}</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarX className="w-3.5 h-3.5" /> Cancelamentos
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {appointments.cancellations.toLocaleString('pt-BR')}
            <span className="text-muted-foreground font-normal"> · {pctOf(appointments.cancellations, appointments.total)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
