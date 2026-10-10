import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Loader, MessageCircle } from 'lucide-react'

import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, EmptyState, PageLoading, Panel, StatCard, StatGrid, Toolbar } from '@/components/admin/ui/AdminPage'
import StyledSelect from '@/components/ui/styled-select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { MessageBubble, type ConversationMessage } from '@/components/rh/ConversaWhatsapp'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { fmtPhone, useCrmUnits } from './crmShared'

// Escuta de WhatsApp — visão mínima pra validar a captura: conversas recentes
// por unidade e a taxa de conciliação com o CRM. Nada de dashboard ainda.
// Dados: whatsapp_conversations_v + whatsapp_reconciliation_stats (admin).

type MatchStatus = 'matched' | 'unmatched' | 'shared' | 'unresolved_lid'

interface ConversationRow {
  id: string
  instance_id: string
  instance_name: string
  store_name: string | null
  party_key: string
  phone: string | null
  match_status: MatchStatus
  client_name: string | null
  contact_name: string | null
  shared_count: number
  status: 'aberta' | 'fechada'
  opened_at: string
  last_message_at: string
  first_inbound_at: string | null
  first_human_reply_at: string | null
  first_reply_seconds: number | null
  inbound_count: number
  outbound_count: number
  last_direction: 'inbound' | 'outbound' | null
}

interface ReconciliationStats {
  total: number
  matched: number
  unmatched: number
  shared: number
  unresolved_lid: number
  match_rate: number | null
}

const PAGE_SIZE = 100

function whoLabel(c: ConversationRow): { title: string; hint: string | null } {
  const phone = fmtPhone(c.phone) ?? (c.party_key.startsWith('lid:') ? 'Sem telefone resolvido' : c.party_key)
  switch (c.match_status) {
    case 'matched':
      return { title: c.client_name ?? 'Cliente', hint: phone }
    case 'shared':
      return { title: `Telefone compartilhado (${c.shared_count} clientes)`, hint: [phone, c.contact_name].filter(Boolean).join(' · ') }
    case 'unresolved_lid':
      return { title: c.contact_name ?? 'Sem telefone resolvido', hint: 'Identificador interno do WhatsApp (LID)' }
    default:
      return { title: 'Sem cadastro', hint: [phone, c.contact_name].filter(Boolean).join(' · ') }
  }
}

function fmtDuration(sec: number | null) {
  if (sec === null) return null
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  if (h < 24) return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function ReplyCell({ c }: { c: ConversationRow }) {
  if (!c.first_inbound_at) return <span className="text-muted-foreground">Iniciada pela unidade</span>
  const d = fmtDuration(c.first_reply_seconds)
  if (d) return <span className="tabular-nums">{d}</span>
  return <span className={cn('font-medium', c.status === 'fechada' ? 'text-danger' : 'text-warning')}>Sem resposta</span>
}

function DirectionCell({ dir }: { dir: ConversationRow['last_direction'] }) {
  if (!dir) return <span className="text-muted-foreground">—</span>
  const inbound = dir === 'inbound'
  const Icon = inbound ? ArrowDownLeft : ArrowUpRight
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn('w-3.5 h-3.5', inbound ? 'text-info' : 'text-ink-400')} />
      {inbound ? 'Recebida' : 'Enviada'}
    </span>
  )
}

function StatusPill({ status }: { status: ConversationRow['status'] }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-[12px] font-medium',
      status === 'aberta' ? 'text-success' : 'text-muted-foreground',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', status === 'aberta' ? 'bg-success' : 'bg-ink-300')} />
      {status === 'aberta' ? 'Aberta' : 'Fechada'}
    </span>
  )
}

