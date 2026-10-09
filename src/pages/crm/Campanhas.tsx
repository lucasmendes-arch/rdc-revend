import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, Loader, Megaphone, X, ListChecks, PowerOff, Settings2, Ban, ChevronRight, MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { Button } from '@/components/ui/button'
import StyledSelect from '@/components/ui/styled-select'
import { supabase } from '@/lib/supabase'
import {
  MESSAGE_VARIABLES, describeFilters, fmtPhone, renderMessage, searchClients, useCrmUnits,
  type CrmFilters, type CrmUnit,
} from './crmShared'
import { useSegments, type Segment } from './Segmentos'

// Campanhas do CRM: público + mensagem + unidade, com a lista de destinatárias
// congelada por salon_campaign_build_list (travas: WhatsApp válido, opt-out,
// intervalo mínimo entre campanhas, telefone único). O DISPARO NÃO EXISTE
// ainda: salon_crm_settings.dispatch_enabled = false e nada aqui envia
// mensagem.

type CampaignStatus = 'rascunho' | 'pronta' | 'enviando' | 'pausada' | 'concluida' | 'cancelada'

interface Campaign {
  id: string
  name: string
  store_id: string
  segment_id: string | null
  filters: CrmFilters
  message: string
  status: CampaignStatus
  recipients_count: number
  excluded: Record<string, number> | null
  list_built_at: string | null
  created_at: string
}

interface Settings {
  send_weekdays: number[]
  window_start: string
  window_end: string
  daily_cap_per_number: number
  min_interval_seconds: number
  max_interval_seconds: number
  cooldown_days: number
  dispatch_enabled: boolean
}

const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; cls: string }> = {
  rascunho:  { label: 'Rascunho',  cls: 'bg-muted text-ink-600 border-border' },
  pronta:    { label: 'Lista pronta', cls: 'bg-info-subtle text-info border-info-border' },
  enviando:  { label: 'Enviando',  cls: 'bg-warning-subtle text-warning border-warning-border' },
  pausada:   { label: 'Pausada',   cls: 'bg-muted text-ink-600 border-border' },
  concluida: { label: 'Concluída', cls: 'bg-success-subtle text-success border-success-border' },
  cancelada: { label: 'Cancelada', cls: 'bg-danger-subtle text-danger border-danger-border' },
}

const EXCLUDED_LABEL: Record<string, string> = {
  sem_whatsapp: 'sem WhatsApp válido',
  pediu_para_sair: 'pediram para não receber',
  recebeu_recentemente: 'receberam campanha há pouco',
  telefone_repetido: 'telefone repetido',
}

const WEEKDAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

// Horários de meia em meia hora (sem input de hora nativo — padrão do projeto).
const HALF_HOURS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
).map(t => ({ value: t, label: t }))

function CampaignBadge({ status }: { status: CampaignStatus }) {
  const m = CAMPAIGN_STATUS[status]
  return <span className={`inline-flex items-center h-5 px-2 rounded-full border text-[11px] font-medium ${m.cls}`}>{m.label}</span>
}

function useSettings() {
  return useQuery({
    queryKey: ['crm-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('salon_crm_settings').select('*').eq('id', 1).single()
      if (error) throw error
      return data as Settings
    },
  })
}

function rulesText(s: Settings) {
  const days = s.send_weekdays.slice().sort().map(d => WEEKDAYS[d]).join(', ')
  return `${days} · ${s.window_start.slice(0, 5)}–${s.window_end.slice(0, 5)} · até ${s.daily_cap_per_number}/dia por número · uma a cada ${Math.round(s.min_interval_seconds / 60)}–${Math.round(s.max_interval_seconds / 60)} min · mesma cliente no máximo a cada ${s.cooldown_days} dias`
}

