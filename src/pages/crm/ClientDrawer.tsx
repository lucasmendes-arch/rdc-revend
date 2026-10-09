import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Loader, MessageCircle, Phone, CalendarDays, Receipt, NotebookPen, BellOff, Bell } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import StyledSelect from '@/components/ui/styled-select'
import { supabase } from '@/lib/supabase'
import {
  StatusBadge, brl, brlCents, daysLabel, fmtDate, fmtPhone, initials, type SalonClient,
} from './crmShared'

// Ficha da cliente: linha do tempo de visitas (com itens e profissional),
// agendamentos (com faltas) e contatos. Fonte: salon_crm_client_timeline.

interface Visit {
  date: string
  total: number
  services: number
  products: number
  discount: number
  discount_reason: string | null
  payment: string | null
  items: { name: string; type: 'servico' | 'produto' | 'pacote'; professional: string; value: number }[] | null
}
interface Appointment {
  date: string
  starts_at: string | null
  service: string | null
  category: string | null
  professional: string
  status: string
  value: number
  origin: string | null
}
interface Contact {
  id: string
  created_at: string
  channel: string
  outcome: string | null
  note: string | null
  campaign: string | null
}

// Mesma família de cor do status de agendamento em todo o CRM.
const APPT_TONE: Record<string, string> = {
  'Finalizado': 'text-success',
  'Cliente não compareceu': 'text-danger',
  'Cancelado': 'text-ink-500 line-through',
}

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'outro', label: 'Outro' },
]
const OUTCOMES = [
  { value: 'agendou', label: 'Agendou' },
  { value: 'vai_retornar', label: 'Vai retornar depois' },
  { value: 'sem_resposta', label: 'Sem resposta' },
  { value: 'nao_tem_interesse', label: 'Sem interesse' },
  { value: 'outro', label: 'Outro' },
]
const outcomeLabel = (v: string | null) => OUTCOMES.find(o => o.value === v)?.label ?? v ?? ''
const channelLabel = (v: string) => CHANNELS.find(c => c.value === v)?.label ?? v

type Tab = 'visitas' | 'agendamentos' | 'contatos'