// Mesma normalização de whatsapp_norm_text (minúsculas, espaços colapsados).
const normText = (s: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const TYPE_TAG: Record<string, string> = { reaction: 'reação' }

// Conversa completa, só leitura. Fonte: whatsapp_messages (admin).
function ConversationSheet({ conversation: c, onClose }: { conversation: ConversationRow; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const who = whoLabel(c)

  const { data, isLoading, error } = useQuery({
    queryKey: ['wa-conversation-messages', c.id],
    queryFn: async () => {
      const [msgs, autos, conv] = await Promise.all([
        supabase
          .from('whatsapp_messages')
          .select('id, direction, body, message_type, sent_at, was_sent_by_api')
          .eq('conversation_id', c.id)
          .order('sent_at'),
        supabase.from('whatsapp_auto_reply_texts').select('body').eq('instance_id', c.instance_id),
        supabase.from('whatsapp_conversations').select('ambiguous_client_ids').eq('id', c.id).maybeSingle(),
      ])
      if (msgs.error) throw msgs.error
      const autoSet = new Set((autos.data ?? []).map(a => normText(a.body)))

      // Telefone compartilhado: nomes das clientes empatadas.
      let sharedNames: string[] = []
      const ids = (conv.data?.ambiguous_client_ids as string[] | null) ?? []
      if (ids.length) {
        const { data: clients } = await supabase.from('trinks_clients').select('name').in('id', ids)
        sharedNames = (clients ?? []).map(x => x.name as string)
      }

      const messages: ConversationMessage[] = (msgs.data ?? []).map(m => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        message_type: m.message_type,
        sent_at: m.sent_at,
        tag: m.was_sent_by_api
          ? 'via API'
          : m.direction === 'outbound' && autoSet.has(normText(m.body))
            ? 'automática'
            : TYPE_TAG[m.message_type] ?? null,
      }))
      return { messages, sharedNames }
    },
    refetchInterval: 30_000,
  })

  const messages = data?.messages ?? []
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  const reply = fmtDuration(c.first_reply_seconds)

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 flex flex-col">
        <div className="px-5 pt-5 pb-4 border-b border-border pr-12">
          <SheetTitle className="text-[16px] truncate">{who.title}</SheetTitle>
          <SheetDescription asChild>
            <div className="mt-1 space-y-1 text-[12px]">
              {who.hint && <p className="truncate">{who.hint}</p>}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusPill status={c.status} />
                <span>· {c.store_name ?? '—'} ({c.instance_name})</span>
                <span>· 1ª resposta: {c.first_inbound_at ? (reply ?? 'sem resposta') : 'iniciada pela unidade'}</span>
              </div>
              {data?.sharedNames.length ? (
                <p className="truncate">Clientes com este telefone: {data.sharedNames.join(', ')}</p>
              ) : null}
            </div>
          </SheetDescription>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface px-4 py-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader className="w-5 h-5 animate-spin text-ink-300" /></div>
          ) : error ? (
            <p className="text-[13px] text-danger">Erro ao carregar: {(error as Error).message}</p>
          ) : messages.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-10">Nenhuma mensagem.</p>
          ) : (
            messages.map(m => <MessageBubble key={m.id} message={m} />)
          )}
        </div>

        <p className="px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">
          Somente leitura — mensagens capturadas pela escuta. Áudio e imagem aparecem só como tipo (o arquivo não é baixado).
        </p>
      </SheetContent>
    </Sheet>
  )
}

