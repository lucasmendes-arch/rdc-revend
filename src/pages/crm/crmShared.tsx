import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import StyledSelect from '@/components/ui/styled-select'

// ─────────────────────────────────────────────────────────────────────────────
// CRM dos salões — peças compartilhadas pelas telas Clientes, Segmentos e
// Campanhas. Dados: salon_clients_v e RPCs salon_crm_* (20261009000006).
// ─────────────────────────────────────────────────────────────────────────────

export type ClientStatus =
  | 'ativa' | 'nova' | 'em_risco' | 'sumida' | 'uma_visita' | 'perdida' | 'sem_compra'

export interface SalonClient {
  store_id: string
  store_name: string
  client_key: string
  name: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  gender: string | null
  birth_date: string | null
  registered_on: string | null
  tags: string[] | null
  origin: string | null
  visits_count: number
  first_visit: string | null
  last_visit: string | null
  total_spent: number
  services_spent: number
  products_spent: number
  avg_ticket: number | null
  avg_interval_days: number | null
  appointments_count: number
  no_shows: number
  cancellations: number
  last_appointment_on: string | null
  last_appointment_status: string | null
  next_appointment_on: string | null
  favorite_service: string | null
  favorite_professional: string | null
  days_since_last_visit: number | null
  status: ClientStatus
  opted_out: boolean
  last_campaign_at: string | null
  ref_date: string
}

/** Filtros aceitos por salon_crm_filter (mesmas chaves do SQL). */
export interface CrmFilters {
  store_id?: string | null
  statuses?: ClientStatus[]
  search?: string
  days_since_min?: number | null
  days_since_max?: number | null
  visits_min?: number | null
  visits_max?: number | null
  spent_min?: number | null
  ticket_min?: number | null
  only_products?: boolean
  tags_any?: string[]
  birthday?: 'this_month' | 'next_month' | 'next_7_days' | null
  favorite_service?: string | null
  favorite_professional?: string | null
  no_shows_min?: number | null
  has_whatsapp?: boolean
  exclude_future_appointment?: boolean
}

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

/**
 * Situação → rótulo, explicação e cor. A cor é fixa por situação e vale em
 * toda tela (cards, badge, select): "sumida" é sempre vermelha.
 */
export const STATUS_META: Record<ClientStatus, { label: string; hint: string; tone: Tone }> = {
  ativa:      { label: 'Ativas',          hint: 'dentro do próprio ritmo de visitas',     tone: 'success' },
  nova:       { label: 'Novas',           hint: 'primeira visita nos últimos 30 dias',    tone: 'info' },
  em_risco:   { label: 'Em risco',        hint: 'passaram 1,5× do ritmo habitual',        tone: 'warning' },
  sumida:     { label: 'Sumidas',         hint: 'passaram 2,5× do ritmo, até 1 ano',      tone: 'danger' },
  uma_visita: { label: 'Vieram uma vez',  hint: 'uma visita, entre 1 mês e 1 ano atrás',  tone: 'neutral' },
  perdida:    { label: 'Perdidas',        hint: 'mais de 1 ano sem vir',                  tone: 'neutral' },
  sem_compra: { label: 'Nunca compraram', hint: 'cadastro ou agendamento, sem comanda',   tone: 'neutral' },
}

export const STATUS_ORDER: ClientStatus[] = ['ativa', 'nova', 'em_risco', 'sumida', 'uma_visita', 'perdida', 'sem_compra']

export const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success-solid',
  info: 'bg-info-solid',
  warning: 'bg-warning-solid',
  danger: 'bg-danger-solid',
  neutral: 'bg-ink-400',
}

const TONE_BADGE: Record<Tone, string> = {
  success: 'bg-success-subtle text-success border-success-border',
  info: 'bg-info-subtle text-info border-info-border',
  warning: 'bg-warning-subtle text-warning border-warning-border',
  danger: 'bg-danger-subtle text-danger border-danger-border',
  neutral: 'bg-muted text-ink-600 border-border',
}