export default function ClientDrawer({ client, onClose }: { client: SalonClient; onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('visitas')
  const [optedOut, setOptedOut] = useState(client.opted_out)
  const [channel, setChannel] = useState('whatsapp')
  const [outcome, setOutcome] = useState('sem_resposta')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { data, isLoading } = useQuery({
    queryKey: ['crm-timeline', client.store_id, client.client_key],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('salon_crm_client_timeline', {
        p_store_id: client.store_id, p_client_key: client.client_key,
      })
      if (error) throw error
      return data as { visits: Visit[]; appointments: Appointment[]; contacts: Contact[] }
    },
  })

  async function saveContact() {
    setSaving(true)
    const { error } = await supabase.from('salon_contacts').insert({
      store_id: client.store_id, client_key: client.client_key, channel, outcome, note: note.trim() || null,
    })
    setSaving(false)
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`)
    setNote('')
    toast.success('Contato registrado')
    qc.invalidateQueries({ queryKey: ['crm-timeline', client.store_id, client.client_key] })
  }

  // Ação de efeito imediato (como etapa/tag): não passa pelo botão de salvar.
  async function toggleOptOut() {
    if (!client.whatsapp) return
    const next = !optedOut
    const { error } = next
      ? await supabase.from('salon_opt_outs').insert({ whatsapp: client.whatsapp, reason: 'marcado na ficha', source: 'manual' })
      : await supabase.from('salon_opt_outs').delete().eq('whatsapp', client.whatsapp)
    if (error) return toast.error(`Não foi possível atualizar: ${error.message}`)
    setOptedOut(next)
    toast.success(next ? 'Não receberá campanhas' : 'Voltou a poder receber campanhas')
    qc.invalidateQueries({ queryKey: ['crm-clients'] })
  }

  const phone = fmtPhone(client.whatsapp)
  const upcoming = data?.appointments.filter(a => a.date > client.ref_date && a.status !== 'Cancelado') ?? []

  const kpis = [
    { label: 'Visitas', value: String(client.visits_count) },
    { label: 'Gasto total', value: brl(client.total_spent) },
    { label: 'Ticket médio', value: client.avg_ticket != null ? brl(client.avg_ticket) : '—' },
    { label: 'Ritmo', value: client.avg_interval_days ? `a cada ${Math.round(Number(client.avg_interval_days))}d` : '—' },
    { label: 'Última visita', value: client.last_visit ? daysLabel(client.days_since_last_visit) : 'nunca' },
    { label: 'Faltas', value: `${client.no_shows}`, danger: client.no_shows >= 2 },
  ]

  return (
    <>
      <div className="fixed inset-0 bg-ink-950/45 backdrop-blur-[2px] z-40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`Ficha de ${client.name}`}
        className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-card z-50 shadow-2xl flex flex-col border-l border-border animate-in fade-in duration-150"
      >
        {/* Cabeçalho */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-full bg-brand-subtle text-brand-strong ring-1 ring-inset ring-brand-border flex items-center justify-center text-[14px] font-semibold shrink-0" aria-hidden>
              {initials(client.name)}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground truncate">{client.name}</h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <StatusBadge status={client.status} />
                <span className="text-[12px] text-muted-foreground">{client.store_name}</span>
                {client.registered_on && (
                  <span className="text-[12px] text-muted-foreground">· cliente desde {fmtDate(client.registered_on)}</span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {phone ? (
              <Button asChild size="sm">
                <a href={`https://wa.me/${client.whatsapp}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-3.5 h-3.5" /> {phone}
                </a>
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Phone className="w-3.5 h-3.5" /> {client.phone ?? 'sem telefone'}
              </span>
            )}
            {client.whatsapp && (
              <Button variant="outline" size="sm" onClick={toggleOptOut}>
                {optedOut ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                {optedOut ? 'Voltar a receber campanhas' : 'Não enviar campanhas'}
              </Button>
            )}
          </div>
          {optedOut && (
            <p className="mt-2 text-[12px] text-danger">Pediu para não receber mensagens — fica fora de toda campanha.</p>
          )}

          {(client.tags?.length || client.birth_date || client.favorite_service) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {client.favorite_service && (
                <span className="h-6 px-2 inline-flex items-center rounded-full bg-muted text-[11px] text-ink-600">
                  Costuma fazer {client.favorite_service}{client.favorite_professional ? ` com ${client.favorite_professional}` : ''}
                </span>
              )}
              {client.birth_date && (
                <span className="h-6 px-2 inline-flex items-center rounded-full bg-muted text-[11px] text-ink-600">
                  Aniversário {new Date(`${client.birth_date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </span>
              )}
              {client.tags?.map(t => (
                <span key={t} className="h-6 px-2 inline-flex items-center rounded-full border border-border text-[11px] text-ink-600">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Números */}
        <div className="grid grid-cols-3 border-b border-border">
          {kpis.map((k, i) => (
            <div key={k.label} className={`px-4 py-3 ${i % 3 !== 2 ? 'border-r border-border' : ''} ${i < 3 ? 'border-b border-border' : ''}`}>
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className={`text-[15px] font-semibold numeric mt-0.5 ${k.danger ? 'text-danger' : 'text-foreground'}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {upcoming.length > 0 && (
          <div className="px-5 py-2.5 border-b border-border bg-info-subtle text-[12px] text-info">
            Já tem horário marcado: {upcoming.map(a => `${fmtDate(a.date)} · ${a.service}`).join(', ')}
          </div>
        )}

        {/* Abas */}
        <div className="px-5 border-b border-border flex gap-5">
          {([
            ['visitas', 'Visitas', Receipt, data?.visits.length],
            ['agendamentos', 'Agendamentos', CalendarDays, data?.appointments.length],
            ['contatos', 'Contatos', NotebookPen, data?.contacts.length],
          ] as const).map(([key, label, Icon, n]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative h-10 inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors ${
                tab === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${tab === key ? 'text-brand-strong' : ''}`} />
              {label}
              {n != null && <span className="text-[11px] text-ink-400 numeric">{n}</span>}
              {tab === key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-ink-300" /></div>
          ) : tab === 'visitas' ? (
            data!.visits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhuma comanda paga registrada.</p>
            ) : (
              <ol className="space-y-3">
                {data!.visits.map((v, i) => (
                  <li key={i} className="rounded-lg border border-border p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{fmtDate(v.date)}</span>
                      <span className="text-[13px] font-semibold text-foreground numeric">{brlCents(v.total)}</span>
                    </div>
                    {v.items?.length ? (
                      <ul className="mt-2 space-y-1">
                        {v.items.map((it, j) => (
                          <li key={j} className="flex items-baseline justify-between gap-2 text-[12px]">
                            <span className="text-foreground truncate">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${it.type === 'produto' ? 'bg-ink-400' : 'bg-primary'}`} aria-hidden />
                              {it.name}
                              {it.professional && <span className="text-muted-foreground"> · {it.professional}</span>}
                            </span>
                            <span className="text-muted-foreground numeric shrink-0">{brlCents(it.value)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        Serviços {brlCents(v.services)} · Produtos {brlCents(v.products)}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {[v.payment, v.discount > 0 ? `desconto ${brlCents(v.discount)}${v.discount_reason ? ` (${v.discount_reason})` : ''}` : null]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ol>
            )
          ) : tab === 'agendamentos' ? (
            data!.appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhum agendamento registrado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data!.appointments.map((a, i) => (
                  <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-foreground truncate">{a.service ?? 'Serviço'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(a.date)}{a.starts_at ? ` ${new Date(a.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        {a.professional ? ` · ${a.professional}` : ''}{a.origin && a.origin !== 'Estabelecimento' ? ` · via ${a.origin}` : ''}
                      </p>
                    </div>
                    <span className={`text-[12px] font-medium shrink-0 ${APPT_TONE[a.status] ?? 'text-info'}`}>{a.status}</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="block text-[12px] font-medium text-ink-600 mb-1">Canal</span>
                    <StyledSelect value={channel} onChange={setChannel} options={CHANNELS} />
                  </label>
                  <label className="block">
                    <span className="block text-[12px] font-medium text-ink-600 mb-1">Resultado</span>
                    <StyledSelect value={outcome} onChange={setOutcome} options={OUTCOMES} />
                  </label>
                </div>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anotação (opcional)"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveContact} disabled={saving}>
                    {saving && <Loader className="w-3.5 h-3.5 animate-spin" />} Registrar contato
                  </Button>
                </div>
              </div>
              {data!.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum contato registrado ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data!.contacts.map(k => (
                    <li key={k.id} className="py-2.5">
                      <p className="text-[13px] text-foreground">
                        {channelLabel(k.channel)}{k.outcome ? ` · ${outcomeLabel(k.outcome)}` : ''}
                        {k.campaign && <span className="text-muted-foreground"> · campanha “{k.campaign}”</span>}
                      </p>
                      {k.note && <p className="text-[12px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{k.note}</p>}
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        {new Date(k.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
