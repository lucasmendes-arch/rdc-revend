import { useEffect, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  Search, SlidersHorizontal, Download, Loader, Users, ChevronRight, ChevronLeft, X,
} from 'lucide-react'
import { toast } from 'sonner'

import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import {
  STATUS_META, STATUS_ORDER, TONE_DOT, StatusBadge, FilterForm, brl, cleanFilters, daysLabel,
  describeFilters, fmtDate, fmtPhone, initials, searchClients, statusCounts, useCrmUnits,
  type ClientStatus, type CrmFilters, type SalonClient,
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

function StatusCard({ status, count, active, onClick }: {
  status: ClientStatus | 'all'; count: number; active: boolean; onClick: () => void
}) {
  const meta = status === 'all'
    ? { label: 'Todas', hint: 'clientes da seleção', tone: 'neutral' as const }
    : STATUS_META[status]
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`text-left min-w-[140px] flex-1 rounded-xl border px-4 py-3 transition-all ${
        active
          ? 'border-brand-border bg-brand-subtle ring-1 ring-inset ring-brand-border'
          : 'border-border bg-card hover:border-ink-300'
      }`}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-600">
        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden />
        {meta.label}
      </span>
      <span className="block text-[24px] font-semibold tracking-tight leading-none text-foreground mt-2 numeric">
        {count.toLocaleString('pt-BR')}
      </span>
      <span className="block text-[11px] text-muted-foreground mt-1.5 truncate">{meta.hint}</span>
    </button>
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

  const { data: counts = {} } = useQuery({
    queryKey: ['crm-status-counts', baseFilters],
    queryFn: () => statusCounts(baseFilters),
  })
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

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <AdminHeader
          title="Clientes do salão"
          subtitle={
            lastRefresh
              ? `Histórico do Trinks · atualizado ${new Date(lastRefresh).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Histórico do Trinks'
          }
          actionNode={
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || !data?.total}>
              {exporting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Exportar
            </Button>
          }
        />
        <div className="px-4 sm:px-6 lg:px-8 pb-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="sm:w-56">
            <StyledSelect
              value={storeId}
              onChange={setStoreId}
              options={[{ value: 'all', label: 'Todas as unidades' }, ...units.map(u => ({ value: u.store_id, label: u.name }))]}
            />
          </div>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar nome ou telefone"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </div>
          <Button
            variant={advancedCount ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowAdvanced(v => !v)}
            aria-expanded={showAdvanced}
            className={advancedCount ? 'ring-1 ring-inset ring-brand-border bg-brand-subtle text-brand-strong' : ''}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros{advancedCount ? ` · ${advancedCount}` : ''}
          </Button>
          <div className="sm:ml-auto sm:w-52">
            <StyledSelect value={sort} onChange={setSort} options={SORTS} />
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {showAdvanced && (
          <div className="surface-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Filtros</h2>
              <div className="flex items-center gap-2">
                {advancedCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setAdvanced({})}>Limpar</Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setShowAdvanced(false)} aria-label="Fechar filtros">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="max-w-2xl">
              <FilterForm value={advanced} onChange={setAdvanced} units={units} showUnit={false} />
            </div>
          </div>
        )}

        <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
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
          <div className="flex flex-col items-center justify-center py-24">
            <Loader className="w-7 h-7 animate-spin text-ink-300 mb-3" />
            <p className="text-sm text-muted-foreground">Carregando clientes…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card flex flex-col items-center justify-center py-20 px-4 text-center">
            <Users className="w-8 h-8 text-ink-300 mb-3" />
            <p className="text-[16px] font-semibold text-foreground">Nenhuma cliente aqui</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {units.length === 0
                ? 'Nenhuma unidade com dados do Trinks ainda.'
                : 'Troque a situação, a unidade ou limpe os filtros.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className={`hidden md:block surface-card overflow-hidden transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
              <table className="w-full table-fixed">
                <thead className="border-b border-border">
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="pl-5 pr-3 h-9 text-left font-medium w-[28%]">Cliente</th>
                    <th className="px-3 h-9 text-left font-medium w-[13%]">Situação</th>
                    <th className="px-3 h-9 text-left font-medium w-[15%]">Última visita</th>
                    <th className="px-3 h-9 text-right font-medium w-[13%]">Gasto total</th>
                    <th className="px-3 h-9 text-left font-medium w-[26%]">Costuma fazer</th>
                    <th className="w-[5%]" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(c => (
                    <tr
                      key={`${c.store_id}:${c.client_key}`}
                      onClick={() => setSelected(c)}
                      className="group cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <td className="pl-5 pr-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-8 h-8 rounded-full bg-muted text-ink-600 flex items-center justify-center text-[12px] font-semibold shrink-0" aria-hidden>
                            {initials(c.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground truncate">{c.name}</p>
                            <p className="text-[12px] text-muted-foreground truncate">
                              {[fmtPhone(c.whatsapp) ?? 'sem WhatsApp', storeId === 'all' ? c.store_name : null].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-2.5">
                        <p className="text-[13px] text-foreground">{c.last_visit ? daysLabel(c.days_since_last_visit) : '—'}</p>
                        <p className="text-[11px] text-muted-foreground numeric">
                          {c.last_visit ? fmtDate(c.last_visit) : 'nunca'}
                          {c.avg_interval_days ? ` · vem a cada ${Math.round(Number(c.avg_interval_days))}d` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <p className="text-[13px] font-semibold text-foreground numeric">{brl(c.total_spent)}</p>
                        <p className="text-[11px] text-muted-foreground numeric">
                          {c.visits_count} {c.visits_count === 1 ? 'visita' : 'visitas'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[13px] text-foreground truncate">{c.favorite_service ?? (c.products_spent > 0 && c.services_spent === 0 ? 'Só produto' : '—')}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.favorite_professional ? `com ${c.favorite_professional}` : ''}
                          {c.no_shows > 0 ? `${c.favorite_professional ? ' · ' : ''}${c.no_shows} ${c.no_shows === 1 ? 'falta' : 'faltas'}` : ''}
                        </p>
                      </td>
                      <td className="pr-4 py-2.5 text-right">
                        <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-brand-strong inline-block transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {rows.map(c => (
                <button
                  key={`${c.store_id}:${c.client_key}`}
                  onClick={() => setSelected(c)}
                  className="w-full text-left surface-card p-3.5 flex items-center gap-3"
                >
                  <span className="w-9 h-9 rounded-full bg-muted text-ink-600 flex items-center justify-center text-[12px] font-semibold shrink-0" aria-hidden>
                    {initials(c.name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-foreground truncate">{c.name}</span>
                    </span>
                    <span className="block text-[12px] text-muted-foreground truncate">
                      {c.last_visit ? `${daysLabel(c.days_since_last_visit)} · ` : ''}{brl(c.total_spent)} · {c.visits_count} visitas
                    </span>
                  </span>
                  <StatusBadge status={c.status} />
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span className="numeric">
                {(page * PAGE + 1).toLocaleString('pt-BR')}–{Math.min((page + 1) * PAGE, data?.total ?? 0).toLocaleString('pt-BR')} de {(data?.total ?? 0).toLocaleString('pt-BR')}
                {' · '}{(data?.with_whatsapp ?? 0).toLocaleString('pt-BR')} com WhatsApp
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="px-2 numeric">{page + 1} / {Math.max(pages, 1)}</span>
                <Button variant="outline" size="icon-sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} aria-label="Próxima página">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && <ClientDrawer client={selected} onClose={() => setSelected(null)} />}
    </AdminLayout>
  )
}
