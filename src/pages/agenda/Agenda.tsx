import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, MessageSquareText, Phone, UserRound, CalendarX2 } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, EmptyState, PageLoading, SearchInput, Toolbar } from '@/components/admin/ui/AdminPage'
import StyledSelect from '@/components/ui/styled-select'
import { DateField } from '@/components/ui/date-field'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ClientDrawer from '@/pages/crm/ClientDrawer'
import { brlCents, useCrmUnits, type SalonClient } from '@/pages/crm/crmShared'

// ─────────────────────────────────────────────────────────────────────────────
// Agenda espelhada do Trinks (só leitura). Fonte: trinks_agenda_day
// (20261009000020) — webhook de agendamento + carga do CSV de Agendamentos
// para o que foi marcado antes do webhook. O Trinks não manda ausências,
// bloqueios nem expediente: a grade mostra horários ocupados, não os livres.
// ─────────────────────────────────────────────────────────────────────────────

interface AgendaProfessional { key: string; label: string; role: string | null }

interface AgendaAppointment {
  id: string
  source: 'csv' | 'webhook' | 'seed'
  professional_key: string
  professional: string | null
  starts_at: string
  ends_at: string
  service: string | null
  category: string | null
  value: number
  status: string
  origin: string | null
  client_key: string | null
  client_name: string | null
  client_phones: string | null
  client_tags: string | null
  appointment_tags: string | null
  notes: string | null
  is_new: boolean
  booked_at: string | null
  cancelled_at: string | null
}

interface AgendaDay {
  professionals: AgendaProfessional[]
  appointments: AgendaAppointment[]
  last_event_at: string | null
  seed_generated_at: string | null
}

type Tone = 'warning' | 'info' | 'brand' | 'success' | 'danger' | 'neutral'

/** Status do Trinks → rótulo e cor. Mesma cor no card, na legenda e no filtro. */
const STATUS: { value: string; label: string; tone: Tone }[] = [
  { value: 'Aguardando Confirmação do Estabelecimento', label: 'Aguardando confirmação', tone: 'warning' },
  { value: 'Confirmado', label: 'Confirmado', tone: 'info' },
  { value: 'Em atendimento', label: 'Em atendimento', tone: 'brand' },
  { value: 'Finalizado', label: 'Finalizado', tone: 'success' },
  { value: 'Cliente não compareceu', label: 'Faltou', tone: 'danger' },
  { value: 'Cancelado', label: 'Cancelado', tone: 'neutral' },
]
const statusMeta = (s: string) => STATUS.find(x => x.value === s) ?? { value: s, label: s, tone: 'neutral' as Tone }

const TONE_CARD: Record<Tone, string> = {
  warning: 'bg-warning-subtle border-warning-border',
  info: 'bg-info-subtle border-info-border',
  brand: 'bg-brand-subtle border-brand-border',
  success: 'bg-success-subtle border-success-border',
  danger: 'bg-danger-subtle border-danger-border',
  neutral: 'bg-muted border-border opacity-70',
}
const TONE_BAR: Record<Tone, string> = {
  warning: 'bg-warning-solid',
  info: 'bg-info-solid',
  brand: 'bg-brand-solid',
  success: 'bg-success-solid',
  danger: 'bg-danger-solid',
  neutral: 'bg-ink-400',
}

const TZ = 'America/Sao_Paulo'
const HOUR_PX = 64
const COL_MIN_W = 168
const GUTTER_W = 52

/** Hoje em Brasília (YYYY-MM-DD). */
const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Minutos desde 00:00 em Brasília. */
function minutesSP(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso))
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

const dayTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

/** Tira o número de ordem do apelido ("2 Yasmin" → "Yasmin"). */
const cleanLabel = (s: string) => s.replace(/^\s*\d+\s+/, '')

const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase())

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Posição lado a lado de agendamentos que se sobrepõem na mesma coluna:
 * cada grupo de sobreposição divide a largura pelo número de faixas.
 */
function layoutColumn(items: AgendaAppointment[]) {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.ends_at.localeCompare(b.ends_at))
  const out = new Map<string, { lane: number; lanes: number }>()
  let group: { a: AgendaAppointment; lane: number }[] = []
  let laneEnds: string[] = []
  let groupEnd = ''
  const flush = () => {
    for (const g of group) out.set(g.a.id, { lane: g.lane, lanes: laneEnds.length })
    group = []; laneEnds = []; groupEnd = ''
  }
  for (const a of sorted) {
    if (group.length && a.starts_at >= groupEnd) flush()
    let lane = laneEnds.findIndex(end => end <= a.starts_at)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(a.ends_at) } else laneEnds[lane] = a.ends_at
    group.push({ a, lane })
    if (a.ends_at > groupEnd) groupEnd = a.ends_at
  }
  flush()
  return out
}

