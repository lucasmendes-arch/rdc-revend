import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader, MessageCircle, Phone, CalendarDays, Receipt, NotebookPen, BellOff, Bell } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import StyledSelect from '@/components/ui/styled-select'
import { EmptyState, PageLoading, PageTabs } from '@/components/admin/ui/AdminPage'
import { cn } from '@/lib/utils'
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
const APPT_VARIANT: Record<string, 'success' | 'danger' | 'neutral'> = {
  'Finalizado': 'success',
  'Cliente não compareceu': 'danger',
  'Cancelado': 'neutral',
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
    { label: 'Última visita', value: client.last_visit ? daysLabel(client.days_since_last_visit) : 'Nunca veio' },
    { label: 'Faltas', value: `${client.no_shows}`, danger: client.no_shows >= 2 },
  ]

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 gap-0 flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start gap-3 pr-8">
            <span className="w-10 h-10 rounded-full bg-brand-subtle text-brand-strong ring-1 ring-inset ring-brand-border flex items-center justify-center text-[13px] font-semibold shrink-0" aria-hidden>
              {initials(client.name)}
            </span>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-[17px] truncate">{client.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[12px]">
                  <StatusBadge status={client.status} />
                  <span>{client.store_name}</span>
                  {client.registered_on && <span>· Cliente desde {fmtDate(client.registered_on)}</span>}
                </div>
              </SheetDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {phone ? (
              // Verde WhatsApp: exceção de marca documentada (design-tokens §8).
              <Button asChild size="sm" className="bg-success-solid text-white hover:bg-success-solid/90">
                <a href={`https://wa.me/${client.whatsapp}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> {phone}
                </a>
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Phone className="w-3.5 h-3.5" /> {client.phone ?? 'Sem telefone'}
              </span>
            )}
            {client.whatsapp && (
              <Button variant="secondary" size="sm" onClick={toggleOptOut}>
                {optedOut ? <Bell /> : <BellOff />}
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
                <Badge variant="neutral" className="max-w-full">
                  <span className="truncate">
                    Costuma fazer {client.favorite_service}{client.favorite_professional ? ` com ${client.favorite_professional}` : ''}
                  </span>
                </Badge>
              )}
              {client.birth_date && (
                <Badge variant="neutral">
                  Aniversário {new Date(`${client.birth_date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </Badge>
              )}
              {client.tags?.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
            </div>
          )}
        </div>

        {/* Números */}
        <dl className="grid grid-cols-3 border-b border-border">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={cn('px-4 py-3 min-w-0', i % 3 !== 2 && 'border-r border-border', i < 3 && 'border-b border-border')}
            >
              <dt className="text-[12px] text-muted-foreground truncate">{k.label}</dt>
              <dd className={cn('text-[15px] font-semibold tabular-nums mt-0.5 truncate', k.danger ? 'text-danger' : 'text-foreground')}>
                {k.value}
              </dd>
            </div>
          ))}
        </dl>

        {upcoming.length > 0 && (
          <div className="px-5 py-2.5 border-b border-border bg-info-subtle text-[12px] text-info">
            Já tem horário marcado: {upcoming.map(a => `${fmtDate(a.date)} · ${a.service}`).join(', ')}
          </div>
        )}

        {/* Abas */}
        <div className="px-3.5 border-b border-border">
          <PageTabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'visitas', label: 'Visitas', icon: Receipt, count: data?.visits.length },
              { key: 'agendamentos', label: 'Agendamentos', icon: CalendarDays, count: data?.appointments.length },
              { key: 'contatos', label: 'Contatos', icon: NotebookPen, count: data?.contacts.length },
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading || !data ? (
            <PageLoading />
          ) : tab === 'visitas' ? (
            data.visits.length === 0 ? (
              <EmptyState icon={Receipt} title="Nenhuma visita registrada" description="Nenhuma comanda paga no Trinks para esta cliente." className="py-10" />
            ) : (
              <ol className="space-y-3">
                {data.visits.map((v, i) => (
                  <li key={i} className="rounded-lg border border-border p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-foreground tabular-nums">{fmtDate(v.date)}</span>
                      <span className="text-[13px] font-semibold text-foreground tabular-nums">{brlCents(v.total)}</span>
                    </div>
                    {v.items?.length ? (
                      <ul className="mt-2 space-y-1">
                        {v.items.map((it, j) => (
                          <li key={j} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                            <span className="text-foreground min-w-0 truncate">
                              <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', it.type === 'produto' ? 'bg-ink-400' : 'bg-brand')} aria-hidden />
                              {it.name}
                              {it.professional && <span className="text-muted-foreground"> · {it.professional}</span>}
                            </span>
                            <span className="text-muted-foreground tabular-nums shrink-0">{brlCents(it.value)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[12px] text-muted-foreground tabular-nums">
                        Serviços {brlCents(v.services)} · Produtos {brlCents(v.products)}
                      </p>
                    )}
                    {(v.payment || v.discount > 0) && (
                      <p className="mt-2 text-[12px] text-muted-foreground">
                        {[v.payment, v.discount > 0 ? `Desconto ${brlCents(v.discount)}${v.discount_reason ? ` (${v.discount_reason})` : ''}` : null]
                          .filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )
          ) : tab === 'agendamentos' ? (
            data.appointments.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nenhum agendamento registrado" className="py-10" />
            ) : (
              <ul className="divide-y divide-border">
                {data.appointments.map((a, i) => (
                  <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-foreground truncate">{a.service ?? 'Serviço'}</p>
                      <p className="text-[12px] text-muted-foreground tabular-nums">
                        {fmtDate(a.date)}{a.starts_at ? ` ${new Date(a.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        {a.professional ? ` · ${a.professional}` : ''}{a.origin && a.origin !== 'Estabelecimento' ? ` · via ${a.origin}` : ''}
                      </p>
                    </div>
                    <Badge variant={APPT_VARIANT[a.status] ?? 'info'} className="shrink-0 whitespace-nowrap">{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block min-w-0">
                    <span className="block text-[12px] font-medium text-muted-foreground mb-1">Canal</span>
                    <StyledSelect value={channel} onChange={setChannel} options={CHANNELS} />
                  </label>
                  <label className="block min-w-0">
                    <span className="block text-[12px] font-medium text-muted-foreground mb-1">Resultado</span>
                    <StyledSelect value={outcome} onChange={setOutcome} options={OUTCOMES} />
                  </label>
                </div>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anotação (opcional)"
                  className="min-h-[64px]"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveContact} disabled={saving}>
                    {saving && <Loader className="animate-spin" />} Registrar contato
                  </Button>
                </div>
              </div>
              {data.contacts.length === 0 ? (
                <p className="text-[13px] text-muted-foreground text-center py-6">Nenhum contato registrado ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.contacts.map(k => (
                    <li key={k.id} className="py-2.5">
                      <p className="text-[13px] text-foreground">
                        {channelLabel(k.channel)}{k.outcome ? ` · ${outcomeLabel(k.outcome)}` : ''}
                        {k.campaign && <span className="text-muted-foreground"> · campanha “{k.campaign}”</span>}
                      </p>
                      {k.note && <p className="text-[12.5px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{k.note}</p>}
                      <p className="text-[12px] text-ink-400 mt-0.5 tabular-nums">
                        {new Date(k.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