// ── Aviso fixo: disparo desligado ────────────────────────────────────────────
function DispatchOffBanner({ settings, onEdit }: { settings?: Settings; onEdit: () => void }) {
  return (
    <div className="surface-card p-4 flex items-start gap-3">
      <span className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <PowerOff className="w-4 h-4 text-ink-500" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">Disparo automático ainda não está ativo</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Aqui você monta campanhas e gera a lista de quem receberia. Nenhuma mensagem é enviada.
          Quando o disparo for ligado, ele sai pelo WhatsApp de cada unidade com estas regras:
        </p>
        {settings && <p className="text-[12px] text-foreground mt-1.5">{rulesText(settings)}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-3.5 h-3.5" /> Regras</Button>
    </div>
  )
}

// ── Regras de envio ──────────────────────────────────────────────────────────
function SettingsDialog({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (form.min_interval_seconds > form.max_interval_seconds) return toast.error('O intervalo mínimo é maior que o máximo')
    if (form.window_start.slice(0, 5) >= form.window_end.slice(0, 5)) return toast.error('O horário de início tem de ser antes do fim')
    setSaving(true)
    const { dispatch_enabled: _d, ...rest } = form
    const { error } = await supabase.from('salon_crm_settings')
      .update({ ...rest, updated_at: new Date().toISOString() }).eq('id', 1)
    setSaving(false)
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`)
    toast.success('Regras salvas')
    qc.invalidateQueries({ queryKey: ['crm-settings'] })
    onClose()
  }

  const input = 'w-full h-9 px-3 rounded-md border border-input bg-background text-base md:text-sm text-foreground hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring numeric'

  return (
    <Modal title="Regras de envio" onClose={onClose} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader className="w-4 h-4 animate-spin" />} Salvar alterações</Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <span className="block text-[12px] font-medium text-ink-600 mb-1.5">Dias de envio</span>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map(d => {
              const on = form.send_weekdays.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on}
                  onClick={() => set('send_weekdays', on ? form.send_weekdays.filter(x => x !== d) : [...form.send_weekdays, d])}
                  className={`h-8 w-11 rounded-md text-[12px] font-medium transition-colors ${on ? 'bg-brand-subtle text-brand-strong ring-1 ring-inset ring-brand-border' : 'border border-border text-ink-600 hover:bg-muted'}`}
                >{WEEKDAYS[d]}</button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-[12px] font-medium text-ink-600 mb-1">Começa às</span>
            <StyledSelect value={form.window_start.slice(0, 5)} onChange={v => set('window_start', v)} options={HALF_HOURS} /></label>
          <label className="block"><span className="block text-[12px] font-medium text-ink-600 mb-1">Termina às</span>
            <StyledSelect value={form.window_end.slice(0, 5)} onChange={v => set('window_end', v)} options={HALF_HOURS} /></label>
          <label className="block"><span className="block text-[12px] font-medium text-ink-600 mb-1">Máximo por número por dia</span>
            <input type="number" min={1} value={form.daily_cap_per_number} onChange={e => set('daily_cap_per_number', Number(e.target.value))} className={input} /></label>
          <label className="block"><span className="block text-[12px] font-medium text-ink-600 mb-1">Mesma cliente no máximo a cada (dias)</span>
            <input type="number" min={0} value={form.cooldown_days} onChange={e => set('cooldown_days', Number(e.target.value))} className={input} /></label>
          <label className="block"><span className="block text-[12px] font-medium text-ink-600 mb-1">Intervalo mínimo entre mensagens (min)</span>
            <input type="number" min={1} value={Math.round(form.min_interval_seconds / 60)} onChange={e => set('min_interval_seconds', Number(e.target.value) * 60)} className={input} /></label>
          <label className="block"><span className="block text-[12px] font-medium text-ink-600 mb-1">Intervalo máximo entre mensagens (min)</span>
            <input type="number" min={1} value={Math.round(form.max_interval_seconds / 60)} onChange={e => set('max_interval_seconds', Number(e.target.value) * 60)} className={input} /></label>
        </div>
        <p className="text-[12px] text-muted-foreground">
          O WhatsApp usado é o de cada unidade (cadastrado na integração da loja). O envio continua desligado.
        </p>
      </div>
    </Modal>
  )
}

// ── Modal genérico (padrão do design: overlay com blur, entrada em fade) ─────
function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label={title} className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] bg-card rounded-xl border border-border shadow-2xl flex flex-col animate-in fade-in zoom-in-[0.98] duration-150`}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar"><X className="w-4 h-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ── Editor de campanha (criar/editar enquanto rascunho ou lista pronta) ──────
function CampaignEditor({ initial, segments, units, onClose, onSaved }: {
  initial: Partial<Campaign>
  segments: Segment[]
  units: CrmUnit[]
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [name, setName] = useState(initial.name ?? '')
  const [storeId, setStoreId] = useState(initial.store_id ?? units[0]?.store_id ?? '')
  const [segmentId, setSegmentId] = useState(initial.segment_id ?? segments[0]?.id ?? '')
  const [message, setMessage] = useState(initial.message ?? 'Oi, {primeiro_nome}! Tudo bem? Faz {dias_sem_vir} dias que você não passa aqui no Rei dos Cachos {unidade} e a gente sentiu sua falta. Que tal agendar seu {servico_favorito}? 💛')
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const segment = segments.find(s => s.id === segmentId)
  // O público da campanha é sempre o do segmento, restrito à unidade escolhida.
  const filters: CrmFilters = { ...(segment?.filters ?? {}), store_id: storeId || null, has_whatsapp: true }

  const { data: sample, isFetching } = useQuery({
    queryKey: ['crm-campaign-sample', filters],
    queryFn: () => searchClients(filters, 'days_since_desc', 1, 0),
    enabled: !!storeId && !!segment,
  })

  function insertVar(v: string) {
    const el = textRef.current
    if (!el) return setMessage(m => m + v)
    const { selectionStart: a, selectionEnd: b } = el
    setMessage(m => m.slice(0, a) + v + m.slice(b))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + v.length, a + v.length) })
  }

  async function save() {
    if (!name.trim()) return toast.error('Dê um nome à campanha')
    if (!storeId) return toast.error('Escolha a unidade que vai enviar')
    if (!segment) return toast.error('Escolha o público')
    if (!message.trim()) return toast.error('Escreva a mensagem')
    setSaving(true)
    const payload = {
      name: name.trim(), store_id: storeId, segment_id: segment.id, filters: segment.filters,
      message: message.trim(), updated_at: new Date().toISOString(),
    }
    const res = initial.id
      ? await supabase.from('salon_campaigns').update({ ...payload, status: 'rascunho', recipients_count: 0, list_built_at: null })
          .eq('id', initial.id).select('id').single()
      : await supabase.from('salon_campaigns').insert(payload).select('id').single()
    setSaving(false)
    if (res.error) return toast.error(`Não foi possível salvar: ${res.error.message}`)
    if (initial.id) await supabase.from('salon_campaign_recipients').delete().eq('campaign_id', initial.id)
    toast.success(initial.id ? 'Campanha atualizada — gere a lista de novo' : 'Campanha criada')
    onSaved(res.data.id)
  }

  const preview = sample?.rows[0]

  return (
    <Modal wide title={initial.id ? 'Editar campanha' : 'Nova campanha'} onClose={onClose} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader className="w-4 h-4 animate-spin" />} Salvar campanha</Button>
      </>
    }>
      <div className="grid md:grid-cols-[1fr_260px] gap-5">
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium text-ink-600 mb-1">Nome da campanha</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Reativação outubro — Linhares"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-base md:text-sm text-foreground hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[12px] font-medium text-ink-600 mb-1">Unidade que envia</span>
              <StyledSelect value={storeId} onChange={setStoreId} options={units.map(u => ({ value: u.store_id, label: u.name }))} />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-ink-600 mb-1">Público</span>
              <StyledSelect value={segmentId} onChange={setSegmentId} searchable options={segments.map(s => ({ value: s.id, label: s.name }))} />
            </label>
          </div>
          {segment && <p className="text-[12px] text-muted-foreground -mt-2">{describeFilters(segment.filters, units)}</p>}

          <div>
            <span className="block text-[12px] font-medium text-ink-600 mb-1">Mensagem</span>
            <textarea ref={textRef} value={message} onChange={e => setMessage(e.target.value)} rows={6}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-base md:text-sm text-foreground hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {MESSAGE_VARIABLES.map(v => (
                <button key={v.key} type="button" onClick={() => insertVar(v.key)}
                  className="h-7 px-2 rounded-md border border-border text-[11px] text-ink-600 hover:bg-muted transition-colors">
                  + {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[12px] font-medium text-ink-600">Quem entraria hoje</p>
            <p className="text-[26px] font-semibold tracking-tight text-foreground numeric mt-1 flex items-center gap-2">
              {(sample?.total ?? 0).toLocaleString('pt-BR')}
              {isFetching && <Loader className="w-3.5 h-3.5 animate-spin text-ink-300" />}
            </p>
            <p className="text-[11px] text-muted-foreground">com WhatsApp, antes das travas de envio</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-[12px] font-medium text-ink-600 mb-2 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Como chega {preview ? `para ${preview.name.split(' ')[0]}` : ''}
            </p>
            <p className="text-[13px] text-foreground whitespace-pre-wrap rounded-lg bg-success-subtle border border-success-border px-3 py-2">
              {renderMessage(message, preview ?? { store_name: units.find(u => u.store_id === storeId)?.name, days_since_last_visit: 60 })}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Detalhe da campanha ──────────────────────────────────────────────────────
function CampaignDetail({ campaign, units, onClose, onEdit }: {
  campaign: Campaign; units: CrmUnit[]; onClose: () => void; onEdit: () => void
}) {
  const qc = useQueryClient()
  const [building, setBuilding] = useState(false)

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ['crm-recipients', campaign.id, campaign.list_built_at],
    queryFn: async () => {
      const { data, error } = await supabase.from('salon_campaign_recipients')
        .select('id, name, whatsapp, message, status').eq('campaign_id', campaign.id).order('name').limit(300)
      if (error) throw error
      return data as { id: string; name: string; whatsapp: string; message: string; status: string }[]
    },
    enabled: !!campaign.list_built_at,
  })

  async function buildList() {
    setBuilding(true)
    const { error } = await supabase.rpc('salon_campaign_build_list', { p_campaign_id: campaign.id })
    setBuilding(false)
    if (error) return toast.error(`Não foi possível gerar a lista: ${error.message}`)
    toast.success('Lista gerada')
    qc.invalidateQueries({ queryKey: ['crm-campaigns'] })
  }

  async function cancel() {
    if (!window.confirm('Cancelar esta campanha? A lista fica guardada, mas ela não poderá ser enviada.')) return
    const { error } = await supabase.from('salon_campaigns').update({ status: 'cancelada', updated_at: new Date().toISOString() }).eq('id', campaign.id)
    if (error) return toast.error(error.message)
    qc.invalidateQueries({ queryKey: ['crm-campaigns'] })
    onClose()
  }

  const editable = campaign.status === 'rascunho' || campaign.status === 'pronta'
  const unitName = units.find(u => u.store_id === campaign.store_id)?.name ?? ''
  const excluded = Object.entries(campaign.excluded ?? {}).filter(([, n]) => n > 0)

  return (
    <Modal wide title={campaign.name} onClose={onClose} footer={
      <>
        {editable && <Button variant="ghost" onClick={cancel} className="mr-auto text-danger"><Ban className="w-4 h-4" /> Cancelar campanha</Button>}
        {editable && <Button variant="outline" onClick={onEdit}>Editar</Button>}
        {editable && (
          <Button onClick={buildList} disabled={building}>
            {building ? <Loader className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
            {campaign.list_built_at ? 'Refazer lista' : 'Gerar lista'}
          </Button>
        )}
      </>
    }>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <CampaignBadge status={campaign.status} />
          <span>Sai pelo WhatsApp de {unitName}</span>
          <span>· {describeFilters(campaign.filters, units)}</span>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-[12px] font-medium text-ink-600 mb-1.5">Mensagem</p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{campaign.message}</p>
        </div>

        {!campaign.list_built_at ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-[13px] text-foreground font-medium">A lista ainda não foi gerada</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              "Gerar lista" congela quem receberia a mensagem agora, já aplicando as travas de envio.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">Na lista</p>
                <p className="text-[20px] font-semibold text-foreground numeric">{campaign.recipients_count.toLocaleString('pt-BR')}</p>
              </div>
              {excluded.map(([k, n]) => (
                <div key={k} className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Fora: {EXCLUDED_LABEL[k] ?? k}</p>
                  <p className="text-[20px] font-semibold text-ink-500 numeric">{n.toLocaleString('pt-BR')}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lista gerada em {new Date(campaign.list_built_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.
              {campaign.recipients_count > 300 ? ' Mostrando as primeiras 300.' : ''}
            </p>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-ink-300" /></div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {recipients.map(r => (
                  <li key={r.id} className="px-3.5 py-2.5">
                    <p className="text-[13px] text-foreground flex items-center justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="text-[12px] text-muted-foreground numeric shrink-0">{fmtPhone(r.whatsapp)}</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function CrmCampanhas() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { data: units = [] } = useCrmUnits()
  const { data: segments = [] } = useSegments()
  const { data: settings } = useSettings()

  const [editor, setEditor] = useState<Partial<Campaign> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // "Criar campanha" na tela de Segmentos chega com o público escolhido.
  useEffect(() => {
    const segId = (location.state as { segmentId?: string } | null)?.segmentId
    if (segId && segments.length) {
      setEditor({ segment_id: segId })
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, segments.length, navigate, location.pathname])

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['crm-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('salon_campaigns').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Campaign[]
    },
  })

  const open = campaigns.find(c => c.id === openId) ?? null

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <AdminHeader
          title="Campanhas"
          subtitle="Mensagens de WhatsApp para um público do CRM, enviadas pela própria unidade."
          actionNode={
            <Button size="sm" onClick={() => setEditor({})} disabled={!units.length || !segments.length}>
              <Plus className="w-3.5 h-3.5" /> Nova campanha
            </Button>
          }
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        <DispatchOffBanner settings={settings} onEdit={() => setShowSettings(true)} />

        {isLoading ? (
          <div className="flex justify-center py-24"><Loader className="w-7 h-7 animate-spin text-ink-300" /></div>
        ) : campaigns.length === 0 ? (
          <div className="surface-card flex flex-col items-center justify-center py-20 px-4 text-center">
            <Megaphone className="w-8 h-8 text-ink-300 mb-3" />
            <p className="text-[16px] font-semibold text-foreground">Nenhuma campanha ainda</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Escolha um público (ex.: Sumidas), a unidade e a mensagem. Dá para gerar a lista e conferir antes de qualquer envio.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setEditor({})}><Plus className="w-3.5 h-3.5" /> Nova campanha</Button>
          </div>
        ) : (
          <div className="surface-card overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pl-5 pr-3 h-9 text-left font-medium">Campanha</th>
                  <th className="px-3 h-9 text-left font-medium hidden md:table-cell">Unidade</th>
                  <th className="px-3 h-9 text-left font-medium">Situação</th>
                  <th className="px-3 h-9 text-right font-medium">Na lista</th>
                  <th className="px-3 h-9 text-left font-medium hidden md:table-cell">Criada</th>
                  <th className="w-10" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map(c => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="group cursor-pointer hover:bg-muted/60 transition-colors">
                    <td className="pl-5 pr-3 py-2.5">
                      <p className="text-[13px] font-semibold text-foreground">{c.name}</p>
                      <p className="text-[12px] text-muted-foreground truncate max-w-[340px]">
                        {segments.find(s => s.id === c.segment_id)?.name ?? describeFilters(c.filters, units)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-ink-600 hidden md:table-cell">{units.find(u => u.store_id === c.store_id)?.name}</td>
                    <td className="px-3 py-2.5"><CampaignBadge status={c.status} /></td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-semibold text-foreground numeric">
                      {c.list_built_at ? c.recipients_count.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground hidden md:table-cell">
                      {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="pr-4 py-2.5 text-right">
                      <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-brand-strong inline-block transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <CampaignEditor
          initial={editor}
          segments={segments}
          units={units}
          onClose={() => setEditor(null)}
          onSaved={id => {
            setEditor(null)
            qc.invalidateQueries({ queryKey: ['crm-campaigns'] })
            setOpenId(id)
          }}
        />
      )}
      {open && !editor && (
        <CampaignDetail campaign={open} units={units} onClose={() => setOpenId(null)} onEdit={() => setEditor(open)} />
      )}
      {showSettings && settings && <SettingsDialog settings={settings} onClose={() => setShowSettings(false)} />}
    </AdminLayout>
  )
}