export default function Conversas() {
  const { data: units = [] } = useCrmUnits()
  const [storeId, setStoreId] = useState('all')
  const [selected, setSelected] = useState<ConversationRow | null>(null)
  const store = storeId === 'all' ? null : storeId

  const stats = useQuery({
    queryKey: ['wa-reconciliation', store],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('whatsapp_reconciliation_stats', { p_store_id: store })
      if (error) throw error
      return data as ReconciliationStats
    },
  })

  const list = useQuery({
    queryKey: ['wa-conversations', store],
    queryFn: async () => {
      let q = supabase
        .from('whatsapp_conversations_v')
        .select('id, instance_id, instance_name, store_name, party_key, phone, match_status, client_name, contact_name, shared_count, status, opened_at, last_message_at, first_inbound_at, first_human_reply_at, first_reply_seconds, inbound_count, outbound_count, last_direction')
        .order('last_message_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (store) q = q.eq('store_id', store)
      const { data, error } = await q
      if (error) throw error
      return data as ConversationRow[]
    },
    refetchInterval: 60_000,
  })

  const s = stats.data
  const pct = (n: number | undefined) => (s && s.total ? `${Math.round((100 * (n ?? 0)) / s.total)}% dos números` : undefined)
  const rows = list.data ?? []

  return (
    <AdminLayout>
      <AdminPage
        title="Conversas"
        description="Escuta passiva do WhatsApp das unidades — validação da captura e da conciliação com o CRM"
        toolbar={
          <Toolbar>
            <div className="w-full sm:w-56">
              <StyledSelect
                value={storeId}
                onChange={setStoreId}
                options={[{ value: 'all', label: 'Todas as unidades' }, ...units.map(u => ({ value: u.store_id, label: u.name }))]}
              />
            </div>
          </Toolbar>
        }
      >
        <div className="space-y-4">
          <StatGrid className="lg:grid-cols-5">
            <StatCard label="Números únicos" value={(s?.total ?? 0).toLocaleString('pt-BR')} hint="com conversa" />
            <StatCard
              label="Conciliados"
              value={s?.match_rate != null ? `${s.match_rate.toLocaleString('pt-BR')}%` : '—'}
              hint={`${(s?.matched ?? 0).toLocaleString('pt-BR')} com cliente única`}
              tone="success"
            />
            <StatCard label="Sem cadastro" value={(s?.unmatched ?? 0).toLocaleString('pt-BR')} hint={pct(s?.unmatched)} />
            <StatCard label="Telefone compartilhado" value={(s?.shared ?? 0).toLocaleString('pt-BR')} hint={pct(s?.shared)} tone="warning" />
            <StatCard label="Sem telefone resolvido" value={(s?.unresolved_lid ?? 0).toLocaleString('pt-BR')} hint="LID do WhatsApp" />
          </StatGrid>

          {list.isLoading ? (
            <PageLoading />
          ) : list.error ? (
            <Panel><p className="text-[13px] text-danger">Erro ao carregar: {(list.error as Error).message}</p></Panel>
          ) : rows.length === 0 ? (
            <Panel flush>
              <EmptyState
                icon={MessageCircle}
                title="Nenhuma conversa capturada"
                description="A escuta só grava instâncias com listen_enabled ligado e o webhook configurado na Uazapi (ver docs/whatsapp-escuta.md)."
              />
            </Panel>
          ) : (
            <>
              {/* Desktop */}
              <Panel flush className={cn('hidden md:block overflow-hidden transition-opacity', list.isFetching && 'opacity-70')}>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5 w-[30%]">Cliente</TableHead>
                      <TableHead className="w-[14%]">Unidade</TableHead>
                      <TableHead className="w-[15%]">Última mensagem</TableHead>
                      <TableHead className="w-[12%]">Direção</TableHead>
                      <TableHead className="w-[15%]">1ª resposta</TableHead>
                      <TableHead className="w-[14%]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(c => {
                      const who = whoLabel(c)
                      return (
                        <TableRow key={c.id} onClick={() => setSelected(c)} className="group cursor-pointer hover:bg-muted/60">
                          <TableCell className="pl-5">
                            <p className={cn('text-[13px] font-medium truncate', c.match_status === 'matched' ? 'text-foreground' : 'text-muted-foreground')}>
                              {who.title}
                            </p>
                            {who.hint && <p className="text-[12px] text-muted-foreground truncate">{who.hint}</p>}
                          </TableCell>
                          <TableCell className="text-[13px]">
                            <p className="truncate">{c.store_name ?? '—'}</p>
                            <p className="text-[12px] text-muted-foreground truncate">{c.instance_name}</p>
                          </TableCell>
                          <TableCell className="text-[13px] tabular-nums">
                            {fmtWhen(c.last_message_at)}
                            <p className="text-[12px] text-muted-foreground">{c.inbound_count} rec · {c.outbound_count} env</p>
                          </TableCell>
                          <TableCell className="text-[13px]"><DirectionCell dir={c.last_direction} /></TableCell>
                          <TableCell className="text-[13px]"><ReplyCell c={c} /></TableCell>
                          <TableCell>
                            <div className="flex items-center justify-between gap-2">
                              <StatusPill status={c.status} />
                              <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-500 shrink-0" />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Panel>

              {/* Mobile */}
              <Panel flush className="md:hidden divide-y divide-border overflow-hidden">
                {rows.map(c => {
                  const who = whoLabel(c)
                  return (
                    <button key={c.id} type="button" onClick={() => setSelected(c)} className="w-full text-left px-4 py-3 space-y-1 hover:bg-muted/60">
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn('text-[13px] font-medium min-w-0 truncate', c.match_status === 'matched' ? 'text-foreground' : 'text-muted-foreground')}>
                          {who.title}
                        </p>
                        <StatusPill status={c.status} />
                      </div>
                      {who.hint && <p className="text-[12px] text-muted-foreground truncate">{who.hint}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                        <span className="tabular-nums">{fmtWhen(c.last_message_at)}</span>
                        <DirectionCell dir={c.last_direction} />
                        <span>1ª resposta: <ReplyCell c={c} /></span>
                      </div>
                    </button>
                  )
                })}
              </Panel>
              {rows.length === PAGE_SIZE && (
                <p className="text-[12px] text-muted-foreground text-center">Mostrando as {PAGE_SIZE} conversas mais recentes.</p>
              )}
            </>
          )}
        </div>
        {selected && <ConversationSheet conversation={selected} onClose={() => setSelected(null)} />}
      </AdminPage>
    </AdminLayout>
  )
}
