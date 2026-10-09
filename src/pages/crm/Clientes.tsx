import { useEffect, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  SlidersHorizontal, Download, Loader, Users, ChevronRight, ChevronLeft, X, Repeat, HeartHandshake,
  CalendarCheck, UserMinus, Wallet, MessageCircle, BarChart3, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import AdminLayout from '@/components/admin/AdminLayout'
import {
  AdminPage, EmptyState, PageLoading, Panel, SearchInput, StatCard, Toolbar,
} from '@/components/admin/ui/AdminPage'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  STATUS_META, STATUS_ORDER, TONE_DOT, StatusBadge, FilterForm, brl, cleanFilters, daysLabel,
  describeFilters, fmtDate, fmtPhone, initials, searchClients, crmOverview, useCrmUnits,
  type ClientStatus, type CrmFilters, type CrmKpis, type SalonClient,
} from './crmShared'
import ClientDrawer from './ClientDrawer'

// CRM dos salões — lista de clientes. Fonte: salon_clients_v via
// salon_crm_search. Ver supabase/migrations/20261009000006_salon_crm.sql.

const PAGE = 50

const SORTS = [
  { value: 'days_since_desc', label: 'Mais tempo sem vir' },
  { value: 'last_visit_desc', label: 'Visita mais recente' },
  { value: 'spent_desc', label: 'Maior gasto' },
  { value: 'visits_desc', label: 'Mais visitas' },
  { value: 'name', label: 'Nome' },
]

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`

/** Card de situação: KPI clicável que filtra a lista. */
function StatusCard({ status, count, active, onClick }: {
  status: ClientStatus | 'all'; count: number; active: boolean; onClick: () => void
}) {
  const meta = status === 'all'
    ? { label: 'Todas', hint: 'Clientes da seleção', tone: 'neutral' as const }
    : STATUS_META[status]
  return (
    <StatCard
      onClick={onClick}
      active={active}
      className="min-w-[152px] shrink-0 sm:min-w-0"
      label={
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TONE_DOT[meta.tone])} aria-hidden />
          {meta.label}
        </span>
      }
      value={count.toLocaleString('pt-BR')}
      hint={meta.hint}
    />
  )
}

const pct = (n: number, base: number) =>
  base ? `${((n / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'

const num = (n: number) => Number(n).toLocaleString('pt-BR')

/** Indicadores principais da seleção (unidade, busca e filtros; ignora a situação). */
function KpiCards({ kpis }: { kpis: CrmKpis | null }) {
  const cards: { icon: LucideIcon; label: string; value: (k: CrmKpis) => string; hint: (k: CrmKpis) => string }[] = [
    {
      icon: Repeat, label: 'Taxa de retorno',
      value: k => pct(k.returned, k.with_purchase),
      hint: k => `${num(k.returned)} de ${num(k.with_purchase)} voltaram (2+ visitas)`,
    },
    {
      icon: HeartHandshake, label: 'Taxa de fidelização',
      value: k => pct(k.active, k.recent),
      hint: k => `${num(k.active)} ativas de ${num(k.recent)} que compraram no último ano`,
    },
    {
      icon: CalendarCheck, label: 'Ativas com horário',
      value: k => pct(k.active_scheduled, k.active),
      hint: k => `${num(k.active_scheduled)} de ${num(k.active)} ativas já têm próximo horário`,
    },
    {
      icon: UserMinus, label: 'Taxa de churn',
      value: k => pct(k.churned, k.with_purchase),
      hint: k => `${num(k.churned)} sumidas ou perdidas de ${num(k.with_purchase)} com compra`,
    },
    {
      icon: Wallet, label: 'LTV médio',
      value: k => brl(k.with_purchase ? Number(k.revenue) / k.with_purchase : 0),
      hint: () => 'Gasto total médio por cliente com compra',
    },
    {
      icon: MessageCircle, label: 'Alcance no WhatsApp',
      value: k => pct(k.reachable, k.total),
      hint: k => `${num(k.reachable)} de ${num(k.total)} com WhatsApp e sem opt-out`,
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map(c => (
        <StatCard
          key={c.label}
          icon={c.icon}
          label={c.label}
          value={kpis ? c.value(kpis) : '—'}
          hint={kpis ? c.hint(kpis) : ' '}
          wrapHint
        />
      ))}
    </div>
  )
}

/** Indicadores que não cabem no quadro principal, agrupados por tema. */
function MoreKpisSheet({ kpis, open, onClose }: { kpis: CrmKpis | null; open: boolean; onClose: () => void }) {
  const k = kpis
  const groups: { title: string; rows: { label: string; value: string; hint: string }[] }[] = !k ? [] : [
    {
      title: 'Retenção e ciclo',
      rows: [
        {
          label: 'Em risco', value: pct(k.at_risk, k.active + k.at_risk),
          hint: `${num(k.at_risk)} em risco de ${num(k.active + k.at_risk)} ativas ou em risco — a fila de reativação`,
        },
        {
          label: 'Intervalo médio entre visitas',
          value: k.avg_interval_days != null ? `${num(Math.round(Number(k.avg_interval_days)))} dias` : '—',
          hint: 'Média das clientes com 2+ visitas',
        },
        {
          label: 'Visitas por cliente',
          value: k.with_purchase ? (Number(k.visits) / k.with_purchase).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—',
          hint: `${num(k.visits)} visitas de ${num(k.with_purchase)} clientes com compra`,
        },
      ],
    },
    {
      title: 'Agenda',
      rows: [
        {
          label: 'Clientes com falta', value: pct(k.with_no_show, k.total),
          hint: `${num(k.with_no_show)} faltaram ao menos 1 vez · ${num(k.repeat_no_show)} reincidentes (2+)`,
        },
        {
          label: 'Cancelou e não remarcou', value: pct(k.missed_unresolved, k.total),
          hint: `${num(k.missed_unresolved)} clientes — público do resgate da agenda`,
        },
      ],
    },
    {
      title: 'Valor',
      rows: [
        {
          label: 'Ticket médio', value: brl(k.visits ? Number(k.revenue) / Number(k.visits) : 0),
          hint: 'Gasto total ÷ visitas das clientes com compra',
        },
        {
          label: 'Concentração (top 20%)', value: pct(Number(k.top20_revenue), Number(k.revenue)),
          hint: `Do faturamento vem dos 20% que mais gastam (${brl(Number(k.top20_revenue))} de ${brl(Number(k.revenue))})`,
        },
        {
          label: 'Compram produto', value: pct(k.product_buyers, k.with_purchase),
          hint: `${num(k.product_buyers)} de ${num(k.with_purchase)} já levaram produto — potencial de venda cruzada`,
        },
      ],
    },
    {
      title: 'Contato',
      rows: [
        {
          label: 'Aniversário cadastrado', value: pct(k.with_birthday, k.total),
          hint: `${num(k.with_birthday)} de ${num(k.total)} clientes`,
        },
      ],
    },
  ]
  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 flex flex-col">
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="text-[17px]">Mais indicadores</SheetTitle>
          <SheetDescription className="text-[12px] mt-1">
            Mesma seleção da lista (unidade, busca e filtros), sem o filtro de situação.
          </SheetDescription>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {!k ? (
            <PageLoading label="Calculando…" />
          ) : groups.map(g => (
            <section key={g.title}>
              <h3 className="text-[12.5px] font-medium text-muted-foreground mb-2">{g.title}</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {g.rows.map(r => (
                  <li key={r.label} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium text-foreground">{r.label}</span>
                      <span className="font-title text-[18px] font-semibold text-foreground tabular-nums shrink-0">{r.value}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{r.hint}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('rounded-full bg-muted text-ink-600 flex items-center justify-center text-[12px] font-semibold shrink-0', className)}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export default function CrmClientes() {
  const { data: units = [] } = useCrmUnits()

  // "Ver clientes" na tela de Segmentos chega com o público em location.state.
  const incoming = (useLocation().state as { filters?: CrmFilters } | null)?.filters
  const incomingStatuses = incoming?.statuses ?? []

  const [status, setStatus] = useState<ClientStatus | 'all'>(incomingStatuses.length === 1 ? incomingStatuses[0] : 'all')
  const [storeId, setStoreId] = useState<string>(incoming?.store_id ?? 'all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [advanced, setAdvanced] = useState<CrmFilters>(() => {
    if (!incoming) return {}
    const { store_id: _s, statuses, ...rest } = incoming
    // Várias situações não cabem num card só: viram filtro avançado.
    return statuses && statuses.length > 1 ? { ...rest, statuses } : rest
  })
  const [showAdvanced, setShowAdvanced] = useState(!!incoming)
  const [sort, setSort] = useState('days_since_desc')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<SalonClient | null>(null)
  const [exporting, setExporting] = useState(false)
  const [showMoreKpis, setShowMoreKpis] = useState(false)

  // Busca com atraso curto: não dispara uma consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const baseFilters: CrmFilters = useMemo(() => ({
    ...advanced,
    store_id: storeId === 'all' ? null : storeId,
    search,
  }), [advanced, storeId, search])

  const filters: CrmFilters = useMemo(
    () => ({ ...baseFilters, statuses: status === 'all' ? (advanced.statuses ?? []) : [status] }),
    [baseFilters, status],
  )

  useEffect(() => setPage(0), [filters, sort])

  const { data: overview } = useQuery({
    queryKey: ['crm-overview', baseFilters],
    queryFn: () => crmOverview(baseFilters),
    placeholderData: keepPreviousData,
  })
  const counts = overview?.statuses ?? {}
  const kpis = overview?.kpis ?? null
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['crm-clients', filters, sort, page],
    queryFn: () => searchClients(filters, sort, PAGE, page * PAGE),
    placeholderData: keepPreviousData,
  })

  const { data: lastRefresh } = useQuery({
    queryKey: ['crm-refreshed-at'],
    queryFn: async () => {
      const { data } = await supabase.from('salon_clients').select('refreshed_at')
        .order('refreshed_at', { ascending: false }).limit(1).maybeSingle()
      return (data as { refreshed_at: string } | null)?.refreshed_at ?? null
    },
  })

  const advancedCount = Object.keys(cleanFilters(advanced)).length

  async function exportCsv() {
    setExporting(true)
    try {
      const res = await searchClients(filters, sort, 5000, 0)
      const cols: [string, (c: SalonClient) => string | number | null][] = [
        ['Nome', c => c.name], ['WhatsApp', c => c.whatsapp], ['Unidade', c => c.store_name],
        ['Situação', c => STATUS_META[c.status].label], ['Última visita', c => c.last_visit],
        ['Dias sem vir', c => c.days_since_last_visit], ['Visitas', c => c.visits_count],
        ['Total gasto', c => Number(c.total_spent).toFixed(2).replace('.', ',')],
        ['Ticket médio', c => (c.avg_ticket != null ? Number(c.avg_ticket).toFixed(2).replace('.', ',') : '')],
        ['Serviço favorito', c => c.favorite_service], ['Profissional favorita', c => c.favorite_professional],
        ['Faltas', c => c.no_shows], ['Aniversário', c => c.birth_date],
      ]
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [cols.map(c => esc(c[0])).join(';'), ...res.rows.map(r => cols.map(c => esc(c[1](r))).join(';'))].join('\r\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `clientes-salao-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      if (res.total > res.rows.length) toast.info(`Exportadas as primeiras ${res.rows.length} de ${res.total}.`)
    } catch (e) {
      toast.error(`Não foi possível exportar: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  const rows = data?.rows ?? []
  const pages = Math.ceil((data?.total ?? 0) / PAGE)
  const hasAnyFilter = status !== 'all' || storeId !== 'all' || !!search || advancedCount > 0

  function clearAll() {
    setStatus('all')
    setStoreId('all')
    setSearchInput('')
    setAdvanced({})
  }

  return (
    <AdminLayout>
      <AdminPage
        title="Clientes"
        description={
          lastRefresh
            ? `Clientes dos salões, com histórico do Trinks · atualizado ${new Date(lastRefresh).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : 'Clientes dos salões, com histórico do Trinks'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowMoreKpis(true)}>
              <BarChart3 />
              Mais indicadores
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={exporting || !data?.total}>
              {exporting ? <Loader className="animate-spin" /> : <Download />}
              Exportar
            </Button>
          </>
        }
        toolbar={
          <Toolbar>
            <div className="w-full sm:w-56">
              <StyledSelect
                value={storeId}
                onChange={setStoreId}
                options={[{ value: 'all', label: 'Todas as unidades' }, ...units.map(u => ({ value: u.store_id, label: u.name }))]}
              />
            </div>
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Buscar por nome ou telefone" />
            <Button
              variant="secondary"
              onClick={() => setShowAdvanced(v => !v)}
              aria-expanded={showAdvanced}
              className={cn('shrink-0', advancedCount > 0 && 'bg-brand-subtle border-brand-border text-brand-strong hover:bg-brand-subtle')}
            >
              <SlidersHorizontal />
              Filtros
              {advancedCount > 0 && <span className="tabular-nums">· {advancedCount}</span>}
            </Button>
            <div className="flex-1 min-w-0 sm:flex-none sm:w-52 sm:ml-auto">
              <StyledSelect value={sort} onChange={setSort} options={SORTS} />
            </div>
          </Toolbar>
        }
      >
        <div className="space-y-4">
          {showAdvanced && (
            <Panel
              title="Filtros"
              actions={
                <>
                  {advancedCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setAdvanced({})}>Limpar filtros</Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowAdvanced(false)} aria-label="Fechar filtros">
                    <X />
                  </Button>
                </>
              }
            >
              <div className="max-w-2xl">
                <FilterForm value={advanced} onChange={setAdvanced} units={units} showUnit={false} />
              </div>
            </Panel>
          )}

          <KpiCards kpis={kpis} />

          {/* Situação: rola na horizontal no celular, grade a partir do sm. */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto scrollbar-none sm:grid sm:grid-cols-4 sm:overflow-visible">
            <StatusCard status="all" count={total} active={status === 'all'} onClick={() => setStatus('all')} />
            {STATUS_ORDER.map(s => (
              <StatusCard key={s} status={s} count={counts[s] ?? 0} active={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>

          {advancedCount > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Filtro: {describeFilters(advanced, units)}
            </p>
          )}

          {isLoading ? (
            <PageLoading label="Carregando clientes…" />
          ) : rows.length === 0 ? (
            <Panel flush>
              <EmptyState
                icon={Users}
                title="Nenhuma cliente encontrada"
                description={units.length === 0
                  ? 'Nenhuma unidade tem dados do Trinks ainda.'
                  : 'Troque a situação, a unidade ou limpe os filtros.'}
                action={units.length > 0 && hasAnyFilter
                  ? <Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>
                  : undefined}
              />
            </Panel>
          ) : (
            <>
              {/* Desktop */}
              <Panel flush className={cn('hidden md:block overflow-hidden transition-opacity', isFetching && 'opacity-70')}>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5 w-[28%]">Cliente</TableHead>
                      <TableHead className="w-[14%]">Situação</TableHead>
                      <TableHead className="w-[15%]">Última visita</TableHead>
                      <TableHead className="w-[13%] text-right">Gasto total</TableHead>
                      <TableHead className="w-[25%]">Costuma fazer</TableHead>
                      <TableHead className="w-[5%]"><span className="sr-only">Abrir</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(c => (
                      <TableRow
                        key={`${c.store_id}:${c.client_key}`}
                        onClick={() => setSelected(c)}
                        className="group cursor-pointer hover:bg-muted/60"
                      >
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={c.name} className="w-8 h-8" />
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-[12px] text-muted-foreground truncate">
                                {[fmtPhone(c.whatsapp) ?? 'Sem WhatsApp', storeId === 'all' ? c.store_name : null].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                        <TableCell>
                          <p className="text-[13px] text-foreground truncate">{c.last_visit ? daysLabel(c.days_since_last_visit) : '—'}</p>
                          <p className="text-[12px] text-muted-foreground tabular-nums truncate">
                            {c.last_visit ? fmtDate(c.last_visit) : 'Nunca veio'}
                            {c.avg_interval_days ? ` · a cada ${Math.round(Number(c.avg_interval_days))}d` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="text-[13px] font-medium text-foreground tabular-nums">{brl(c.total_spent)}</p>
                          <p className="text-[12px] text-muted-foreground tabular-nums">
                            {plural(c.visits_count, 'visita', 'visitas')}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-[13px] text-foreground truncate">{c.favorite_service ?? (c.products_spent > 0 && c.services_spent === 0 ? 'Só produto' : '—')}</p>
                          <p className="text-[12px] text-muted-foreground truncate">
                            {c.favorite_professional ? `com ${c.favorite_professional}` : ''}
                            {c.no_shows > 0 ? `${c.favorite_professional ? ' · ' : ''}${plural(c.no_shows, 'falta', 'faltas')}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-500 inline-block transition-colors" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>

              {/* Mobile */}
              <Panel flush className={cn('md:hidden overflow-hidden transition-opacity', isFetching && 'opacity-70')}>
                <ul className="divide-y divide-border">
                  {rows.map(c => (
                    <li key={`${c.store_id}:${c.client_key}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/60 transition-colors"
                      >
                        <Avatar name={c.name} className="w-9 h-9" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] font-medium text-foreground truncate">{c.name}</span>
                          <span className="block text-[12px] text-muted-foreground truncate tabular-nums">
                            {[
                              c.last_visit ? daysLabel(c.days_since_last_visit) : null,
                              brl(c.total_spent),
                              plural(c.visits_count, 'visita', 'visitas'),
                            ].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <StatusBadge status={c.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
                <span className="tabular-nums">
                  {(page * PAGE + 1).toLocaleString('pt-BR')}–{Math.min((page + 1) * PAGE, data?.total ?? 0).toLocaleString('pt-BR')} de {(data?.total ?? 0).toLocaleString('pt-BR')}
                  {' · '}{(data?.with_whatsapp ?? 0).toLocaleString('pt-BR')} com WhatsApp
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="icon-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                    <ChevronLeft />
                  </Button>
                  <span className="px-2 tabular-nums">{page + 1} / {Math.max(pages, 1)}</span>
                  <Button variant="secondary" size="icon-sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} aria-label="Próxima página">
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </AdminPage>

      {selected && <ClientDrawer client={selected} onClose={() => setSelected(null)} />}
      <MoreKpisSheet kpis={kpis} open={showMoreKpis} onClose={() => setShowMoreKpis(false)} />
    </AdminLayout>
  )
}