export function StatusBadge({ status }: { status: ClientStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full border text-[11px] font-medium whitespace-nowrap ${TONE_BADGE[m.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[m.tone]}`} aria-hidden />
      {m.label.replace(/s$/, '').replace('Vieram uma vez', 'Veio uma vez').replace('Nunca compraram', 'Nunca comprou')}
    </span>
  )
}

// ── Formatação ───────────────────────────────────────────────────────────────

export const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export const brlCents = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export const fmtPhone = (whatsapp: string | null) => {
  if (!whatsapp) return null
  const d = whatsapp.replace(/^55/, '')
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : whatsapp
}

export const daysLabel = (d: number | null) =>
  d === null ? '—' : d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')

/** Tira chaves vazias para o SQL tratar como "sem filtro". */
export function cleanFilters(f: CrmFilters): CrmFilters {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === null || v === undefined || v === '' || v === false) continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out as CrmFilters
}

// ── Dados ────────────────────────────────────────────────────────────────────

export interface CrmUnit { store_id: string; name: string }

/** Unidades com dados do Trinks (as que o CRM cobre). */
export function useCrmUnits() {
  return useQuery({
    queryKey: ['crm-units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trinks_units')
        .select('store_id, display_name, stores(name)')
        .eq('active', true)
      if (error) throw error
      return (data as unknown as { store_id: string; display_name: string; stores: { name: string } | null }[])
        .map(u => ({ store_id: u.store_id, name: u.stores?.name ?? u.display_name }))
        .sort((a, b) => a.name.localeCompare(b.name)) as CrmUnit[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export async function searchClients(filters: CrmFilters, sort: string, limit: number, offset: number) {
  const { data, error } = await supabase.rpc('salon_crm_search', {
    p_filters: cleanFilters(filters), p_sort: sort, p_limit: limit, p_offset: offset,
  })
  if (error) throw error
  return data as { total: number; with_whatsapp: number; rows: SalonClient[] }
}

export async function statusCounts(filters: CrmFilters) {
  const { data, error } = await supabase.rpc('salon_crm_status_counts', { p_filters: cleanFilters(filters) })
  if (error) throw error
  return (data ?? {}) as Partial<Record<ClientStatus, number>>
}

// ── Formulário de filtros (Clientes e Segmentos) ─────────────────────────────

const numberOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

function NumField({ label, value, onChange, suffix }: {
  label: string; value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-ink-600 mb-1">{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value ?? ''}
          onChange={e => onChange(numberOrNull(e.target.value))}
          className="w-full h-9 px-3 pr-12 rounded-md border border-input bg-background text-base md:text-sm text-foreground hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 numeric"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-400">{suffix}</span>}
      </span>
    </label>
  )
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      <span>
        <span className="block text-[13px] text-foreground">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * Filtros avançados. `showStatus` liga a escolha de situação (Segmentos);
 * em Clientes a situação é escolhida pelos cards do topo.
 */
export function FilterForm({ value, onChange, units, showStatus = false, showUnit = true }: {
  value: CrmFilters
  onChange: (f: CrmFilters) => void
  units: CrmUnit[]
  showStatus?: boolean
  showUnit?: boolean
}) {
  const set = <K extends keyof CrmFilters>(k: K, v: CrmFilters[K]) => onChange({ ...value, [k]: v })
  const statuses = value.statuses ?? []

  return (
    <div className="space-y-4">
      {showUnit && (
        <label className="block">
          <span className="block text-[12px] font-medium text-ink-600 mb-1">Unidade</span>
          <StyledSelect
            value={value.store_id ?? 'all'}
            onChange={v => set('store_id', v === 'all' ? null : v)}
            options={[{ value: 'all', label: 'Todas as unidades' }, ...units.map(u => ({ value: u.store_id, label: u.name }))]}
          />
        </label>
      )}

      {showStatus && (
        <div>
          <span className="block text-[12px] font-medium text-ink-600 mb-1.5">Situação</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map(s => {
              const on = statuses.includes(s)
              const m = STATUS_META[s]
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('statuses', on ? statuses.filter(x => x !== s) : [...statuses, s])}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                    on ? 'bg-brand-subtle text-brand-strong ring-1 ring-inset ring-brand-border' : 'border border-border text-ink-600 hover:bg-muted'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[m.tone]}`} aria-hidden />
                  {m.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">Nenhuma marcada = todas as situações.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <NumField label="Sem vir há pelo menos" suffix="dias" value={value.days_since_min} onChange={v => set('days_since_min', v)} />
        <NumField label="Sem vir há no máximo" suffix="dias" value={value.days_since_max} onChange={v => set('days_since_max', v)} />
        <NumField label="Visitas, no mínimo" value={value.visits_min} onChange={v => set('visits_min', v)} />
        <NumField label="Visitas, no máximo" value={value.visits_max} onChange={v => set('visits_max', v)} />
        <NumField label="Gasto total a partir de" suffix="R$" value={value.spent_min} onChange={v => set('spent_min', v)} />
        <NumField label="Faltas, no mínimo" value={value.no_shows_min} onChange={v => set('no_shows_min', v)} />
      </div>

      <label className="block">
        <span className="block text-[12px] font-medium text-ink-600 mb-1">Aniversário</span>
        <StyledSelect
          value={value.birthday ?? 'none'}
          onChange={v => set('birthday', v === 'none' ? null : (v as CrmFilters['birthday']))}
          options={[
            { value: 'none', label: 'Qualquer data' },
            { value: 'next_7_days', label: 'Nos próximos 7 dias' },
            { value: 'this_month', label: 'Neste mês' },
            { value: 'next_month', label: 'No mês que vem' },
          ]}
        />
      </label>

      <div className="space-y-2.5 pt-1">
        <Toggle label="Só compram produto" hint="nunca fizeram serviço na unidade"
          checked={!!value.only_products} onChange={v => set('only_products', v)} />
        <Toggle label="Com WhatsApp válido" hint="necessário para entrar em campanha"
          checked={!!value.has_whatsapp} onChange={v => set('has_whatsapp', v)} />
        <Toggle label="Sem horário marcado" hint="tira quem já tem agendamento futuro"
          checked={!!value.exclude_future_appointment} onChange={v => set('exclude_future_appointment', v)} />
      </div>
    </div>
  )
}

/** Resumo legível dos filtros (lista de segmentos, cabeçalho de campanha). */
export function describeFilters(f: CrmFilters, units: CrmUnit[] = []): string {
  const parts: string[] = []
  if (f.store_id) parts.push(units.find(u => u.store_id === f.store_id)?.name ?? 'uma unidade')
  if (f.statuses?.length) parts.push(f.statuses.map(s => STATUS_META[s].label.toLowerCase()).join(' ou '))
  if (f.days_since_min != null) parts.push(`${f.days_since_min}+ dias sem vir`)
  if (f.days_since_max != null) parts.push(`até ${f.days_since_max} dias sem vir`)
  if (f.visits_min != null) parts.push(`${f.visits_min}+ visitas`)
  if (f.visits_max != null) parts.push(`até ${f.visits_max} visitas`)
  if (f.spent_min != null) parts.push(`gasto ≥ ${brl(f.spent_min)}`)
  if (f.no_shows_min != null) parts.push(`${f.no_shows_min}+ faltas`)
  if (f.only_products) parts.push('só produto')
  if (f.birthday) parts.push({ this_month: 'aniversário no mês', next_month: 'aniversário mês que vem', next_7_days: 'aniversário em 7 dias' }[f.birthday])
  if (f.has_whatsapp) parts.push('com WhatsApp')
  if (f.exclude_future_appointment) parts.push('sem horário marcado')
  return parts.length ? parts.join(' · ') : 'Todas as clientes'
}

/** Variáveis aceitas na mensagem (salon_render_message). */
export const MESSAGE_VARIABLES = [
  { key: '{primeiro_nome}', label: 'Primeiro nome' },
  { key: '{nome}', label: 'Nome completo' },
  { key: '{unidade}', label: 'Unidade' },
  { key: '{dias_sem_vir}', label: 'Dias sem vir' },
  { key: '{servico_favorito}', label: 'Serviço favorito' },
  { key: '{profissional_favorita}', label: 'Profissional favorita' },
]

/** Mesma renderização do SQL, para a prévia na tela. */
export function renderMessage(template: string, c: Partial<SalonClient>) {
  const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase())
  const name = (c.name ?? 'Maria Silva').trim()
  return template
    .split('{primeiro_nome}').join(cap(name.split(/\s+/)[0]))
    .split('{nome}').join(cap(name))
    .split('{unidade}').join(c.store_name ?? '')
    .split('{dias_sem_vir}').join(c.days_since_last_visit != null ? String(c.days_since_last_visit) : '')
    .split('{servico_favorito}').join(c.favorite_service ?? 'seu cabelo')
    .split('{profissional_favorita}').join(c.favorite_professional ?? 'nossa equipe')
}