const STORE_KEY = 'agenda.store'
const HIDDEN_KEY = 'agenda.hiddenStatuses'

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch { return fallback }
}
function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sem storage: só não lembra */ }
}

export default function Agenda() {
  const { data: units = [] } = useCrmUnits()
  const [storeId, setStoreId] = useState<string>(() => readLocal(STORE_KEY, ''))
  const [date, setDate] = useState(todaySP)
  const [search, setSearch] = useState('')
  const [proFilter, setProFilter] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>(() => readLocal(HIDDEN_KEY, ['Cancelado']))
  const [client, setClient] = useState<SalonClient | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Sem unidade lembrada: a que recebeu webhook por último.
  const { data: freshness = [] } = useQuery({
    queryKey: ['trinks-freshness'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trinks_data_freshness').select('store_id, last_webhook_at')
      if (error) throw error
      return data as { store_id: string; last_webhook_at: string | null }[]
    },
    enabled: !storeId,
  })
  useEffect(() => {
    if (storeId || units.length === 0) return
    const latest = [...freshness].filter(f => f.last_webhook_at)
      .sort((a, b) => (b.last_webhook_at ?? '').localeCompare(a.last_webhook_at ?? ''))[0]
    setStoreId(latest?.store_id ?? units[0].store_id)
  }, [storeId, units, freshness])

  useEffect(() => { if (storeId) writeLocal(STORE_KEY, storeId) }, [storeId])
  useEffect(() => { writeLocal(HIDDEN_KEY, hidden) }, [hidden])
  useEffect(() => { setProFilter([]) }, [storeId])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const { data, isLoading, error } = useQuery({
    queryKey: ['trinks-agenda', storeId, date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('trinks_agenda_day', { p_store_id: storeId, p_date: date })
      if (error) throw error
      return data as AgendaDay
    },
    enabled: !!storeId,
    refetchInterval: 60_000,
  })

  const isToday = date === todaySP()

  const visible = useMemo(() => {
    const q = norm(search.trim())
    return (data?.appointments ?? []).filter(a =>
      !hidden.includes(a.status) && (!q || norm(a.client_name ?? '').includes(q)))
  }, [data, hidden, search])

  const columns = useMemo(() => {
    const all = data?.professionals ?? []
    return proFilter.length ? all.filter(p => proFilter.includes(p.key)) : all
  }, [data, proFilter])

  const byColumn = useMemo(() => {
    const m = new Map<string, AgendaAppointment[]>()
    for (const a of visible) {
      const list = m.get(a.professional_key) ?? []
      list.push(a)
      m.set(a.professional_key, list)
    }
    return m
  }, [visible])

  // Janela de horas: 7h–21h, esticando se houver agendamento fora dela.
  const [startHour, endHour] = useMemo(() => {
    let lo = 7 * 60, hi = 21 * 60
    for (const a of data?.appointments ?? []) {
      lo = Math.min(lo, minutesSP(a.starts_at))
      hi = Math.max(hi, minutesSP(a.ends_at))
    }
    return [Math.floor(lo / 60), Math.ceil(hi / 60)]
  }, [data])
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const top = (iso: string) => ((minutesSP(iso) - startHour * 60) / 60) * HOUR_PX
  const nowTop = isToday ? top(new Date(now).toISOString()) : null

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of data?.appointments ?? []) c[a.status] = (c[a.status] ?? 0) + 1
    return c
  }, [data])

  async function openClient(a: AgendaAppointment) {
    if (!a.client_key) return
    const { data: row, error } = await supabase.from('salon_clients_v').select('*')
      .eq('store_id', storeId).eq('client_key', a.client_key).maybeSingle()
    if (error) return toast.error(`Não foi possível abrir a ficha: ${error.message}`)
    if (!row) return toast.info('Cliente ainda não está no CRM (ele é recalculado de hora em hora).')
    setClient(row as SalonClient)
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  return (
    <AdminLayout>
      <AdminPage
        title="Agenda"
        description="Espelho da agenda do Trinks, atualizado pelos eventos de agendamento. Para marcar ou alterar, use o Trinks."
        actions={
          <StyledSelect
            variant="inline"
            value={storeId}
            onChange={setStoreId}
            options={units.map(u => ({ value: u.store_id, label: u.name }))}
            className="bg-card text-[13px]"
          />
        }
        toolbar={
          <Toolbar className="justify-between gap-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Dia anterior"
                onClick={() => setDate(d => shiftDay(d, -1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <DateField
                value={date}
                onChange={v => v && setDate(v)}
                clearable={false}
                className="h-9 flex items-center gap-2 px-3 rounded-md border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              />
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Próximo dia"
                onClick={() => setDate(d => shiftDay(d, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setDate(todaySP())}>Hoje</Button>
              )}
              <span className="text-[13px] text-muted-foreground capitalize ml-1 hidden sm:inline">{weekday(date)}</span>
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente no dia" className="w-full sm:w-64" />
          </Toolbar>
        }
      >
        <div className="space-y-3">
          {/* Legenda = filtro de status. Cancelados começam ocultos. */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS.map(s => {
              const on = !hidden.includes(s.value)
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHidden(h => toggle(h, s.value))}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12.5px] font-medium transition-colors ${
                    on ? `${TONE_CARD[s.tone].replace(' opacity-70', '')} text-foreground` : 'border-border bg-card text-ink-400 line-through'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${TONE_BAR[s.tone]}`} aria-hidden />
                  {s.label}
                  <span className="tabular-nums text-muted-foreground">{counts[s.value] ?? 0}</span>
                </button>
              )
            })}
          </div>

          {(data?.professionals.length ?? 0) > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setProFilter([])}
                className={`h-7 px-2.5 rounded-md border text-[12.5px] font-medium transition-colors ${
                  proFilter.length === 0 ? 'bg-foreground text-background border-foreground' : 'border-border bg-card text-ink-600 hover:bg-muted'
                }`}
              >
                Todos
              </button>
              {data!.professionals.map(p => {
                const on = proFilter.includes(p.key)
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setProFilter(f => toggle(f, p.key))}
                    className={`h-7 px-2.5 rounded-md border text-[12.5px] font-medium transition-colors ${
                      on ? 'bg-brand-subtle border-brand-border text-brand-strong' : 'border-border bg-card text-ink-600 hover:bg-muted'
                    }`}
                  >
                    {cleanLabel(p.label)}
                  </button>
                )
              })}
            </div>
          )}

          {isLoading || !storeId ? (
            <PageLoading label="Carregando agenda…" />
          ) : error ? (
            <EmptyState icon={CalendarX2} title="Não foi possível carregar a agenda" description={(error as Error).message} />
          ) : columns.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="Sem profissionais nesta unidade"
              description="Os nomes chegam quando o cadastro de cada profissional é salvo no Trinks."
            />
          ) : (
            <div className="rounded-lg border border-border bg-card shadow-xs overflow-auto max-h-[calc(100dvh-260px)] min-h-[420px]">
              <div className="relative" style={{ minWidth: GUTTER_W + columns.length * COL_MIN_W }}>
                {/* Cabeçalho: profissionais */}
                <div className="sticky top-0 z-20 flex border-b border-border bg-card">
                  <div className="sticky left-0 z-10 shrink-0 bg-card border-r border-border" style={{ width: GUTTER_W }} />
                  {columns.map(p => (
                    <div key={p.key} className="flex-1 px-3 py-2 border-r border-border last:border-r-0 min-w-0" style={{ minWidth: COL_MIN_W }}>
                      <div className="text-[13px] font-semibold text-foreground truncate">{cleanLabel(p.label)}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">{p.role ?? '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Corpo */}
                <div className="relative flex" style={{ height: hours.length * HOUR_PX }}>
                  <div className="sticky left-0 z-10 shrink-0 bg-card border-r border-border" style={{ width: GUTTER_W }}>
                    {hours.map(h => (
                      <div key={h} className="relative text-[11px] text-muted-foreground tabular-nums text-right pr-2" style={{ height: HOUR_PX }}>
                        <span className="relative -top-[7px]">{h > startHour ? `${h}h` : ''}</span>
                      </div>
                    ))}
                  </div>

                  {columns.map(p => {
                    const items = byColumn.get(p.key) ?? []
                    const lanes = layoutColumn(items)
                    return (
                      <div key={p.key} className="relative flex-1 border-r border-border last:border-r-0" style={{ minWidth: COL_MIN_W }}>
                        {hours.map(h => (
                          <div key={h} className="border-b border-border/70" style={{ height: HOUR_PX }}>
                            <div className="h-1/2 border-b border-dashed border-border/40" />
                          </div>
                        ))}
                        {items.map(a => {
                          const pos = lanes.get(a.id) ?? { lane: 0, lanes: 1 }
                          const y = top(a.starts_at)
                          const h = Math.max(top(a.ends_at) - y, 22)
                          return (
                            <AppointmentCard
                              key={a.id}
                              a={a}
                              style={{
                                top: y + 1,
                                height: h - 2,
                                left: `calc(${(pos.lane / pos.lanes) * 100}% + 3px)`,
                                width: `calc(${100 / pos.lanes}% - 6px)`,
                              }}
                              onOpenClient={() => openClient(a)}
                            />
                          )
                        })}
                      </div>
                    )
                  })}

                  {nowTop !== null && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
                    <div className="pointer-events-none absolute right-0 z-[5] flex items-center" style={{ top: nowTop, left: GUTTER_W - 4 }}>
                      <span className="w-2 h-2 rounded-full bg-danger-solid" />
                      <span className="flex-1 h-px bg-danger-solid" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <p className="text-[12px] text-muted-foreground">
            Último evento do Trinks: {dayTime(data?.last_event_at ?? null)}
            {data?.seed_generated_at && <> · carga de agendamentos futuros: {dayTime(data.seed_generated_at)}</>}
            {' '}· Ausências e bloqueios não chegam pelo Trinks e não aparecem aqui.
          </p>
        </div>
      </AdminPage>

      {client && <ClientDrawer client={client} onClose={() => setClient(null)} />}
    </AdminLayout>
  )
}

function AppointmentCard({ a, style, onOpenClient }: {
  a: AgendaAppointment
  style: React.CSSProperties
  onOpenClient: () => void
}) {
  const s = statusMeta(a.status)
  const compact = typeof style.height === 'number' && style.height < 44
  const name = titleCase(a.client_name ?? 'Cliente')
  const phone = a.client_phones?.split(' / ')[0] ?? null
  const wa = phone ? phone.replace(/\D/g, '') : ''

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={style}
          className={`absolute z-[1] overflow-hidden rounded-md border text-left pl-2.5 pr-1.5 py-1 hover:z-10 hover:shadow-md focus-visible:z-10 transition-shadow ${TONE_CARD[s.tone]}`}
        >
          <span className={`absolute left-0 top-0 bottom-0 w-1 ${TONE_BAR[s.tone]}`} aria-hidden />
          <span className="flex items-center gap-1 min-w-0">
            {a.is_new && (
              <span className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-foreground text-background text-[9px] font-bold" title="Cliente nova">N</span>
            )}
            <span className={`text-[12px] font-semibold text-foreground truncate ${a.status === 'Cancelado' ? 'line-through' : ''}`}>{name}</span>
            {a.notes && <MessageSquareText className="shrink-0 w-3 h-3 text-muted-foreground" aria-label="Tem observação" />}
          </span>
          {!compact && (
            <>
              <span className="block text-[11px] text-muted-foreground tabular-nums">{hhmm(a.starts_at)} – {hhmm(a.ends_at)}</span>
              <span className="block text-[11px] text-foreground/80 truncate">{a.service ?? '—'}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${TONE_BAR[s.tone]}`} aria-hidden />
              <span className="text-[12px] font-medium text-muted-foreground">{s.label}</span>
              {a.is_new && <span className="text-[11px] font-semibold text-foreground">· Cliente nova</span>}
            </div>
            <div className="mt-1 text-[15px] font-semibold text-foreground">{name}</div>
            <div className="text-[13px] text-muted-foreground tabular-nums">
              {hhmm(a.starts_at)} – {hhmm(a.ends_at)} · {a.professional ? cleanLabel(a.professional) : '—'}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Serviço</dt><dd className="text-foreground">{a.service ?? '—'}</dd>
            <dt className="text-muted-foreground">Valor</dt><dd className="text-foreground tabular-nums">{brlCents(a.value)}</dd>
            {a.origin && <><dt className="text-muted-foreground">Origem</dt><dd className="text-foreground">{a.origin}</dd></>}
            {a.booked_at && <><dt className="text-muted-foreground">Marcado em</dt><dd className="text-foreground">{dayTime(a.booked_at)}</dd></>}
            {a.cancelled_at && <><dt className="text-muted-foreground">Cancelado em</dt><dd className="text-foreground">{dayTime(a.cancelled_at)}</dd></>}
            {(a.client_tags || a.appointment_tags) && (
              <><dt className="text-muted-foreground">Etiquetas</dt>
                <dd className="text-foreground">{[a.client_tags, a.appointment_tags].filter(Boolean).join(' / ')}</dd></>
            )}
          </dl>
          {a.notes && (
            <p className="text-[12.5px] text-foreground bg-muted rounded-md px-2.5 py-2 whitespace-pre-line">{a.notes}</p>
          )}
          {a.source === 'seed' && (
            <p className="text-[11.5px] text-muted-foreground">
              Veio da carga de agendamentos futuros: ainda não houve evento do Trinks para este horário.
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          {wa.length >= 10 && (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`https://wa.me/55${wa.replace(/^55/, '')}`} target="_blank" rel="noreferrer">
                <Phone className="w-3.5 h-3.5" /> WhatsApp
              </a>
            </Button>
          )}
          {a.client_key && (
            <Button variant="outline" size="sm" className="flex-1" onClick={onOpenClient}>
              <UserRound className="w-3.5 h-3.5" /> Ficha no CRM
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
