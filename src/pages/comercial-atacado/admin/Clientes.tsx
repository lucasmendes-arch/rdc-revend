import { useState, useMemo } from 'react'
import { formatBRL } from '@/lib/format'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Loader, Eye, MousePointerClick, ShoppingCart, CreditCard,
  CheckCircle, XCircle, X, User, Phone, Mail, Edit2, Check,
  Building2, FileText, Package, Clock, Calendar, Users, DollarSign, Sparkles, AlertTriangle, Trash2,
  KeyRound, Copy, Lock, Unlock, MessageCircle, RefreshCw, LayoutList, Columns3, ChevronRight, ChevronDown, Search,
} from 'lucide-react'
import { NextActionEditor } from '@/components/admin/NextActionEditor'
import { CustomerNotes } from '@/components/admin/CustomerNotes'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, PageTabs, Segmented, Toolbar, SearchInput, Panel, StatCard, EmptyState, PageLoading, PAGE_X } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AdminSelect } from '@/components/admin/ui/AdminSelect'
import { QUEUE_VIEWS, applyQueueView, applySegmentFilter, getQueuePriority, getViewsForSegment, isNovoSemPrimeiroPedido, isSemPedido30d, sortWorkQueue } from '@/lib/crmFilters'
import type { CrmFilterSession, QueuePriority, SegmentTab } from '@/lib/crmFilters'
import { getOrderStatus } from '@/lib/design/orderStatus'
import StyledSelect from '@/components/ui/styled-select'

interface OrderItem {
  id: string
  product_name_snapshot: string
  qty: number
  unit_price_snapshot: number
  line_total: number
  catalog_products?: { main_image: string | null } | null
}

interface OrderSummary {
  id: string
  status: string
  total: number
  created_at: string
  order_items: OrderItem[]
}

interface ClientProfile {
  full_name: string | null
  phone: string | null
  document_type: string | null
  document: string | null
  business_type: string | null
  employees: string | null
  revenue: string | null
  customer_segment: string | null
  access_status: string | null
  auth_phone: string | null
  credentials_created_at: string | null
  last_password_reset_at: string | null
  price_list_id: string | null
  price_list_name: string | null
  // CRM operacional (adicionados em 20260412)
  assigned_seller: string | null
  seller_id: string | null
  seller_name: string | null
  next_action: string | null
  next_action_at: string | null
  total_orders: number
  total_spent: number
  first_order_at: string | null
  last_order_at: string | null
}

interface ClientSession {
  id: string
  session_id: string
  user_id: string | null
  email: string | null
  status: string
  last_page: string | null
  cart_items_count: number
  created_at: string
  updated_at: string
  profile: ClientProfile | null
  orders: OrderSummary[]
}

const funnelStages = [
  {
    key: 'visitou',
    label: 'Visitou o site',
    subtitle: 'Navegou no catálogo',
    icon: Eye,
    indicatorColor: 'bg-ink-300',
  },
  {
    key: 'visualizou_produto',
    label: 'Viu produtos',
    subtitle: 'Abriu ficha técnica',
    icon: MousePointerClick,
    indicatorColor: 'bg-blue-400',
  },
  {
    key: 'adicionou_carrinho',
    label: 'Carrinho',
    subtitle: 'Tem itens pendentes',
    icon: ShoppingCart,
    indicatorColor: 'bg-warning-solid',
  },
  {
    key: 'iniciou_checkout',
    label: 'Checkout',
    subtitle: 'Avançou para fechar',
    icon: CreditCard,
    indicatorColor: 'bg-purple-400',
  },
  {
    key: 'comprou',
    label: 'Comprou',
    subtitle: 'Pedido concluído',
    icon: CheckCircle,
    indicatorColor: 'bg-success-solid',
  },
  {
    key: 'abandonou',
    label: 'Abandonou',
    subtitle: 'Saiu sem fechar',
    icon: XCircle,
    indicatorColor: 'bg-danger-solid',
  },
] as const

// Mesma família de cor do badge de segmento (segmentBadgeColor).
const SEGMENT_DOT: Record<string, string> = {
  '': 'bg-ink-300',
  network_partner: 'bg-brand-solid',
  wholesale_buyer: 'bg-teal-500',
}

const businessTypeLabels: Record<string, string> = {
  salao: 'Salão de beleza',
  revenda: 'Revenda',
  loja: 'Loja / Comércio',
}

const employeesLabels: Record<string, string> = {
  somente_eu: 'Somente eu',
  '1-3': '1 a 3 funcionários',
  '4-7': '4 a 7 funcionários',
  '8-10': '8 a 10 funcionários',
  '+10': 'Mais de 10 funcionários',
}

const revenueLabels: Record<string, string> = {
  '1k_5k': 'R$ 1.000 a R$ 5.000/mês',
  '6k_10k': 'R$ 6.000 a R$ 10.000/mês',
  '10k_30k': 'R$ 10.000 a R$ 30.000/mês',
  '30k_50k': 'R$ 30.000 a R$ 50.000/mês',
  'acima_50k': 'Mais de R$ 50.000/mês',
}

// --- Compute labels for a session ---
function getClientLabels(session: ClientSession): Array<{ text: string; color: string; icon: typeof Sparkles }> {
  const labels: Array<{ text: string; color: string; icon: typeof Sparkles }> = []
  const now = Date.now()
  const createdAt = new Date(session.created_at).getTime()
  const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24)
  const hasPurchased = session.orders.length > 0

  // Novo usuário (últimos 7 dias)
  if (daysSinceCreation <= 7) {
    labels.push({ text: 'Novo', color: 'bg-success-subtle text-success border-success-border', icon: Sparkles })
  }

  // Sem compra (cadastrado há mais de 7 dias e menos de 30 dias, sem pedido)
  if (!hasPurchased && daysSinceCreation > 7 && daysSinceCreation <= 30) {
    labels.push({ text: 'Sem compra', color: 'bg-warning-subtle text-warning border-warning-border', icon: AlertTriangle })
  }

  // Sem compra há 30+ dias
  if (!hasPurchased && daysSinceCreation > 30) {
    labels.push({ text: `${Math.floor(daysSinceCreation)}d sem compra`, color: 'bg-danger-subtle text-danger border-danger-border', icon: AlertTriangle })
  }

  return labels
}

function getClientName(session: ClientSession): string {
  return session.profile?.full_name || session.email || `Visitante ${session.session_id.slice(0, 8)}`
}

// --------------------------------------------------------------------------
// Fila Comercial — componentes de card e formulário inline
// --------------------------------------------------------------------------

const QUEUE_PRIORITY_CONFIG: Record<QueuePriority, {
  label: string
  variant: 'danger' | 'warning' | 'neutral'
  badgeClasses: string
  borderClasses: string
  barClasses: string
}> = {
  vencido: {
    label: 'Vencido',
    variant: 'danger',
    badgeClasses: 'bg-danger-subtle text-danger ring-danger-border',
    borderClasses: 'border-danger-border hover:border-danger-border',
    barClasses: 'bg-danger-solid',
  },
  hoje: {
    label: 'Hoje',
    variant: 'warning',
    badgeClasses: 'bg-warning-subtle text-warning ring-warning-border',
    borderClasses: 'border-warning-border hover:border-warning-border',
    barClasses: 'bg-warning-solid',
  },
  sem_acao: {
    label: 'Sem ação',
    variant: 'neutral',
    badgeClasses: 'bg-muted text-muted-foreground ring-border',
    borderClasses: 'border-border hover:border-ink-300',
    barClasses: 'bg-ink-300',
  },
  futuro: {
    label: '',
    variant: 'neutral',
    badgeClasses: '',
    borderClasses: 'border-border hover:border-ink-300',
    barClasses: 'bg-transparent',
  },
}

interface InlineNextActionFormProps {
  userId: string
  nextAction: string | null
  nextActionAt: string | null
  onClose: () => void
}

