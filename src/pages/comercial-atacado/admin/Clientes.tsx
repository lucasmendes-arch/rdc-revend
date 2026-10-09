import { useState, useMemo } from 'react'
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
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { AdminSelect } from '@/components/admin/ui/AdminSelect'
import { QUEUE_VIEWS, applyQueueView, applySegmentFilter, getQueuePriority, getViewsForSegment, isNovoSemPrimeiroPedido, isSemPedido30d, sortWorkQueue } from '@/lib/crmFilters'
import type { CrmFilterSession, QueuePriority, SegmentTab } from '@/lib/crmFilters'
import { ORDER_STATUS, ORDER_STATUS_SEQUENCE, toneClasses } from '@/lib/design/orderStatus'
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
    label: 'Visitou o Site',
    subtitle: 'Navegou no catálogo',
    icon: Eye,
    indicatorColor: 'bg-ink-300',
  },
  {
    key: 'visualizou_produto',
    label: 'Vis. Produtos',
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
  salao: 'Salão de Beleza',
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

// Cor e rótulo vêm de orderStatus.ts — o mesmo status tem a mesma cor em qualquer tela.
const orderStatusLabels: Record<string, { label: string; color: string }> = Object.fromEntries(
  ORDER_STATUS_SEQUENCE.map((s) => {
    const meta = ORDER_STATUS[s]
    const t = toneClasses(meta.tone)
    return [s, { label: meta.label, color: `${t.bg} ${t.text}` }]
  }),
)

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
  badgeClasses: string
  borderClasses: string
  barClasses: string
}> = {
  vencido: {
    label: 'Vencido',
    badgeClasses: 'bg-danger-subtle text-danger ring-danger-border',
    borderClasses: 'border-danger-border hover:border-danger-border',
    barClasses: 'bg-danger-solid',
  },
  hoje: {
    label: 'Hoje',
    badgeClasses: 'bg-warning-subtle text-warning ring-warning-border',
    borderClasses: 'border-warning-border hover:border-warning-border',
    barClasses: 'bg-warning-solid',
  },
  sem_acao: {
    label: 'Sem ação',
    badgeClasses: 'bg-muted text-muted-foreground ring-border',
    borderClasses: 'border-border hover:border-border/80',
    barClasses: 'bg-muted-foreground/30',
  },
  futuro: {
    label: '',
    badgeClasses: '',
    borderClasses: 'border-border hover:border-border/80',
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

  return (
    <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border space-y-2">
      <input
        type="text"
        value={actionText}
        onChange={e => setActionText(e.target.value)}
        placeholder="Ex: Ligar, Enviar proposta..."
        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground"
        autoFocus
      />
      <input
        type="datetime-local"
        value={actionDate}
        onChange={e => setActionDate(e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40 text-foreground"
      />
      <div className="flex gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={isLoading || !actionText.trim()}
          className="btn-action flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Salvar
        </button>
        {nextAction && (
          <button
            onClick={() => clearMutation.mutate()}
            disabled={isLoading}
            className="px-2 py-1.5 text-xs font-medium text-danger bg-danger-subtle border border-danger-border rounded-lg hover:bg-danger-subtle disabled:opacity-50 transition-colors"
          >
            Remover
          </button>
        )}
        <button
          onClick={onClose}
          className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
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
    <div className={`bg-card rounded-xl border ${pConf.borderClasses} flex overflow-hidden transition-all`}>
      {/* Priority bar */}
      <div className={`w-1 flex-shrink-0 ${pConf.barClasses}`} />

      {/* Card content */}
      <div className="flex-1 min-w-0 p-3.5">
        {/* Row 1: name + priority badge + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-foreground truncate leading-snug">{name}</h4>
            {priority !== 'futuro' && (
              <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${pConf.badgeClasses}`}>
                {pConf.label}
              </span>
            )}
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            <button
              onClick={() => setInlineEditing(v => !v)}
              title="Editar próxima ação"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpen}
              className="btn-action flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
            >
              Abrir <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Row 2: owner + segment */}
        {(profile.seller_name || profile.customer_segment) && (
          <div className="flex items-center gap-2 mt-1">
            {profile.seller_name && (
              <span className="text-[11px] text-muted-foreground">
                <span className="text-muted-foreground">Owner:</span>{' '}
                <span className="text-foreground font-medium">{profile.seller_name}</span>
              </span>
            )}
            {profile.customer_segment && (
              <span className={`inline-flex items-center text-[10px] font-bold px-1 py-0.5 rounded ring-1 ring-inset ${segmentBadgeColor(profile.customer_segment).replace('border-', 'ring-')}`}>
                {segmentLabel(profile.customer_segment)}
              </span>
            )}
          </div>
        )}

        {/* Row 3: próxima ação */}
        {profile.next_action && !inlineEditing && (
          <div className="mt-2 flex items-start gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-px" />
            <div className="min-w-0">
              <p className="text-xs text-foreground line-clamp-1">{profile.next_action}</p>
              {nextActionDate && (
                <p className={`text-[10px] font-medium mt-0.5 ${
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
          <p className="mt-2 text-[11px] text-muted-foreground italic">Sem próxima ação definida</p>
        )}

        {/* Inline next action editor */}
        {inlineEditing && (
          <InlineNextActionForm
            userId={session.user_id!}
            nextAction={profile.next_action}
            nextActionAt={profile.next_action_at}
            onClose={() => setInlineEditing(false)}
          />
        )}

        {/* Row 4: order stats */}
        {!inlineEditing && (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border pt-2">
            {lastOrderDate ? (
              <span>Último pedido: <span className="text-foreground font-medium">{lastOrderDate}</span></span>
            ) : (
              <span className="italic">Sem pedidos</span>
            )}
            {profile.total_orders > 0 && (
              <span>{profile.total_orders} {profile.total_orders === 1 ? 'pedido' : 'pedidos'}</span>
            )}
            {totalSpentFormatted && (
              <span className="font-medium text-muted-foreground">{totalSpentFormatted}</span>
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
  { value: 'network_partner', label: 'Parceiro da Rede' },
  { value: 'wholesale_buyer', label: 'Comprador Atacado' },
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

  return (
    <>
      <div className="fixed inset-0 bg-foreground/30 z-40 transition-opacity backdrop-blur-sm" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-card z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-border">
        {/* Header */}
        <div className="border-b border-border px-5 py-4 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center text-background font-bold text-sm flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">{clientName}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset text-white ${stageInfo.indicatorColor}`}>
                <StageIcon className="w-3 h-3" />
                {stageInfo.label}
              </span>
              {labels.map(l => (
                <span key={l.text} className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${l.color}`}>
                  <l.icon className="w-2.5 h-2.5" />
                  {l.text}
                </span>
              ))}
              {profile?.customer_segment && (
                <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${segmentBadgeColor(profile.customer_segment).replace(/border-/g, 'ring-')}`}>
                  {segmentLabel(profile.customer_segment)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Client Profile */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Dados do Cadastro</h3>
              {session.user_id && profile && !editingProfile && (
                <button
                  onClick={startEditProfile}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted border border-border transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Editar
                </button>
              )}
              {editingProfile && (
                <button
                  onClick={() => setEditingProfile(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Nome completo</label>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40 text-foreground"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40 text-foreground"
                    placeholder="Ex: 5527999990000"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-24">
                    <label className="block text-[11px] text-muted-foreground mb-1">Tipo doc.</label>
                    <StyledSelect
                      value={profileForm.document_type}
                      onChange={(v) => setProfileForm(p => ({ ...p, document_type: v }))}
                      options={[{ value: 'CPF', label: 'CPF' }, { value: 'CNPJ', label: 'CNPJ' }]}
                      emptyLabel="—"
                      placeholder="—"
                      className="px-2 rounded-lg bg-card"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] text-muted-foreground mb-1">Número</label>
                    <input
                      type="text"
                      value={profileForm.document}
                      onChange={e => setProfileForm(p => ({ ...p, document: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40 text-foreground"
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Tipo de atuação</label>
                  <StyledSelect
                    value={profileForm.business_type}
                    onChange={(v) => setProfileForm(p => ({ ...p, business_type: v }))}
                    options={Object.entries(businessTypeLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                    className="rounded-lg bg-card"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Funcionários</label>
                  <StyledSelect
                    value={profileForm.employees}
                    onChange={(v) => setProfileForm(p => ({ ...p, employees: v }))}
                    options={Object.entries(employeesLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                    className="rounded-lg bg-card"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Faturamento estimado</label>
                  <StyledSelect
                    value={profileForm.revenue}
                    onChange={(v) => setProfileForm(p => ({ ...p, revenue: v }))}
                    options={Object.entries(revenueLabels).map(([value, label]) => ({ value, label }))}
                    emptyLabel="Não informado"
                    placeholder="Não informado"
                    className="rounded-lg bg-card"
                  />
                </div>
                <button
                  onClick={() => updateProfileMutation.mutate(profileForm)}
                  disabled={updateProfileMutation.isPending}
                  className="btn-action flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {updateProfileMutation.isPending
                    ? <Loader className="w-4 h-4 animate-spin" />
                    : <Check className="w-4 h-4" />}
                  Salvar alterações
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {profile?.full_name && (
                  <InfoRow icon={User} label="Nome Completo" value={profile.full_name} />
                )}
                {session.email && (
                  <InfoRow icon={Mail} label="E-mail" value={session.email} />
                )}
                {profile?.phone && (
                  <InfoRow icon={Phone} label="WhatsApp / Telefone" value={profile.phone} />
                )}
                {profile?.document && (
                  <InfoRow icon={FileText} label={profile.document_type || 'Documento'} value={profile.document} />
                )}
                {profile?.business_type && (
                  <InfoRow icon={Building2} label="Tipo de Atuação" value={businessTypeLabels[profile.business_type] || profile.business_type} />
                )}
                {profile?.employees && (
                  <InfoRow icon={Users} label="Funcionários" value={employeesLabels[profile.employees] || profile.employees} />
                )}
                {profile?.revenue && (
                  <InfoRow icon={DollarSign} label="Faturamento Estimado" value={revenueLabels[profile.revenue] || profile.revenue} />
                )}
                {profile && !profile.full_name && !profile.phone && !profile.document && (
                  <div className="bg-warning-subtle ring-1 ring-inset ring-warning-border text-warning p-3 rounded-lg text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <p>Perfil incompleto — clique em Editar para preencher.</p>
                  </div>
                )}
                {!profile && session.user_id && (
                  <div className="bg-muted ring-1 ring-inset ring-border text-muted-foreground p-3 rounded-lg text-xs flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin flex-shrink-0 text-muted-foreground/50" />
                    <p>Aguardando sincronização de perfil.</p>
                  </div>
                )}
                {!profile && !session.user_id && !session.email && (
                  <p className="text-sm text-muted-foreground italic">Visitante anônimo — sem dados de perfil</p>
                )}
              </div>
            )}
          </div>

          {/* Commercial Segment */}
          {session.user_id && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Segmento Comercial</h3>
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
                {profile?.customer_segment && (
                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${segmentBadgeColor(profile.customer_segment).replace(/border-/g, 'ring-')}`}>
                    {segmentLabel(profile.customer_segment)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Responsável Comercial */}
          {session.user_id && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Responsável Comercial</h3>
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
                {profile?.seller_name && !sellerMutation.isPending && (
                  <span className="text-xs font-medium text-foreground bg-muted px-2 py-1 rounded-md">
                    {profile.seller_name}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Próxima Ação */}
          {session.user_id && (
            <NextActionEditor
              userId={session.user_id}
              nextAction={profile?.next_action ?? null}
              nextActionAt={profile?.next_action_at ?? null}
            />
          )}

          {/* Partner Access */}
          {session.user_id && profile?.customer_segment === 'network_partner' && (
            <PartnerAccessSection session={session} />
          )}

          {/* Price List */}
          {session.user_id && profile?.customer_segment === 'network_partner' && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Tabela de Preço</h3>
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

          {/* Cart info */}
          {session.cart_items_count > 0 && orders.length === 0 && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5">Carrinho</h3>
              <div className="flex items-center gap-3 bg-warning-subtle rounded-lg p-3.5 ring-1 ring-inset ring-warning-border">
                <div className="w-9 h-9 rounded-lg bg-warning-subtle flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-bold text-warning">
                    {session.cart_items_count} {session.cart_items_count === 1 ? 'item' : 'itens'} no carrinho
                  </p>
                  <p className="text-[11px] text-warning mt-0.5">
                    Armazenado no navegador do cliente
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Orders */}
          {orders.length > 0 && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5">
                Pedidos ({orders.length})
              </h3>
              <div className="space-y-3">
                {orders.map((order) => {
                  const statusInfo = orderStatusLabels[order.status] || { label: order.status, color: 'bg-ink-100 text-ink-600' }
                  return (
                    <div key={order.id} className="bg-muted/30 rounded-xl border border-border overflow-hidden">
                      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border bg-card">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13px] font-bold text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${statusInfo.color.replace(/bg-/, 'ring-').replace(/text-.*/, '')} ${statusInfo.color}`}>{statusInfo.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-extrabold text-foreground">R$ {Number(order.total).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="p-2.5 space-y-1.5">
                        {order.order_items.map((item) => {
                          let imgUrl: string | null = null
                          if (Array.isArray(item.catalog_products)) {
                            imgUrl = (item.catalog_products as any)[0]?.main_image
                          } else {
                            imgUrl = item.catalog_products?.main_image || null
                          }
                          return (
                            <div key={item.id} className="flex items-center gap-2.5 bg-card rounded-lg p-2 border border-border">
                              {imgUrl ? (
                                <img src={imgUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                  <Package className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{item.qty}× R$ {Number(item.unit_price_snapshot).toFixed(2)}</p>
                              </div>
                              <span className="text-[13px] font-bold text-foreground flex-shrink-0">R$ {Number(item.line_total).toFixed(2)}</span>
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

          {/* Activity */}
          <div className="px-5 py-4 bg-muted/30">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5">Atividade da Sessão</h3>
            <div className="space-y-3">
              <InfoRow icon={Calendar} label="Primeira visita" value={new Date(session.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              <InfoRow icon={Clock} label="Última atividade" value={new Date(session.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              {session.last_page && (
                <InfoRow icon={Eye} label="Última página" value={session.last_page} />
              )}
            </div>
          </div>

          {/* Notas Internas */}
          {session.user_id && (
            <CustomerNotes userId={session.user_id} />
          )}

          {/* Danger Zone */}
          <div className="px-5 py-5 mt-2 border-t border-border">
            <button
              onClick={onDeleteClick}
              className="w-full py-2.5 px-4 rounded-xl ring-1 ring-inset ring-danger-border text-danger bg-danger-subtle hover:bg-danger-subtle font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Cliente
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">Ação administrativa irreversível</p>
          </div>
        </div>
      </div>
    </>
  )
}



// Reusable info row
function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-medium text-foreground truncate mt-0.5">{value}</p>
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
    not_created: { label: 'Sem acesso', classes: 'bg-muted text-muted-foreground ring-border' },
    active:      { label: 'Ativo',      classes: 'bg-success-subtle text-success ring-success-border' },
    blocked:     { label: 'Bloqueado',  classes: 'bg-danger-subtle text-danger ring-danger-border' },
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Acesso ao Portal</h3>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${statusInfo.classes}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Metadata */}
      {profile.credentials_created_at && (
        <p className="text-[11px] text-muted-foreground mb-1">
          Criado em {new Date(profile.credentials_created_at).toLocaleDateString('pt-BR')}
          {profile.auth_phone && <> · Login: <span className="font-medium text-foreground">{profile.auth_phone}</span></>}
        </p>
      )}
      {profile.last_password_reset_at && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Senha resetada em {new Date(profile.last_password_reset_at).toLocaleDateString('pt-BR')}
        </p>
      )}

      {/* Optional manual password input */}
      {(accessStatus === 'not_created' || accessStatus === 'active') && showPasswordInput && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            placeholder="Senha personalizada (opcional)"
            value={manualPassword}
            onChange={e => setManualPassword(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring/40 focus:outline-none bg-card text-foreground"
          />
          <button onClick={() => { setShowPasswordInput(false); setManualPassword('') }} className="text-ink-400 hover:text-ink-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {accessStatus === 'not_created' && (
          <>
            <button
              onClick={() => createMutation.mutate()}
              disabled={isLoading}
              className="btn-action flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              {isLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Criar Acesso
            </button>
            <button
              onClick={() => setShowPasswordInput(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              Definir senha
            </button>
          </>
        )}

        {accessStatus === 'active' && (
          <>
            <button
              onClick={() => resetMutation.mutate()}
              disabled={isLoading}
              className="btn-action flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              {resetMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Resetar Senha
            </button>
            <button
              onClick={() => setShowPasswordInput(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              Definir senha
            </button>
            <button
              onClick={() => blockMutation.mutate()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-danger-border text-danger bg-danger-subtle rounded-lg hover:bg-danger-subtle disabled:opacity-50 transition-colors"
            >
              {blockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Bloquear
            </button>
          </>
        )}

        {accessStatus === 'blocked' && (
          <button
            onClick={() => unblockMutation.mutate()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-ink-900 text-white rounded-lg hover:bg-ink-700 disabled:opacity-50 transition-colors"
          >
            {unblockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
            Desbloquear
          </button>
        )}
      </div>

      {/* Credential result box */}
      {credResult && (
        <div className="mt-4 bg-ink-900 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Credenciais geradas</p>

          <div className="flex items-center justify-between gap-2 bg-ink-800 rounded-lg px-3 py-2">
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Login</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">{credResult.phone}</p>
            </div>
            <button onClick={() => copyToClipboard(credResult.phone, 'Login')} className="p-1.5 rounded-md hover:bg-ink-700 text-ink-400 hover:text-white transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 bg-ink-800 rounded-lg px-3 py-2">
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Senha</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">{credResult.created_password}</p>
            </div>
            <button onClick={() => copyToClipboard(credResult.created_password, 'Senha')} className="p-1.5 rounded-md hover:bg-ink-700 text-ink-400 hover:text-white transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => copyToClipboard(buildWhatsAppMessage(credResult), 'Mensagem')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-ink-700 text-white rounded-lg hover:bg-ink-600 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar msg WA
            </button>
            <a
              href={`https://wa.me/${credResult.phone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsAppMessage(credResult))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Abrir WhatsApp
            </a>
          </div>

          <button onClick={() => setCredResult(null)} className="w-full text-[10px] text-ink-600 hover:text-ink-400 transition-colors pt-1">
            Fechar
          </button>
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

/** Cartão-resumo que também é filtro: o número explica a lista que aparece embaixo. */
function StatFilter({ label, hint, count, active, tone, onClick, disabled }: {
  label: string
  hint: string
  count: number
  active: boolean
  tone: 'neutral' | 'danger' | 'success' | 'warning' | 'info'
  onClick: () => void
  disabled?: boolean
}) {
  const dot = {
    neutral: 'bg-ink-400',
    danger: 'bg-danger-solid',
    success: 'bg-success-solid',
    warning: 'bg-warning-solid',
    info: 'bg-info-solid',
  }[tone]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`text-left min-w-[150px] flex-1 rounded-xl border px-4 py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'border-brand-border bg-brand-subtle ring-1 ring-inset ring-brand-border'
          : 'border-border bg-card hover:border-ink-300'
      }`}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-600">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden />
        {label}
      </span>
      <span className="block text-[24px] font-semibold tracking-tight leading-none text-foreground mt-2 numeric">{count}</span>
      <span className="block text-[11px] text-muted-foreground mt-1.5 truncate">{hint}</span>
    </button>
  )
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
        <p className={`text-[11px] font-medium mt-0.5 ${tone}`}>
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
      <div className="hidden md:block surface-card overflow-hidden">
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
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${
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
                        <p className={`text-[11px] mt-0.5 ${lastDays !== null && lastDays > 30 ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
                          {new Date(p.last_order_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </p>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-400">Nunca comprou</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[14px] font-semibold text-foreground numeric">{brl(p?.total_spent ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 numeric">
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
              className="w-full text-left surface-card surface-card-interactive p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground truncate">{name}</p>
                  <p className="text-[12px] text-muted-foreground truncate">{p?.phone || s.email || 'Ficha incompleta'}</p>
                </div>
                <p className="text-[15px] font-bold text-foreground numeric shrink-0">{brl(p?.total_spent ?? 0)}</p>
              </div>
              <div className="flex items-end justify-between gap-3 mt-3 pt-3 border-t border-border">
                <NextActionCell session={s} />
                <span className="text-[11px] text-muted-foreground shrink-0">
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
      {/* ── HEADER ── */}
      <div className="bg-card border-b border-border sticky top-0 z-30 flex flex-col w-full text-left">
        <AdminHeader
          title="Clientes"
          subtitle={subtitle}
          actionNode={
            <div role="tablist" aria-label="Visão" className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
              {VIEW_OPTIONS.map(o => {
                const active = view === o.key
                return (
                  <button
                    key={o.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(o.key)}
                    className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-colors ${
                      active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <o.icon className={`w-3.5 h-3.5 ${active ? 'text-brand-strong' : ''}`} />
                    {o.label}
                  </button>
                )
              })}
            </div>
          }
        />

        {/* Segmento + busca: valem para as três visões */}
        <div className="px-4 sm:px-6 lg:px-8 pb-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted overflow-x-auto scrollbar-none">
            {SEGMENT_TABS.map(seg => {
              const active = activeSegmentTab === seg.key
              return (
                <button
                  key={seg.key}
                  onClick={() => handleSegmentChange(seg.key)}
                  className={`flex items-center gap-2 h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                      : 'text-ink-500 hover:text-foreground'
                  }`}
                >
                  {seg.label}
                  <span className={`text-[11px] font-semibold numeric ${active ? 'opacity-70' : 'text-ink-400'}`}>
                    {segmentCounts[seg.key] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone ou CNPJ"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </div>
        </div>

        {/* Fila: views prontas */}
        {view === 'queue' && !isLoading && (
          <div className="w-full border-t border-border px-4 sm:px-6 lg:px-8 overflow-x-auto flex flex-nowrap gap-1.5 items-center py-2.5 scrollbar-none">
            {availableQueueViews.map(qv => {
              const count = queueCounts[qv.key] ?? 0
              const isActive = activeQueueView === qv.key
              const noSeller = qv.key === 'my_accounts' && !mySellerId
              return (
                <button
                  key={qv.key}
                  onClick={() => !noSeller && setActiveQueueView(qv.key)}
                  disabled={noSeller}
                  title={noSeller ? 'Nenhum vendedor vinculado ao seu usuário. Configure em Vendedores.' : undefined}
                  className={`flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-brand-subtle text-brand-strong ring-1 ring-inset ring-brand-border'
                      : noSeller
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'text-ink-600 border border-border hover:bg-muted'
                  }`}
                >
                  {qv.label}
                  {count > 0 && <span className="text-[11px] font-semibold numeric opacity-70">{count}</span>}
                </button>
              )
            })}
            {mySellerId && (
              <span className="ml-auto pl-3 text-[12px] text-muted-foreground whitespace-nowrap">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-solid mr-1.5 align-middle" />
                {sellers.find(s => s.id === mySellerId)?.name ?? 'Vendedor vinculado'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── LISTA ── */}
      {view === 'list' && (
        <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-4">
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
            <StatFilter label="Todos" hint="no segmento" count={quickCounts.all} tone="neutral"
              active={quickFilter === 'all'} onClick={() => setQuickFilter('all')} />
            <StatFilter label="Contatar hoje" hint="follow-up vencido ou de hoje" count={quickCounts.contatar} tone="danger"
              active={quickFilter === 'contatar'} onClick={() => setQuickFilter('contatar')} />
            <StatFilter label="Compraram no mês" hint="pedido nos últimos 30 dias" count={quickCounts.ativos} tone="success"
              active={quickFilter === 'ativos'} onClick={() => setQuickFilter('ativos')} />
            <StatFilter label="Parados" hint="sem pedido há mais de 30 dias" count={quickCounts.parados} tone="warning"
              active={quickFilter === 'parados'} onClick={() => setQuickFilter('parados')} />
            <StatFilter label="Novos sem pedido" hint="cadastro nos últimos 7 dias" count={quickCounts.novos} tone="info"
              active={quickFilter === 'novos'} onClick={() => setQuickFilter('novos')} />
            {mySellerId && (
              <StatFilter label="Minhas contas" hint="vinculadas a você" count={quickCounts.minhas} tone="neutral"
                active={quickFilter === 'minhas'} onClick={() => setQuickFilter('minhas')} />
            )}
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader className="w-7 h-7 animate-spin text-ink-300 mb-3" />
              <p className="text-sm text-muted-foreground">Carregando clientes…</p>
            </div>
          ) : listRows.length === 0 ? (
            <div className="surface-card flex flex-col items-center justify-center py-20 px-4 text-center">
              <Users className="w-8 h-8 text-ink-300 mb-3" />
              <p className="text-[16px] font-semibold text-foreground">Nenhum cliente aqui</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {search
                  ? 'Nenhum cliente bate com a busca. Confira a grafia ou troque o segmento.'
                  : 'Troque o filtro acima ou o segmento para ver outros clientes.'}
              </p>
            </div>
          ) : (
            <ClientList rows={listRows} sort={sort} setSort={setSort} onOpen={setSelectedSessionId} />
          )}
        </div>
      )}

      {/* ── FUNNEL BOARD ── */}
      {view === 'funnel' && (
        <div className="w-full flex-1 min-w-0 relative bg-surface min-h-[calc(100vh-210px)]">
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden scrollbar-thin px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-4 sm:pb-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 w-full">
                <Loader className="w-7 h-7 animate-spin text-ink-300 mb-3" />
                <p className="text-sm text-muted-foreground">Carregando funil…</p>
              </div>
            ) : segmentedAll.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 surface-card max-w-4xl mx-auto w-full">
                <Users className="w-10 h-10 text-ink-300 mb-4" />
                <h3 className="text-[16px] font-semibold text-foreground">Nenhum visitante neste segmento</h3>
                <p className="text-muted-foreground text-sm mt-1 text-center max-w-xs">Os visitantes aparecem aqui quando acessam o catálogo.</p>
              </div>
            ) : (
              <div className="flex gap-4 min-w-max h-full items-start">
                {funnelStages.map((stage) => {
                  const items = grouped[stage.key] || []
                  return (
                    <div key={stage.key} className="flex flex-col w-[260px] sm:w-[300px] bg-muted/60 rounded-xl border border-border shrink-0 self-stretch max-h-[75vh]">
                      <div className="p-3 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${stage.indicatorColor}`} />
                          <h3 className="font-semibold text-[13px] text-foreground">{stage.label}</h3>
                        </div>
                        <span className="text-[11px] font-semibold text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-full numeric">
                          {items.length}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
                        {items.length === 0 ? (
                          <div className="h-16 flex items-center justify-center rounded-lg border border-border border-dashed">
                            <span className="text-[12px] text-muted-foreground">Ninguém nesta etapa</span>
                          </div>
                        ) : (
                          items.slice(0, 30).map((session) => {
                            const clientName = getClientName(session)
                            const labels = getClientLabels(session)
                            return (
                              <button
                                key={session.id}
                                onClick={() => setSelectedSessionId(session.id)}
                                className="w-full text-left surface-card surface-card-interactive p-3 flex flex-col gap-1.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2" title={clientName}>{clientName}</p>
                                  <span className="text-[11px] text-muted-foreground shrink-0">
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
                                        <span key={l.text} className="inline-flex items-center gap-1 text-[11px]">
                                          <l.icon className="w-3 h-3" />
                                          {l.text}
                                        </span>
                                      ))}
                                    </div>
                                    {session.cart_items_count > 0 && (
                                      <span className="text-[11px] font-medium text-brand-strong whitespace-nowrap">
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
            )}
          </div>
        </div>
      )}

      {/* ── FILA COMERCIAL ── */}
      {view === 'queue' && (
        <div className="w-full flex-1 min-h-[calc(100vh-210px)] bg-surface">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader className="w-7 h-7 animate-spin text-ink-300 mb-3" />
              <p className="text-sm text-muted-foreground">Carregando fila…</p>
            </div>
          ) : queueSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 max-w-md mx-auto text-center px-4">
              <LayoutList className="w-8 h-8 text-ink-300 mb-3" />
              <h3 className="text-[16px] font-semibold text-foreground mb-1">Fila vazia</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {activeQueueView === 'my_accounts' && !mySellerId
                  ? 'Seu usuário não está vinculado a nenhum vendedor. Um admin pode configurar isso em Vendedores.'
                  : 'Ninguém para contatar neste filtro.'}
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[12px] text-muted-foreground">
                  {queueSessions.length} cliente{queueSessions.length !== 1 ? 's' : ''}, do mais urgente ao menos urgente
                </p>
                <div className="flex items-center gap-2">
                  {(['vencido', 'hoje', 'sem_acao'] as const).map(p => {
                    const conf = QUEUE_PRIORITY_CONFIG[p]
                    const count = queueSessions.filter(
                      s => getQueuePriority(s as unknown as CrmFilterSession) === p
                    ).length
                    if (count === 0) return null
                    return (
                      <span key={p} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${conf.badgeClasses}`}>
                        {conf.label} {count}
                      </span>
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
          )}
        </div>
      )}

      {selectedSession && (
        <ClientDetailPanel
          session={selectedSession}
          onClose={() => setSelectedSessionId(null)}
          onDeleteClick={() => setClientToDelete(selectedSession)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {clientToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-border">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-danger-subtle rounded-full flex items-center justify-center mx-auto mb-4 border border-danger-border">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Excluir Cliente?</h3>
              {clientToDelete.orders && clientToDelete.orders.length > 0 ? (
                <>
                  <p className="text-sm text-warning font-medium bg-warning-subtle p-3 rounded-lg border border-warning-border mb-6">
                    Bloqueado: Este cliente possui {clientToDelete.orders.length} pedido(s) vinculados. Você deve excluir os pedidos antes de excluir o cliente.
                  </p>
                  <button onClick={() => setClientToDelete(null)} className="w-full py-3 px-4 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-bold transition-colors">Voltar</button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-6 px-2">Esta ação apagará o cadastro inteiro deste cliente (sessão e histórico). Confirma a exclusão de <strong>{getClientName(clientToDelete)}</strong>?</p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setClientToDelete(null)}
                      disabled={deleteClientMutation.isPending}
                      className="flex-1 py-3 px-4 border border-border text-foreground hover:bg-muted rounded-xl font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const targetId = clientToDelete.user_id || clientToDelete.id
                        deleteClientMutation.mutate(targetId)
                      }}
                      disabled={deleteClientMutation.isPending}
                      className="flex-1 py-3 px-4 bg-danger-solid hover:bg-danger-solid/90 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      {deleteClientMutation.isPending ? <Loader className="w-5 h-5 animate-spin" /> : "Excluir"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
