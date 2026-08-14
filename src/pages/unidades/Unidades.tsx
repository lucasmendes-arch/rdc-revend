import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  DollarSign, Receipt, TrendingUp, Users, Scissors, Package, CalendarDays,
  UserX, Loader, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle,
} from 'lucide-react'

import { useAdminTheme } from '@/contexts/AdminThemeContext'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter'
import { ADMIN_DEFAULT_PERIOD_PRESETS } from '@/components/admin/ui/presets'
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard'
import StyledSelect from '@/components/ui/styled-select'

// Dados vindos do Trinks pela edge function sync-trinks (coleta horária).
// Ver docs/trinks-endpoints.md.

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
  revenue: number
  commission: number
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtBRLCents = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function computeBounds(preset: string, customFrom: string, customTo: string) {
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
  const prevEnd = shift(start, -1)
  const prevStart = shift(prevEnd, -(days - 1))

  return {
    from: toISO(start), to: toISO(end),
    prevFrom: toISO(prevStart), prevTo: toISO(prevEnd),
    days,
  }
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-muted-foreground">sem base anterior</span>
  const pct = ((current - previous) / previous) * 100
  const flat = Math.abs(pct) < 0.5
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  const color = flat ? 'text-muted-foreground' : pct > 0 ? 'text-emerald-600' : 'text-red-600'
  return (
    <span className={`inline-flex items-center gap-0.5 ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(pct).toFixed(1)}% vs. anterior
    </span>
  )
}

export default function Unidades() {
  const { isDark } = useAdminTheme()

  const ch = {
    grid: isDark ? 'hsl(218,14%,18%)' : '#f3f4f6',
    axis: isDark ? 'hsl(218,14%,20%)' : '#e5e7eb',
    tick: isDark ? '#64748b' : '#9ca3af',
    prevLine: isDark ? 'hsl(218,14%,32%)' : '#d1d5db',
    tooltipBg: isDark ? 'hsl(218,17%,13%)' : '#ffffff',
    tooltipBorder: isDark ? 'hsl(218,14%,22%)' : '#e5e7eb',
    tooltipText: isDark ? 'hsl(214,18%,88%)' : '#111827',
  }

  const [activePreset, setActivePreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [storeFilter, setStoreFilter] = useState('all')

  const bounds = useMemo(
    () => computeBounds(activePreset, customFrom, customTo),
    [activePreset, customFrom, customTo],
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_daily_revenue')
        .select('*')
        .gte('business_date', bounds.prevFrom)
        .lte('business_date', bounds.to)
        .order('business_date')
      if (error) throw error
      return data as DailyRow[]
    },
  })

  const { data: services = [] } = useQuery({
    queryKey: ['trinks-services', bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_service_sales')
        .select('store_id, business_date, name, qty, revenue')
        .gte('business_date', bounds.from)
        .lte('business_date', bounds.to)
      if (error) throw error
      return data as ItemRow[]
    },
  })

  const { data: products = [] } = useQuery({
    queryKey: ['trinks-products', bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_product_sales')
        .select('store_id, business_date, name, qty, revenue')
        .gte('business_date', bounds.from)
        .lte('business_date', bounds.to)
      if (error) throw error
      return data as ItemRow[]
    },
  })

  const { data: professionals = [] } = useQuery({
    queryKey: ['trinks-professionals', bounds.from, bounds.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_professional_sales')
        .select('store_id, business_date, professional_name, services_count, revenue, commission')
        .gte('business_date', bounds.from)
        .lte('business_date', bounds.to)
      if (error) throw error
      return data as ProfessionalRow[]
    },
  })

  const { data: lastRun } = useQuery({
    queryKey: ['trinks-last-run'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_sync_runs')
        .select('started_at, finished_at, status, store_id')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as { started_at: string; finished_at: string | null; status: string } | null
    },
    refetchInterval: 5 * 60 * 1000,
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
  const prevGross = sum(previous, 'gross_revenue')
  const tickets = sum(current, 'tickets_count')
  const prevTickets = sum(previous, 'tickets_count')
  const avgTicket = tickets ? gross / tickets : 0
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
    const byName = new Map<string, { name: string; count: number; revenue: number; commission: number }>()
    for (const p of inStore(professionals)) {
      const e = byName.get(p.professional_name)
        ?? { name: p.professional_name, count: 0, revenue: 0, commission: 0 }
      e.count += Number(p.services_count)
      e.revenue += Number(p.revenue)
      e.commission += Number(p.commission)
      byName.set(p.professional_name, e)
    }
    return [...byName.values()].sort((a, b) => b.revenue - a.revenue)
  }, [professionals, storeFilter])

  const servicesTotal = sum(current, 'services_revenue')
  const productsTotal = sum(current, 'products_revenue')
  const splitTotal = servicesTotal + productsTotal

  const syncLabel = (() => {
    if (!lastRun?.started_at) return 'nunca sincronizado'
    const minutes = Math.round((Date.now() - new Date(lastRun.started_at).getTime()) / 60000)
    const when = minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : `há ${Math.floor(minutes / 60)}h`
    return `atualizado ${when}`
  })()

  const syncFailed = lastRun?.status === 'error' || lastRun?.status === 'partial'

  return (
    <AdminLayout>
      <AdminHeader
        title="Unidades"
        subtitle={
          <span className={`inline-flex items-center gap-1.5 ${syncFailed ? 'text-red-600' : ''}`}>
            {syncFailed && <AlertTriangle className="w-3 h-3" />}
            Dados do Trinks · {syncLabel}
            {lastRun?.status === 'partial' && ' (parcial)'}
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
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <AdminSummaryCard
                icon={DollarSign} iconColor="text-gold"
                label="Faturamento" value={fmtBRL(gross)}
                subtitle={<Delta current={gross} previous={prevGross} />}
              />
              <AdminSummaryCard
                icon={Receipt} label="Comandas" value={tickets.toLocaleString('pt-BR')}
                subtitle={<Delta current={tickets} previous={prevTickets} />}
              />
              <AdminSummaryCard
                icon={TrendingUp} label="Ticket médio" value={fmtBRLCents(avgTicket)}
                subtitle={<Delta current={avgTicket} previous={prevAvgTicket} />}
              />
              <AdminSummaryCard
                icon={Users} label="Clientes novos"
                value={sum(current, 'new_customers').toLocaleString('pt-BR')}
                subtitle={<Delta current={sum(current, 'new_customers')} previous={sum(previous, 'new_customers')} />}
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
                      stroke="#d4a017" strokeWidth={2} dot={false}
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

            {/* Profissionais */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <h2 className="text-sm font-semibold text-foreground px-4 py-3 border-b border-border">
                Produção por profissional
              </h2>
              {profRanking.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4">Sem dados de comissão no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left font-medium px-4 py-2">Profissional</th>
                        <th className="text-right font-medium px-4 py-2">Atendimentos</th>
                        <th className="text-right font-medium px-4 py-2">Faturamento</th>
                        <th className="text-right font-medium px-4 py-2">Ticket médio</th>
                        <th className="text-right font-medium px-4 py-2">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profRanking.map(p => (
                        <tr key={p.name} className="border-b border-border last:border-0">
                          <td className="px-4 py-2 text-foreground font-medium">{p.name}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{p.count}</td>
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