function InlineNextActionForm({ userId, nextAction, nextActionAt, onClose }: InlineNextActionFormProps) {
  const queryClient = useQueryClient()
  const [actionText, setActionText] = useState(nextAction ?? '')
  const [actionDate, setActionDate] = useState(() => {
    if (!nextActionAt) return ''
    const d = new Date(nextActionAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_profile_next_action', {
        p_user_id: userId,
        p_next_action: actionText.trim() || null,
        p_next_action_at: actionDate ? new Date(actionDate).toISOString() : null,
      })
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['client-sessions'] })
      const prev = queryClient.getQueryData(['client-sessions'])
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === userId
            ? {
                ...s,
                profile: {
                  ...s.profile,
                  next_action: actionText.trim() || null,
                  next_action_at: actionDate ? new Date(actionDate).toISOString() : null,
                },
              }
            : s,
        )
      })
      return { prev }
    },
    onSuccess: () => {
      toast.success('Próxima ação atualizada')
      onClose()
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any, _v, context) => {
      if (context?.prev) queryClient.setQueryData(['client-sessions'], context.prev)
      toast.error('Erro ao salvar: ' + (err?.message || 'erro desconhecido'))
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_profile_next_action', {
        p_user_id: userId,
        p_next_action: null,
        p_next_action_at: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Próxima ação removida')
      onClose()
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'erro desconhecido')),
  })

  const isLoading = saveMutation.isPending || clearMutation.isPending

  const datePart = actionDate ? actionDate.slice(0, 10) : ''
  const timePart = actionDate ? actionDate.slice(11, 16) : ''

  return (
    <div className="mt-2 p-3 bg-surface rounded-md border border-border space-y-2">
      <Input
        type="text"
        value={actionText}
        onChange={e => setActionText(e.target.value)}
        placeholder="Ex: Ligar, enviar proposta…"
        aria-label="Próxima ação"
        className="bg-card"
        autoFocus
      />
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <DateField
            value={datePart || null}
            onChange={d => setActionDate(d ? `${d}T${timePart || '09:00'}` : '')}
            placeholder="Data (opcional)"
          />
        </div>
        <Input
          type="time"
          value={timePart}
          onChange={e => { if (datePart) setActionDate(`${datePart}T${e.target.value || '09:00'}`) }}
          disabled={!datePart}
          aria-label="Horário"
          className="w-28 shrink-0 bg-card tabular-nums"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={isLoading || !actionText.trim()}
          className="flex-1"
        >
          {saveMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
          Salvar
        </Button>
        {nextAction && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={isLoading}
            className="text-danger hover:text-danger hover:bg-danger-subtle"
          >
            Remover
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

interface WorkQueueCardProps {
  session: ClientSession
  priority: QueuePriority
  onOpen: () => void
}

function WorkQueueCard({ session, priority, onOpen }: WorkQueueCardProps) {
  const [inlineEditing, setInlineEditing] = useState(false)
  const profile = session.profile
  if (!profile) return null

  const name = getClientName(session)
  const pConf = QUEUE_PRIORITY_CONFIG[priority]

  const nextActionDate = profile.next_action_at
    ? new Date(profile.next_action_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  const lastOrderDate = profile.last_order_at
    ? new Date(profile.last_order_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null

  const totalSpentFormatted = profile.total_spent > 0
    ? `R$ ${Number(profile.total_spent).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : null

  return (
    <div className={`bg-card rounded-lg border shadow-xs ${pConf.borderClasses} flex overflow-hidden transition-colors`}>
      {/* Barra de prioridade */}
      <div className={`w-1 shrink-0 ${pConf.barClasses}`} />

      <div className="flex-1 min-w-0 p-3.5">
        {/* Linha 1: nome + prioridade + ações */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h4 className="text-[13.5px] font-semibold text-foreground truncate leading-snug">{name}</h4>
            {priority !== 'futuro' && (
              <Badge variant={pConf.variant} className="shrink-0">{pConf.label}</Badge>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => setInlineEditing(v => !v)}
              title="Editar próxima ação"
              aria-label="Editar próxima ação"
            >
              <Edit2 />
            </Button>
            <Button variant="secondary" size="xs" onClick={onOpen}>
              Abrir
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* Linha 2: responsável + segmento */}
        {(profile.seller_name || profile.customer_segment) && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {profile.seller_name && (
              <span className="text-[12px] text-muted-foreground">
                Responsável: <span className="text-foreground font-medium">{profile.seller_name}</span>
              </span>
            )}
            {profile.customer_segment && (
              <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border leading-4 ${segmentBadgeColor(profile.customer_segment)}`}>
                {segmentLabel(profile.customer_segment)}
              </span>
            )}
          </div>
        )}

        {/* Linha 3: próxima ação */}
        {profile.next_action && !inlineEditing && (
          <div className="mt-2 flex items-start gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] text-foreground line-clamp-1">{profile.next_action}</p>
              {nextActionDate && (
                <p className={`text-[12px] font-medium mt-0.5 tabular-nums ${
                  priority === 'vencido' ? 'text-danger' :
                  priority === 'hoje' ? 'text-warning' :
                  'text-muted-foreground'
                }`}>
                  {priority === 'vencido' ? 'Venceu ' : 'Agendado '}{nextActionDate}
                </p>
              )}
            </div>
          </div>
        )}
        {!profile.next_action && !inlineEditing && (
          <p className="mt-2 text-[12px] text-muted-foreground">Sem próxima ação definida</p>
        )}

        {/* Editor inline */}
        {inlineEditing && (
          <InlineNextActionForm
            userId={session.user_id!}
            nextAction={profile.next_action}
            nextActionAt={profile.next_action_at}
            onClose={() => setInlineEditing(false)}
          />
        )}

        {/* Linha 4: pedidos */}
        {!inlineEditing && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground border-t border-border pt-2 tabular-nums">
            {lastOrderDate ? (
              <span>Último pedido: <span className="text-foreground font-medium">{lastOrderDate}</span></span>
            ) : (
              <span>Sem pedidos</span>
            )}
            {profile.total_orders > 0 && (
              <span>{profile.total_orders} {profile.total_orders === 1 ? 'pedido' : 'pedidos'}</span>
            )}
            {totalSpentFormatted && (
              <span className="font-medium">{totalSpentFormatted}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Detail Panel ---
const SEGMENT_OPTIONS = [
  { value: '', label: 'Não classificado' },
  { value: 'network_partner', label: 'Parceiro da rede' },
  { value: 'wholesale_buyer', label: 'Comprador atacado' },
] as const

const segmentLabel = (v: string | null) =>
  SEGMENT_OPTIONS.find(o => o.value === (v || ''))?.label || v || 'Não classificado'

const segmentBadgeColor = (v: string | null) => {
  if (v === 'network_partner') return 'bg-brand-subtle text-brand-strong border-brand-border'
  if (v === 'wholesale_buyer') return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30'
  return 'bg-muted text-muted-foreground border-border'
}

function ClientDetailPanel({ session, onClose, onDeleteClick }: { session: ClientSession; onClose: () => void; onDeleteClick: () => void }) {
  const queryClient = useQueryClient()
  const profile = session.profile
  const orders = session.orders || []
  const stageInfo = funnelStages.find(s => s.key === session.status) || funnelStages[0]
  const StageIcon = stageInfo.icon
  const labels = getClientLabels(session)

  const segmentMutation = useMutation({
    mutationFn: async (segment: string | null) => {
      const { error } = await supabase.rpc('admin_update_customer_segment', {
        p_user_id: session.user_id!,
        p_segment: segment,
      })
      if (error) throw error
    },
    onMutate: async (newSegment) => {
      await queryClient.cancelQueries({ queryKey: ['client-sessions'] })
      const prev = queryClient.getQueryData(['client-sessions'])
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? { ...s, profile: { ...s.profile, customer_segment: newSegment } }
            : s,
        )
      })
      return { prev }
    },
    onSuccess: () => {
      toast.success('Segmento atualizado')
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any, _v, context) => {
      if (context?.prev) queryClient.setQueryData(['client-sessions'], context.prev)
      toast.error('Erro ao atualizar: ' + (err?.message || 'erro desconhecido'))
    },
  })

  const { data: availablePriceLists = [] } = useQuery({
    queryKey: ['admin-price-lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_lists')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
    staleTime: 60 * 1000,
    enabled: profile?.customer_segment === 'network_partner',
  })

  const priceListMutation = useMutation({
    mutationFn: async (priceListId: string | null) => {
      const { error } = await supabase.rpc('admin_set_profile_price_list', {
        p_user_id: session.user_id!,
        p_price_list_id: priceListId,
      })
      if (error) throw error
    },
    onMutate: async (newPriceListId) => {
      await queryClient.cancelQueries({ queryKey: ['client-sessions'] })
      const prev = queryClient.getQueryData(['client-sessions'])
      const newName = availablePriceLists.find(l => l.id === newPriceListId)?.name ?? null
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? { ...s, profile: { ...s.profile, price_list_id: newPriceListId, price_list_name: newName } }
            : s,
        )
      })
      return { prev }
    },
    onSuccess: () => {
      toast.success('Tabela de preço atualizada')
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any, _v, context) => {
      if (context?.prev) queryClient.setQueryData(['client-sessions'], context.prev)
      toast.error('Erro ao atualizar: ' + (err?.message || 'erro desconhecido'))
    },
  })

  // ── Owner comercial (assigned_seller) ──────────────────────────────────
  const { data: activeSellers = [] } = useQuery({
    queryKey: ['active-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_sellers_for_dropdown')
      if (error) throw error
      return (data ?? []) as { id: string; name: string; code: string }[]
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!session.user_id,
  })

  const sellerMutation = useMutation({
    mutationFn: async (sellerId: string | null) => {
      const { error } = await supabase.rpc('admin_set_profile_seller', {
        p_user_id: session.user_id!,
        p_seller_id: sellerId,
      })
      if (error) throw error
    },
    onMutate: async (newSellerId) => {
      await queryClient.cancelQueries({ queryKey: ['client-sessions'] })
      const prev = queryClient.getQueryData(['client-sessions'])
      const seller = activeSellers.find(s => s.id === newSellerId) ?? null
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? {
                ...s,
                profile: {
                  ...s.profile,
                  assigned_seller: seller?.code ?? null,
                  seller_id: newSellerId,
                  seller_name: seller?.name ?? null,
                },
              }
            : s,
        )
      })
      return { prev }
    },
    onSuccess: () => {
      toast.success('Responsável comercial atualizado')
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any, _v, context) => {
      if (context?.prev) queryClient.setQueryData(['client-sessions'], context.prev)
      toast.error('Erro ao atualizar: ' + (err?.message || 'erro desconhecido'))
    },
  })

  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    full_name: '', phone: '', document_type: '', document: '',
    business_type: '', employees: '', revenue: '',
  })

  function startEditProfile() {
    setProfileForm({
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
      document_type: profile?.document_type ?? '',
      document: profile?.document ?? '',
      business_type: profile?.business_type ?? '',
      employees: profile?.employees ?? '',
      revenue: profile?.revenue ?? '',
    })
    setEditingProfile(true)
  }

  const updateProfileMutation = useMutation({
    mutationFn: async (form: typeof profileForm) => {
      const { error } = await supabase.rpc('admin_update_profile', {
        p_user_id: session.user_id!,
        p_full_name: form.full_name || null,
        p_phone: form.phone || null,
        p_document_type: form.document_type || null,
        p_document: form.document || null,
        p_business_type: form.business_type || null,
        p_employees: form.employees || null,
        p_revenue: form.revenue || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Dados atualizados')
      setEditingProfile(false)
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any) => toast.error('Erro ao salvar: ' + (err?.message || 'erro desconhecido')),
  })

  const clientName = getClientName(session)
  const initials = clientName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const sectionTitle = 'text-[14px] font-semibold text-foreground tracking-tight'

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 flex flex-col">
        {/* Cabeçalho */}
        <SheetHeader className="border-b border-border px-5 pr-12 py-4 flex-row items-start gap-3 space-y-0 text-left">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-ink-600 font-semibold text-[13px] shrink-0" aria-hidden>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="truncate">{clientName}</SheetTitle>
            <SheetDescription className="sr-only">Ficha do cliente</SheetDescription>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge variant="neutral">
                <span className={`w-1.5 h-1.5 rounded-full ${stageInfo.indicatorColor}`} aria-hidden />
                <StageIcon className="w-3 h-3" />
                {stageInfo.label}
              </Badge>
              {labels.map(l => (
                <span key={l.text} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border leading-5 ${l.color}`}>
                  <l.icon className="w-3 h-3" />
                  {l.text}
                </span>
              ))}
              {profile?.customer_segment && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border leading-5 ${segmentBadgeColor(profile.customer_segment)}`}>
                  {segmentLabel(profile.customer_segment)}
                </span>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {/* Dados do cadastro */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className={sectionTitle}>Dados do cadastro</h3>
              {session.user_id && profile && !editingProfile && (
                <Button variant="secondary" size="xs" onClick={startEditProfile}>
                  <Edit2 />
                  Editar
                </Button>
              )}
              {editingProfile && (
                <Button variant="ghost" size="xs" onClick={() => setEditingProfile(false)}>
                  Cancelar
                </Button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="cl-full-name" className="field-label">Nome completo</label>
                  <Input
                    id="cl-full-name"
                    type="text"
                    value={profileForm.full_name}
                    onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="cl-phone" className="field-label">WhatsApp / telefone</label>
                  <Input
                    id="cl-phone"
                    type="text"
                    value={profileForm.phone}
                    onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Ex: 5527999990000"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-28 shrink-0">
                    <span className="field-label">Tipo doc.</span>
                    <StyledSelect
                      value={profileForm.document_type}
                      onChange={(v) => setProfileForm(p => ({ ...p, document_type: v }))}
                      options={[{ value: 'CPF', label: 'CPF' }, { value: 'CNPJ', label: 'CNPJ' }]}
                      emptyLabel="—"
                      placeholder="—"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="cl-document" className="field-label">Número</label>
                    <Input
                      id="cl-document"
                      type="text"
                      value={profileForm.document}
                      onChange={e => setProfileForm(p => ({ ...p, document: e.target.value }))}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
                <div>
                  <span className="field-label">Tipo de atuação</span>
                  <StyledSelect
                    value={profileForm.business_type}
                    onChange={(v) => setProfileForm(p => ({ ...p, business_type: v }))}
                    options={Object.entries(businessTypeLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                  />
                </div>
                <div>
                  <span className="field-label">Funcionários</span>
                  <StyledSelect
                    value={profileForm.employees}
                    onChange={(v) => setProfileForm(p => ({ ...p, employees: v }))}
                    options={Object.entries(employeesLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                  />
                </div>
                <div>
                  <span className="field-label">Faturamento estimado</span>
                  <StyledSelect
                    value={profileForm.revenue}
                    onChange={(v) => setProfileForm(p => ({ ...p, revenue: v }))}
                    options={Object.entries(revenueLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                  />
                </div>
                <Button
                  onClick={() => updateProfileMutation.mutate(profileForm)}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
                  Salvar alterações
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {profile?.full_name && (
                  <InfoRow icon={User} label="Nome completo" value={profile.full_name} />
                )}
                {session.email && (
                  <InfoRow icon={Mail} label="E-mail" value={session.email} />
                )}
                {profile?.phone && (
                  <InfoRow icon={Phone} label="WhatsApp / telefone" value={profile.phone} />
                )}
                {profile?.document && (
                  <InfoRow icon={FileText} label={profile.document_type || 'Documento'} value={profile.document} />
                )}
                {profile?.business_type && (
                  <InfoRow icon={Building2} label="Tipo de atuação" value={businessTypeLabels[profile.business_type] || profile.business_type} />
                )}
                {profile?.employees && (
                  <InfoRow icon={Users} label="Funcionários" value={employeesLabels[profile.employees] || profile.employees} />
                )}
                {profile?.revenue && (
                  <InfoRow icon={DollarSign} label="Faturamento estimado" value={revenueLabels[profile.revenue] || profile.revenue} />
                )}
                {profile && !profile.full_name && !profile.phone && !profile.document && (
                  <div className="bg-warning-subtle border border-warning-border text-warning p-3 rounded-md text-[13px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p>Perfil incompleto. Clique em Editar para preencher.</p>
                  </div>
                )}
                {!profile && session.user_id && (
                  <div className="bg-surface border border-border text-muted-foreground p-3 rounded-md text-[13px] flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin shrink-0 text-ink-400" />
                    <p>Aguardando sincronização do perfil.</p>
                  </div>
                )}
                {!profile && !session.user_id && !session.email && (
                  <p className="text-[13px] text-muted-foreground">Visitante anônimo, sem dados de perfil.</p>
                )}
              </div>
            )}
          </div>

          {/* Segmento comercial */}
          {session.user_id && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className={`${sectionTitle} mb-3`}>Segmento comercial</h3>
              <div className="flex items-center gap-3">
                <StyledSelect
                  variant="inline"
                  value={profile?.customer_segment || ''}
                  onChange={(v) => segmentMutation.mutate(v || null)}
                  disabled={segmentMutation.isPending}
                  options={SEGMENT_OPTIONS.map(o => ({ value: o.value, label: o.label, dotClassName: SEGMENT_DOT[o.value] }))}
                  searchable={false}
                  className="bg-card font-medium"
                />
                {segmentMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          )}

          {/* Responsável comercial */}
          {session.user_id && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className={`${sectionTitle} mb-3`}>Responsável comercial</h3>
              <div className="flex items-center gap-3">
                <AdminSelect
                  options={activeSellers.map(s => ({ value: s.id, label: s.name }))}
                  value={profile?.seller_id || ''}
                  onChange={v => sellerMutation.mutate(v || null)}
                  placeholder="Sem responsável"
                  allLabel="Sem responsável"
                  icon={Users}
                />
                {sellerMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          )}

          {/* Próxima ação */}
          {session.user_id && (
            <NextActionEditor
              userId={session.user_id}
              nextAction={profile?.next_action ?? null}
              nextActionAt={profile?.next_action_at ?? null}
            />
          )}

          {/* Acesso ao portal */}
          {session.user_id && profile?.customer_segment === 'network_partner' && (
            <PartnerAccessSection session={session} />
          )}

          {/* Tabela de preço */}
          {session.user_id && profile?.customer_segment === 'network_partner' && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className={`${sectionTitle} mb-3`}>Tabela de preço</h3>
              <div className="flex items-center gap-3">
                <AdminSelect
                  options={availablePriceLists.map(l => ({ value: l.id, label: l.name }))}
                  value={profile?.price_list_id || ''}
                  onChange={v => priceListMutation.mutate(v || null)}
                  placeholder="Preço padrão do catálogo"
                  allLabel="Preço padrão do catálogo"
                />
                {priceListMutation.isPending && <Loader className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          )}

          {/* Carrinho */}
          {session.cart_items_count > 0 && orders.length === 0 && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className={`${sectionTitle} mb-3`}>Carrinho</h3>
              <div className="flex items-center gap-3 bg-warning-subtle rounded-md p-3 border border-warning-border">
                <ShoppingCart className="w-4 h-4 text-warning shrink-0" />
                <div>
                  <p className="text-[13.5px] font-semibold text-warning">
                    {session.cart_items_count} {session.cart_items_count === 1 ? 'item' : 'itens'} no carrinho
                  </p>
                  <p className="text-[12px] text-warning mt-0.5">
                    Armazenado no navegador do cliente
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pedidos */}
          {orders.length > 0 && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className={`${sectionTitle} mb-3`}>
                Pedidos <span className="font-normal text-muted-foreground tabular-nums">({orders.length})</span>
              </h3>
              <div className="space-y-3">
                {orders.map((order) => {
                  const st = getOrderStatus(order.status)
                  return (
                    <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 border-b border-border bg-surface">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[12.5px] font-medium text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <Badge variant={st.tone} dot>{st.label}</Badge>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[13.5px] font-semibold text-foreground tabular-nums">{formatBRL(order.total)}</p>
                          <p className="text-[12px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="divide-y divide-border">
                        {order.order_items.map((item) => {
                          let imgUrl: string | null = null
                          if (Array.isArray(item.catalog_products)) {
                            imgUrl = (item.catalog_products as any)[0]?.main_image
                          } else {
                            imgUrl = item.catalog_products?.main_image || null
                          }
                          return (
                            <div key={item.id} className="flex items-center gap-2.5 p-2.5">
                              {imgUrl ? (
                                <img src={imgUrl} alt="" className="w-9 h-9 rounded-md object-cover shrink-0 border border-border" />
                              ) : (
                                <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <Package className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                                <p className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">{item.qty}× {formatBRL(item.unit_price_snapshot)}</p>
                              </div>
                              <span className="text-[13px] font-semibold text-foreground shrink-0 tabular-nums">{formatBRL(item.line_total)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Atividade */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className={`${sectionTitle} mb-3`}>Atividade da sessão</h3>
            <div className="space-y-3">
              <InfoRow icon={Calendar} label="Primeira visita" value={new Date(session.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              <InfoRow icon={Clock} label="Última atividade" value={new Date(session.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              {session.last_page && (
                <InfoRow icon={Eye} label="Última página" value={session.last_page} />
              )}
            </div>
          </div>

          {/* Notas internas */}
          {session.user_id && (
            <CustomerNotes userId={session.user_id} />
          )}

          {/* Zona de perigo */}
          <div className="px-5 py-5">
            <Button
              variant="secondary"
              onClick={onDeleteClick}
              className="w-full text-danger hover:text-danger hover:bg-danger-subtle"
            >
              <Trash2 />
              Excluir cliente
            </Button>
            <p className="text-[12px] text-muted-foreground text-center mt-2">Ação administrativa irreversível</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}



// Linha de informação reutilizável
function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[12px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-[13.5px] font-medium text-foreground truncate mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ── Partner Access Section ────────────────────────────────────────────────────

interface CredentialResult {
  phone: string
  created_password: string
  partner_name: string
}

function PartnerAccessSection({ session }: { session: ClientSession }) {
  const queryClient = useQueryClient()
  const profile = session.profile!
  const accessStatus = profile.access_status ?? 'not_created'

  const [manualPassword, setManualPassword] = useState('')
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [credResult, setCredResult] = useState<CredentialResult | null>(null)

  async function invokeAction(action: string, password?: string) {
    const body: Record<string, unknown> = { action, profile_id: session.user_id }
    if (password) body.password = password
    const data = await callEdgeFunction('admin-partner-credentials', body)
    if (data?.error) throw new Error(data.error)
    return data
  }

  const createMutation = useMutation({
    mutationFn: () => invokeAction('create', manualPassword || undefined),
    onSuccess: (data) => {
      setCredResult({ phone: data.phone, created_password: data.created_password, partner_name: data.partner_name })
      setManualPassword('')
      setShowPasswordInput(false)
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? { ...s, profile: { ...s.profile, access_status: 'active', auth_phone: data.phone, credentials_created_at: new Date().toISOString() } }
            : s
        )
      })
      toast.success('Acesso criado com sucesso')
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao criar acesso'),
  })

  const resetMutation = useMutation({
    mutationFn: () => invokeAction('reset_password', manualPassword || undefined),
    onSuccess: (data) => {
      setCredResult({ phone: data.phone, created_password: data.created_password, partner_name: data.partner_name })
      setManualPassword('')
      setShowPasswordInput(false)
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? { ...s, profile: { ...s.profile, last_password_reset_at: new Date().toISOString() } }
            : s
        )
      })
      toast.success('Senha resetada com sucesso')
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao resetar senha'),
  })

  const blockMutation = useMutation({
    mutationFn: () => invokeAction('block'),
    onSuccess: () => {
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? { ...s, profile: { ...s.profile, access_status: 'blocked' } }
            : s
        )
      })
      toast.success('Acesso bloqueado')
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao bloquear'),
  })

  const unblockMutation = useMutation({
    mutationFn: () => invokeAction('unblock'),
    onSuccess: () => {
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === session.user_id
            ? { ...s, profile: { ...s.profile, access_status: 'active' } }
            : s
        )
      })
      toast.success('Acesso desbloqueado')
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao desbloquear'),
  })

  const isLoading = createMutation.isPending || resetMutation.isPending || blockMutation.isPending || unblockMutation.isPending

  const statusConfig = {
    not_created: { label: 'Sem acesso', variant: 'neutral' as const },
    active:      { label: 'Ativo',      variant: 'success' as const },
    blocked:     { label: 'Bloqueado',  variant: 'danger' as const },
  }
  const statusInfo = statusConfig[accessStatus as keyof typeof statusConfig] ?? statusConfig.not_created

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado`))
  }

  function buildWhatsAppMessage(cred: CredentialResult) {
    const origin = window.location.origin
    return `Olá, ${cred.partner_name}! 🔑 Seu acesso ao portal Rei dos Cachos foi criado.\n\nLogin: ${cred.phone}\nSenha: ${cred.created_password}\nAcesse em: ${origin}/login\n\nGuarde esses dados.`
  }

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Acesso ao portal</h3>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      {/* Metadados */}
      {profile.credentials_created_at && (
        <p className="text-[12px] text-muted-foreground mb-1">
          Criado em {new Date(profile.credentials_created_at).toLocaleDateString('pt-BR')}
          {profile.auth_phone && <> · Login: <span className="font-medium text-foreground">{profile.auth_phone}</span></>}
        </p>
      )}
      {profile.last_password_reset_at && (
        <p className="text-[12px] text-muted-foreground mb-3">
          Senha resetada em {new Date(profile.last_password_reset_at).toLocaleDateString('pt-BR')}
        </p>
      )}

      {/* Senha manual opcional */}
      {(accessStatus === 'not_created' || accessStatus === 'active') && showPasswordInput && (
        <div className="flex items-center gap-2 mb-3">
          <Input
            type="text"
            placeholder="Senha personalizada (opcional)"
            value={manualPassword}
            onChange={e => setManualPassword(e.target.value)}
            aria-label="Senha personalizada"
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setShowPasswordInput(false); setManualPassword('') }}
            aria-label="Cancelar senha personalizada"
          >
            <X />
          </Button>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        {accessStatus === 'not_created' && (
          <>
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={isLoading}>
              {isLoading ? <Loader className="animate-spin" /> : <KeyRound />}
              Criar acesso
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowPasswordInput(v => !v)}>
              Definir senha
            </Button>
          </>
        )}

        {accessStatus === 'active' && (
          <>
            <Button size="sm" onClick={() => resetMutation.mutate()} disabled={isLoading}>
              {resetMutation.isPending ? <Loader className="animate-spin" /> : <RefreshCw />}
              Resetar senha
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowPasswordInput(v => !v)}>
              Definir senha
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => blockMutation.mutate()}
              disabled={isLoading}
              className="text-danger hover:text-danger hover:bg-danger-subtle"
            >
              {blockMutation.isPending ? <Loader className="animate-spin" /> : <Lock />}
              Bloquear
            </Button>
          </>
        )}

        {accessStatus === 'blocked' && (
          <Button variant="secondary" size="sm" onClick={() => unblockMutation.mutate()} disabled={isLoading}>
            {unblockMutation.isPending ? <Loader className="animate-spin" /> : <Unlock />}
            Desbloquear
          </Button>
        )}
      </div>

      {/* Credenciais geradas */}
      {credResult && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-3.5 space-y-2.5">
          <p className="text-[13px] font-medium text-foreground">Credenciais geradas</p>

          <div className="flex items-center justify-between gap-2 bg-card border border-border rounded-md px-3 py-2">
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground leading-none">Login</p>
              <p className="text-[13.5px] font-mono font-medium text-foreground mt-1 truncate">{credResult.phone}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(credResult.phone, 'Login')} aria-label="Copiar login">
              <Copy />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 bg-card border border-border rounded-md px-3 py-2">
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground leading-none">Senha</p>
              <p className="text-[13.5px] font-mono font-medium text-foreground mt-1 truncate">{credResult.created_password}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(credResult.created_password, 'Senha')} aria-label="Copiar senha">
              <Copy />
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copyToClipboard(buildWhatsAppMessage(credResult), 'Mensagem')}
              className="flex-1"
            >
              <Copy />
              Copiar mensagem
            </Button>
            {/* Verde WhatsApp: exceção de marca documentada */}
            <Button size="sm" asChild className="flex-1 bg-green-600 hover:bg-green-700 text-white">
              <a
                href={`https://wa.me/${credResult.phone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsAppMessage(credResult))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle />
                Abrir WhatsApp
              </a>
            </Button>
          </div>

          <Button variant="ghost" size="xs" onClick={() => setCredResult(null)} className="w-full text-muted-foreground">
            Fechar
          </Button>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Lista de clientes — visão padrão
// --------------------------------------------------------------------------
//
// A tela abria num kanban do funil de NAVEGAÇÃO do site (visitou → viu
// produto → carrinho…), que é analytics, não gestão de cliente. Quem vende
// precisa responder "quem eu chamo agora e quanto essa pessoa vale": por isso
// a visão padrão virou uma lista com último pedido, total comprado, vendedor
// e próxima ação. Fila e Funil continuam disponíveis como visões secundárias.

type ClientView = 'list' | 'queue' | 'funnel'
type QuickFilter = 'all' | 'contatar' | 'ativos' | 'parados' | 'novos' | 'minhas'
type SortKey = 'priority' | 'last_order' | 'spent' | 'name'

const SEGMENT_TABS: { key: SegmentTab; label: string }[] = [
  { key: 'wholesale_buyer', label: 'Atacado' },
  { key: 'network_partner', label: 'Parceiros da rede' },
  { key: 'all', label: 'Todos' },
]

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function relativeDays(iso: string | null | undefined): string {
  const d = daysAgo(iso)
  if (d === null) return '—'
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  const m = Math.floor(d / 30)
  return m === 1 ? 'há 1 mês' : `há ${m} meses`
}

function matchesQuickFilter(s: ClientSession, f: QuickFilter, mySellerId: string | null): boolean {
  const cs = s as unknown as CrmFilterSession
  switch (f) {
    case 'contatar': {
      const p = getQueuePriority(cs)
      return p === 'vencido' || p === 'hoje'
    }
    case 'ativos': {
      const d = daysAgo(s.profile?.last_order_at)
      return d !== null && d <= 30
    }
    case 'parados':
      return isSemPedido30d(cs)
    case 'novos':
      return isNovoSemPrimeiroPedido(cs)
    case 'minhas':
      return !!mySellerId && s.profile?.seller_id === mySellerId
    default:
      return true
  }
}

function matchesSearch(s: ClientSession, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  const digits = q.replace(/\D/g, '')
  const p = s.profile
  const hay = [p?.full_name, s.email, p?.seller_name].filter(Boolean).join(' ').toLowerCase()
  if (hay.includes(needle)) return true
  if (digits.length >= 3) {
    const nums = [p?.phone, p?.auth_phone, p?.document].filter(Boolean).join(' ').replace(/\D/g, '')
    if (nums.includes(digits)) return true
  }
  return false
}


function NextActionCell({ session }: { session: ClientSession }) {
  const p = session.profile
  const priority = getQueuePriority(session as unknown as CrmFilterSession)
  if (!p?.next_action) {
    return <span className="text-[12px] text-ink-400">Sem próxima ação</span>
  }
  const when = p.next_action_at
    ? new Date(p.next_action_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null
  const tone =
    priority === 'vencido' ? 'text-danger' : priority === 'hoje' ? 'text-warning' : 'text-ink-500'
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-foreground truncate" title={p.next_action}>{p.next_action}</p>
      {when && (
        <p className={`text-[12px] font-medium mt-0.5 ${tone}`}>
          {priority === 'vencido' ? `Venceu ${when}` : priority === 'hoje' ? 'Hoje' : when}
        </p>
      )}
    </div>
  )
}

function SortHeader({ label, k, sort, setSort, className = '' }: {
  label: string; k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; className?: string
}) {
  const active = sort === k
  return (
    <th className={`px-3 h-10 text-left font-medium ${className}`}>
      <button
        onClick={() => setSort(k)}
        className={`inline-flex items-center gap-1 text-[12px] transition-colors ${active ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        {active && <ChevronDown className="w-3.5 h-3.5 text-brand-strong" />}
      </button>
    </th>
  )
}

function ClientList({ rows, sort, setSort, onOpen }: {
  rows: ClientSession[]
  sort: SortKey
  setSort: (k: SortKey) => void
  onOpen: (id: string) => void
}) {
  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden md:block rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <table className="w-full table-fixed">
          <thead className="border-b border-border bg-surface">
            <tr>
              <SortHeader label="Cliente" k="name" sort={sort} setSort={setSort} className="w-[30%] pl-5" />
              <SortHeader label="Último pedido" k="last_order" sort={sort} setSort={setSort} className="w-[15%]" />
              <SortHeader label="Total comprado" k="spent" sort={sort} setSort={setSort} className="w-[15%]" />
              <th className="px-3 h-10 text-left text-[12px] font-medium text-muted-foreground w-[13%]">Vendedor</th>
              <SortHeader label="Próxima ação" k="priority" sort={sort} setSort={setSort} className="w-[22%]" />
              <th className="w-[5%]" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(s => {
              const p = s.profile
              const name = getClientName(s)
              const lastDays = daysAgo(p?.last_order_at)
              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  className="group cursor-pointer hover:bg-muted/60 transition-colors"
                >
                  <td className="pl-5 pr-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 ${
                          p?.customer_segment === 'network_partner'
                            ? 'bg-brand-subtle text-brand-strong ring-1 ring-inset ring-brand-border'
                            : 'bg-muted text-ink-600'
                        }`}
                        aria-hidden
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-foreground truncate">{name}</p>
                        <p className="text-[12px] text-muted-foreground truncate">
                          {[p?.business_type ? businessTypeLabels[p.business_type] ?? p.business_type : null, p?.phone]
                            .filter(Boolean)
                            .join(' • ') || s.email || 'Ficha incompleta'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {p?.last_order_at ? (
                      <>
                        <p className="text-[13px] text-foreground">{relativeDays(p.last_order_at)}</p>
                        <p className={`text-[12px] mt-0.5 ${lastDays !== null && lastDays > 30 ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
                          {new Date(p.last_order_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </p>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-400">Nunca comprou</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[14px] font-semibold text-foreground numeric">{brl(p?.total_spent ?? 0)}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5 numeric">
                      {p?.total_orders ?? 0} {(p?.total_orders ?? 0) === 1 ? 'pedido' : 'pedidos'}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[13px] text-ink-600 truncate block">{p?.seller_name ?? '—'}</span>
                  </td>
                  <td className="px-3 py-3"><NextActionCell session={s} /></td>
                  <td className="pr-4 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-brand-strong inline-block transition-colors" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões */}
      <div className="md:hidden space-y-2">
        {rows.map(s => {
          const p = s.profile
          const name = getClientName(s)
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="w-full text-left rounded-lg border border-border bg-card shadow-xs hover:border-ink-300 transition-colors p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground truncate">{name}</p>
                  <p className="text-[12px] text-muted-foreground truncate">{p?.phone || s.email || 'Ficha incompleta'}</p>
                </div>
                <p className="text-[15px] font-semibold text-foreground numeric shrink-0">{brl(p?.total_spent ?? 0)}</p>
              </div>
              <div className="flex items-end justify-between gap-3 mt-3 pt-3 border-t border-border">
                <NextActionCell session={s} />
                <span className="text-[12px] text-muted-foreground shrink-0">
                  {p?.last_order_at ? `Comprou ${relativeDays(p.last_order_at)}` : 'Nunca comprou'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

export default function AdminClientes() {
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [clientToDelete, setClientToDelete] = useState<ClientSession | null>(null)

  const [view, setView] = useState<ClientView>('list')
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [activeQueueView, setActiveQueueView] = useState<string>('all')
  // Segmento ativo vale para as três visões. Foco principal é atacado.
  const [activeSegmentTab, setActiveSegmentTab] = useState<SegmentTab>('wholesale_buyer')

  // "Minhas contas" — resolvido automaticamente via RPC
  const { data: mySellerId = null } = useQuery({
    queryKey: ['my-seller-id'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_my_seller_id')
      if (error) throw error
      return (data as string | null) ?? null
    },
    staleTime: 5 * 60 * 1000,
  })

  // Ao trocar segmento: se a view ativa da fila não existe no novo segmento, volta para 'all'
  function handleSegmentChange(seg: SegmentTab) {
    setActiveSegmentTab(seg)
    const availableViews = getViewsForSegment(seg)
    if (!availableViews.find(v => v.key === activeQueueView)) {
      setActiveQueueView('all')
    }
  }

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.rpc('admin_delete_test_client', { p_client_id: clientId })
      if (error) throw error
      return clientId
    },
    onSuccess: () => {
      toast.success('Cliente de teste excluído permanentemente')
      setClientToDelete(null)
      setSelectedSessionId(null)
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any) => {
      console.error("DEBUG DELETE CLIENT ERROR:", err)
      toast.error(`Falha: ${err.message || 'Verifique se ele possui pedidos.'}`)
    }
  })

  const { data: sellers = [] } = useQuery({
    queryKey: ['active-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_sellers_for_dropdown')
      if (error) throw error
      return (data ?? []) as { id: string; name: string; code: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['client-sessions'],
    queryFn: async () => {
      const { data: sessionData, error: sessionError } = await supabase
        .from('client_sessions')
        .select('*')
        .order('updated_at', { ascending: false })

      if (sessionError) throw sessionError
      const rawSessions = (sessionData || []) as Array<Omit<ClientSession, 'profile' | 'orders' | 'tags'>>

      const userIds = [...new Set(rawSessions.map(s => s.user_id).filter(Boolean))] as string[]

      let profilesMap: Record<string, ClientProfile> = {}
      let ordersMap: Record<string, OrderSummary[]> = {}

      if (userIds.length > 0) {
        // Use get_all_profiles() RPC — admin_read_all_profiles policy was removed
        // to avoid RLS recursion, so .from('profiles') only returns the admin's own row
        const { data: profilesData } = await supabase.rpc('get_all_profiles')

        if (profilesData) {
          const relevantProfiles = (profilesData as any[]).filter(p => userIds.includes(p.id))
          profilesMap = Object.fromEntries(relevantProfiles.map(p => [p.id, {
            full_name: p.full_name,
            phone: p.phone,
            document_type: p.document_type,
            document: p.document,
            business_type: p.business_type,
            employees: p.employees,
            revenue: p.revenue,
            customer_segment: p.customer_segment ?? null,
            access_status: p.access_status ?? 'not_created',
            auth_phone: p.auth_phone ?? null,
            credentials_created_at: p.credentials_created_at ?? null,
            last_password_reset_at: p.last_password_reset_at ?? null,
            price_list_id: p.price_list_id ?? null,
            price_list_name: p.price_list_name ?? null,
            assigned_seller: p.assigned_seller ?? null,
            seller_id: p.seller_id ?? null,
            seller_name: p.seller_name ?? null,
            next_action: p.next_action ?? null,
            next_action_at: p.next_action_at ?? null,
            total_orders: Number(p.total_orders ?? 0),
            total_spent: Number(p.total_spent ?? 0),
            first_order_at: p.first_order_at ?? null,
            last_order_at: p.last_order_at ?? null,
          }]))
        }

        const { data: ordersData } = await supabase
          .from('orders')
          .select(`
            id, status, total, created_at, user_id,
            order_items (
              id, product_name_snapshot, qty, unit_price_snapshot, line_total,
              catalog_products ( main_image )
            )
          `)
          .in('user_id', userIds)
          .order('created_at', { ascending: false })

        if (ordersData) {
          for (const order of ordersData) {
            const uid = (order as any).user_id as string
            if (!ordersMap[uid]) ordersMap[uid] = []
            ordersMap[uid].push(order as unknown as OrderSummary)
          }
        }

      }

      return rawSessions.map(s => ({
        ...s,
        profile: s.user_id ? (profilesMap[s.user_id] || null) : null,
        orders: s.user_id ? (ordersMap[s.user_id] || []) : [],
      })) as ClientSession[]
    },
    staleTime: 30 * 1000,
  })

  // ── Base comum: segmento + busca ──────────────────────────────────────────
  const segmentedAll = useMemo(
    () => (applySegmentFilter(sessions as unknown as CrmFilterSession[], activeSegmentTab) as unknown as ClientSession[])
      .filter(s => matchesSearch(s, search.trim())),
    [sessions, activeSegmentTab, search],
  )
  // Cliente = sessão com conta e ficha. Visitante anônimo só aparece no funil.
  const clients = useMemo(() => segmentedAll.filter(s => s.user_id && s.profile), [segmentedAll])

  const segmentCounts = useMemo(() => {
    const base = sessions.filter(s => s.user_id && s.profile)
    return Object.fromEntries(
      SEGMENT_TABS.map(t => [t.key, applySegmentFilter(base as unknown as CrmFilterSession[], t.key).length]),
    ) as Record<SegmentTab, number>
  }, [sessions])

  const quickCounts = useMemo(() => {
    const keys: QuickFilter[] = ['all', 'contatar', 'ativos', 'parados', 'novos', 'minhas']
    return Object.fromEntries(
      keys.map(k => [k, clients.filter(s => matchesQuickFilter(s, k, mySellerId)).length]),
    ) as Record<QuickFilter, number>
  }, [clients, mySellerId])

  // ── Lista ─────────────────────────────────────────────────────────────────
  const listRows = useMemo(() => {
    const rows = clients.filter(s => matchesQuickFilter(s, quickFilter, mySellerId))
    switch (sort) {
      case 'priority':
        return sortWorkQueue(rows as unknown as CrmFilterSession[]) as unknown as ClientSession[]
      case 'last_order':
        return [...rows].sort((a, b) =>
          new Date(b.profile?.last_order_at ?? 0).getTime() - new Date(a.profile?.last_order_at ?? 0).getTime())
      case 'spent':
        return [...rows].sort((a, b) => (b.profile?.total_spent ?? 0) - (a.profile?.total_spent ?? 0))
      case 'name':
        return [...rows].sort((a, b) => getClientName(a).localeCompare(getClientName(b), 'pt-BR'))
    }
  }, [clients, quickFilter, sort, mySellerId])

  // ── Fila comercial ────────────────────────────────────────────────────────
  const queueSessions = useMemo(() => {
    const viewed = applyQueueView(clients as unknown as CrmFilterSession[], activeQueueView, mySellerId ?? '')
    return sortWorkQueue(viewed) as unknown as ClientSession[]
  }, [clients, activeQueueView, mySellerId])

  const queueCounts = useMemo(() => Object.fromEntries(
    QUEUE_VIEWS.map(v => [v.key, applyQueueView(clients as unknown as CrmFilterSession[], v.key, mySellerId ?? '').length]),
  ), [clients, mySellerId])

  const availableQueueViews = useMemo(() => getViewsForSegment(activeSegmentTab), [activeSegmentTab])

  // ── Funil do site (inclui visitantes anônimos quando o segmento é Todos) ──
  const grouped = Object.fromEntries(
    funnelStages.map(s => [s.key, segmentedAll.filter(sess => sess.status === s.key)])
  )

  const selectedSession = selectedSessionId
    ? (sessions.find(s => s.id === selectedSessionId) ?? null)
    : null

  const totalSessions = segmentedAll.length
  const conversionRate = totalSessions > 0
    ? ((grouped['comprou']?.length || 0) / totalSessions * 100).toFixed(1)
    : '0'

  const VIEW_OPTIONS: { key: ClientView; label: string; icon: typeof Users }[] = [
    { key: 'list', label: 'Lista', icon: Users },
    { key: 'queue', label: 'Fila de contato', icon: LayoutList },
    { key: 'funnel', label: 'Funil do site', icon: Columns3 },
  ]

  const subtitle =
    view === 'funnel'
      ? `Etapa de navegação de cada visitante no site.${totalSessions > 0 ? ` ${conversionRate}% chegaram a comprar.` : ''}`
      : view === 'queue'
      ? 'Quem precisa de contato, do mais urgente para o menos urgente.'
      : 'Sua carteira: quanto cada cliente comprou e qual é o próximo passo.'

  return (
    <AdminLayout>
      <AdminPage
        title="Clientes"
        description={subtitle}
        flush={view === 'funnel'}
        actions={
          <Segmented
            items={VIEW_OPTIONS}
            value={view}
            onChange={(k) => setView(k as ClientView)}
          />
        }
        tabs={
          <PageTabs
            items={SEGMENT_TABS.map(seg => ({ key: seg.key, label: seg.label, count: segmentCounts[seg.key] ?? 0 }))}
            value={activeSegmentTab}
            onChange={(k) => handleSegmentChange(k as SegmentTab)}
          />
        }
        toolbar={
          <div className="space-y-3">
            <Toolbar>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar nome, telefone ou CNPJ"
              />
            </Toolbar>

            {/* Fila: visões prontas */}
            {view === 'queue' && !isLoading && (
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
                {availableQueueViews.map(qv => {
                  const count = queueCounts[qv.key] ?? 0
                  const isActive = activeQueueView === qv.key
                  const noSeller = qv.key === 'my_accounts' && !mySellerId
                  return (
                    <button
                      key={qv.key}
                      type="button"
                      onClick={() => !noSeller && setActiveQueueView(qv.key)}
                      disabled={noSeller}
                      aria-pressed={isActive}
                      title={noSeller ? 'Nenhum vendedor vinculado ao seu usuário. Configure em Vendedores.' : undefined}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                        isActive
                          ? 'bg-brand-subtle text-brand-strong border-brand-border'
                          : 'bg-card text-ink-600 border-border hover:border-ink-300 hover:text-foreground'
                      }`}
                    >
                      {qv.label}
                      {count > 0 && <span className="text-[12px] tabular-nums opacity-70">{count}</span>}
                    </button>
                  )
                })}
                {mySellerId && (
                  <span className="ml-auto pl-3 text-[12px] text-muted-foreground whitespace-nowrap inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-solid" aria-hidden />
                    {sellers.find(s => s.id === mySellerId)?.name ?? 'Vendedor vinculado'}
                  </span>
                )}
              </div>
            )}
          </div>
        }
      >
        {/* ── LISTA ── */}
        {view === 'list' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard wrapHint label="Todos" hint="no segmento" value={quickCounts.all}
                active={quickFilter === 'all'} onClick={() => setQuickFilter('all')} />
              <StatCard wrapHint label="Contatar hoje" hint="follow-up vencido ou de hoje" value={quickCounts.contatar}
                icon={AlertTriangle} tone="danger"
                active={quickFilter === 'contatar'} onClick={() => setQuickFilter('contatar')} />
              <StatCard wrapHint label="Compraram no mês" hint="pedido nos últimos 30 dias" value={quickCounts.ativos}
                icon={CheckCircle} tone="success"
                active={quickFilter === 'ativos'} onClick={() => setQuickFilter('ativos')} />
              <StatCard wrapHint label="Parados" hint="sem pedido há mais de 30 dias" value={quickCounts.parados}
                icon={Clock} tone="warning"
                active={quickFilter === 'parados'} onClick={() => setQuickFilter('parados')} />
              <StatCard wrapHint label="Novos sem pedido" hint="cadastro nos últimos 7 dias" value={quickCounts.novos}
                icon={Sparkles} tone="info"
                active={quickFilter === 'novos'} onClick={() => setQuickFilter('novos')} />
              {mySellerId && (
                <StatCard wrapHint label="Minhas contas" hint="vinculadas a você" value={quickCounts.minhas}
                  icon={User}
                  active={quickFilter === 'minhas'} onClick={() => setQuickFilter('minhas')} />
              )}
            </div>

            {isLoading ? (
              <PageLoading label="Carregando clientes…" />
            ) : listRows.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={Users}
                  title="Nenhum cliente aqui"
                  description={search
                    ? 'Nenhum cliente bate com a busca. Confira a grafia ou troque o segmento.'
                    : 'Troque o filtro acima ou o segmento para ver outros clientes.'}
                />
              </Panel>
            ) : (
              <ClientList rows={listRows} sort={sort} setSort={setSort} onOpen={setSelectedSessionId} />
            )}
          </div>
        )}

        {/* ── FUNIL ── */}
        {view === 'funnel' && (
          isLoading ? (
            <PageLoading label="Carregando funil…" />
          ) : segmentedAll.length === 0 ? (
            <div className={PAGE_X}>
              <Panel>
                <EmptyState
                  icon={Users}
                  title="Nenhum visitante neste segmento"
                  description="Os visitantes aparecem aqui quando acessam o catálogo."
                />
              </Panel>
            </div>
          ) : (
            <div className={`overflow-x-auto scrollbar-thin ${PAGE_X} pb-6`}>
              <div className="flex gap-3 min-w-max items-start">
                {funnelStages.map((stage) => {
                  const items = grouped[stage.key] || []
                  return (
                    <div key={stage.key} className="flex flex-col w-[272px] sm:w-[300px] bg-surface rounded-lg border border-border shrink-0 max-h-[75vh]">
                      <div className="h-11 px-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${stage.indicatorColor}`} />
                          <h3 className="text-[13px] font-semibold text-foreground truncate">{stage.label}</h3>
                        </div>
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-[11.5px] font-medium text-ink-500 tabular-nums inline-flex items-center justify-center">
                          {items.length}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                        {items.length === 0 ? (
                          <div className="h-16 flex items-center justify-center rounded-md border border-border border-dashed">
                            <span className="text-[12px] text-muted-foreground">Ninguém nesta etapa</span>
                          </div>
                        ) : (
                          items.slice(0, 30).map((session) => {
                            const clientName = getClientName(session)
                            const labels = getClientLabels(session)
                            return (
                              <button
                                key={session.id}
                                type="button"
                                onClick={() => setSelectedSessionId(session.id)}
                                className="w-full text-left bg-card border border-border rounded-lg shadow-xs hover:border-ink-300 transition-colors p-3 flex flex-col gap-1.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2" title={clientName}>{clientName}</p>
                                  <span className="text-[12px] text-muted-foreground shrink-0">
                                    {new Date(session.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                  </span>
                                </div>
                                <p className="text-[12px] text-muted-foreground truncate">
                                  {session.profile?.phone || (session.user_id ? 'Ficha incompleta' : 'Visitante anônimo')}
                                </p>
                                {(labels.length > 0 || session.cart_items_count > 0) && (
                                  <div className="flex items-center justify-between gap-2 pt-2 mt-0.5 border-t border-border">
                                    <div className="flex items-center gap-2 text-muted-foreground truncate">
                                      {labels.map(l => (
                                        <span key={l.text} className="inline-flex items-center gap-1 text-[12px]">
                                          <l.icon className="w-3 h-3" />
                                          {l.text}
                                        </span>
                                      ))}
                                    </div>
                                    {session.cart_items_count > 0 && (
                                      <span className="text-[12px] font-medium text-brand-strong whitespace-nowrap">
                                        {session.cart_items_count} no carrinho
                                      </span>
                                    )}
                                  </div>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* ── FILA COMERCIAL ── */}
        {view === 'queue' && (
          isLoading ? (
            <PageLoading label="Carregando fila…" />
          ) : queueSessions.length === 0 ? (
            <Panel>
              <EmptyState
                icon={LayoutList}
                title="Fila vazia"
                description={activeQueueView === 'my_accounts' && !mySellerId
                  ? 'Seu usuário não está vinculado a nenhum vendedor. Um admin pode configurar isso em Vendedores.'
                  : 'Ninguém para contatar neste filtro.'}
              />
            </Panel>
          ) : (
            <div className="max-w-3xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <p className="text-[12px] text-muted-foreground">
                  {queueSessions.length} cliente{queueSessions.length !== 1 ? 's' : ''}, do mais urgente ao menos urgente
                </p>
                <div className="flex items-center gap-1.5">
                  {(['vencido', 'hoje', 'sem_acao'] as const).map(p => {
                    const conf = QUEUE_PRIORITY_CONFIG[p]
                    const count = queueSessions.filter(
                      s => getQueuePriority(s as unknown as CrmFilterSession) === p
                    ).length
                    if (count === 0) return null
                    return (
                      <Badge key={p} variant={conf.variant} className="tabular-nums">
                        {conf.label} {count}
                      </Badge>
                    )
                  })}
                </div>
              </div>

              {queueSessions.map(session => (
                <WorkQueueCard
                  key={session.id}
                  session={session}
                  priority={getQueuePriority(session as unknown as CrmFilterSession)}
                  onOpen={() => setSelectedSessionId(session.id)}
                />
              ))}
            </div>
          )
        )}
      </AdminPage>

      {selectedSession && (
        <ClientDetailPanel
          session={selectedSession}
          onClose={() => setSelectedSessionId(null)}
          onDeleteClick={() => setClientToDelete(selectedSession)}
        />
      )}

      {/* Confirmação de exclusão */}
      <Dialog
        open={!!clientToDelete}
        onOpenChange={(open) => { if (!open && !deleteClientMutation.isPending) setClientToDelete(null) }}
      >
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          {clientToDelete && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[16px]">Excluir cliente?</DialogTitle>
                {!(clientToDelete.orders && clientToDelete.orders.length > 0) && (
                  <DialogDescription>
                    Esta ação apaga o cadastro inteiro de <strong className="font-semibold text-foreground">{getClientName(clientToDelete)}</strong> (sessão e histórico) e não pode ser desfeita.
                  </DialogDescription>
                )}
              </DialogHeader>
              {clientToDelete.orders && clientToDelete.orders.length > 0 ? (
                <>
                  <div className="flex items-start gap-2 text-[13px] text-warning bg-warning-subtle p-3 rounded-md border border-warning-border">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>Este cliente tem {clientToDelete.orders.length} pedido(s) vinculado(s). Exclua os pedidos antes de excluir o cliente.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="secondary" onClick={() => setClientToDelete(null)}>Voltar</Button>
                  </DialogFooter>
                </>
              ) : (
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="secondary"
                    onClick={() => setClientToDelete(null)}
                    disabled={deleteClientMutation.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const targetId = clientToDelete.user_id || clientToDelete.id
                      deleteClientMutation.mutate(targetId)
                    }}
                    disabled={deleteClientMutation.isPending}
                  >
                    {deleteClientMutation.isPending && <Loader className="animate-spin" />}
                    Excluir cliente
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
