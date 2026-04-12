import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Loader, Eye, MousePointerClick, ShoppingCart, CreditCard,
  CheckCircle, XCircle, X, User, Phone, Mail, Tag, Edit2, Check,
  Building2, FileText, Package, Clock, Calendar, Users, DollarSign, Sparkles, AlertTriangle, Trash2, TrendingUp,
  KeyRound, Copy, Lock, Unlock, MessageCircle, RefreshCw, LayoutList, Columns3, ChevronRight,
} from 'lucide-react'
import { CustomerTimeline } from '@/components/admin/CustomerTimeline'
import { NextActionEditor } from '@/components/admin/NextActionEditor'
import { CustomerNotes } from '@/components/admin/CustomerNotes'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard'
import { AdminSelect } from '@/components/admin/ui/AdminSelect'
import { OPERATIONAL_FILTERS, QUEUE_VIEWS, applyQueueView, getQueuePriority, sortWorkQueue } from '@/lib/crmFilters'
import type { CrmFilterSession, QueuePriority } from '@/lib/crmFilters'

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
  tags: { id: string; name: string; slug: string; type: string; color: string }[]
}

const funnelStages = [
  {
    key: 'visitou',
    label: 'Visitou o Site',
    subtitle: 'Navegou no catálogo',
    icon: Eye,
    indicatorColor: 'bg-slate-300',
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
    indicatorColor: 'bg-amber-400',
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
    indicatorColor: 'bg-emerald-500',
  },
  {
    key: 'abandonou',
    label: 'Abandonou',
    subtitle: 'Saiu sem fechar',
    icon: XCircle,
    indicatorColor: 'bg-red-400',
  },
] as const

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

const orderStatusLabels: Record<string, { label: string; color: string }> = {
  recebido: { label: 'Recebido', color: 'bg-blue-100 text-blue-700' },
  aguardando_pagamento: { label: 'Aguardando Pgto', color: 'bg-orange-100 text-orange-700' },
  pago: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
  separacao: { label: 'Separação', color: 'bg-yellow-100 text-yellow-700' },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-700' },
  entregue: { label: 'Entregue', color: 'bg-teal-100 text-teal-700' },
  concluido: { label: 'Concluído', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
  expirado: { label: 'Expirado', color: 'bg-gray-100 text-gray-500' },
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
    labels.push({ text: 'Novo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Sparkles })
  }

  // Sem compra (cadastrado há mais de 7 dias e menos de 30 dias, sem pedido)
  if (!hasPurchased && daysSinceCreation > 7 && daysSinceCreation <= 30) {
    labels.push({ text: 'Sem compra', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle })
  }

  // Sem compra há 30+ dias
  if (!hasPurchased && daysSinceCreation > 30) {
    labels.push({ text: `${Math.floor(daysSinceCreation)}d sem compra`, color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle })
  }

  return labels
}

function getClientName(session: ClientSession): string {
  return session.profile?.full_name || session.email || `Visitante ${session.session_id.slice(0, 8)}`
}

import { getTagColorClasses } from '@/utils/crm'

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
    badgeClasses: 'bg-red-100 text-red-700 ring-red-200',
    borderClasses: 'border-red-200 hover:border-red-300',
    barClasses: 'bg-red-400',
  },
  hoje: {
    label: 'Hoje',
    badgeClasses: 'bg-amber-100 text-amber-700 ring-amber-200',
    borderClasses: 'border-amber-200 hover:border-amber-300',
    barClasses: 'bg-amber-400',
  },
  sem_acao: {
    label: 'Sem ação',
    badgeClasses: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
    borderClasses: 'border-zinc-200 hover:border-zinc-300',
    barClasses: 'bg-zinc-300',
  },
  futuro: {
    label: '',
    badgeClasses: '',
    borderClasses: 'border-zinc-200 hover:border-zinc-300',
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
    <div className="mt-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-2">
      <input
        type="text"
        value={actionText}
        onChange={e => setActionText(e.target.value)}
        placeholder="Ex: Ligar, Enviar proposta..."
        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
        autoFocus
      />
      <input
        type="datetime-local"
        value={actionDate}
        onChange={e => setActionDate(e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
      />
      <div className="flex gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={isLoading || !actionText.trim()}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Salvar
        </button>
        {nextAction && (
          <button
            onClick={() => clearMutation.mutate()}
            disabled={isLoading}
            className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            Remover
          </button>
        )}
        <button
          onClick={onClose}
          className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
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
    <div className={`bg-white rounded-xl border ${pConf.borderClasses} flex overflow-hidden transition-all`}>
      {/* Priority bar */}
      <div className={`w-1 flex-shrink-0 ${pConf.barClasses}`} />

      {/* Card content */}
      <div className="flex-1 min-w-0 p-3.5">
        {/* Row 1: name + priority badge + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-zinc-900 truncate leading-snug">{name}</h4>
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
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpen}
              className="flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
            >
              Abrir <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Row 2: owner + segment */}
        {(profile.seller_name || profile.customer_segment) && (
          <div className="flex items-center gap-2 mt-1">
            {profile.seller_name && (
              <span className="text-[11px] text-zinc-400">
                <span className="text-zinc-400">Owner:</span>{' '}
                <span className="text-zinc-600 font-medium">{profile.seller_name}</span>
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
            <Clock className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-px" />
            <div className="min-w-0">
              <p className="text-xs text-zinc-700 line-clamp-1">{profile.next_action}</p>
              {nextActionDate && (
                <p className={`text-[10px] font-medium mt-0.5 ${
                  priority === 'vencido' ? 'text-red-500' :
                  priority === 'hoje' ? 'text-amber-600' :
                  'text-zinc-400'
                }`}>
                  {priority === 'vencido' ? 'Venceu ' : 'Agendado '}{nextActionDate}
                </p>
              )}
            </div>
          </div>
        )}
        {!profile.next_action && !inlineEditing && (
          <p className="mt-2 text-[11px] text-zinc-400 italic">Sem próxima ação definida</p>
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
          <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400 border-t border-zinc-100 pt-2">
            {lastOrderDate ? (
              <span>Último pedido: <span className="text-zinc-600 font-medium">{lastOrderDate}</span></span>
            ) : (
              <span className="italic">Sem pedidos</span>
            )}
            {profile.total_orders > 0 && (
              <span>{profile.total_orders} {profile.total_orders === 1 ? 'pedido' : 'pedidos'}</span>
            )}
            {totalSpentFormatted && (
              <span className="font-medium text-zinc-500">{totalSpentFormatted}</span>
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
  if (v === 'network_partner') return 'bg-amber-100 text-amber-700 border-amber-300'
  if (v === 'wholesale_buyer') return 'bg-teal-100 text-teal-700 border-teal-300'
  return 'bg-gray-100 text-gray-500 border-gray-200'
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
      <div className="fixed inset-0 bg-zinc-900/40 z-40 transition-opacity backdrop-blur-sm" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="border-b border-zinc-200 px-5 py-4 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-zinc-900 truncate">{clientName}</h2>
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
              {session.tags?.map(t => (
                <span key={t.id} className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-50 text-zinc-600 ring-1 ring-inset ring-zinc-200">
                  {t.name}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Client Profile */}
          <div className="px-5 py-4 border-b border-zinc-200">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Dados do Cadastro</h3>
              {session.user_id && profile && !editingProfile && (
                <button
                  onClick={startEditProfile}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Editar
                </button>
              )}
              {editingProfile && (
                <button
                  onClick={() => setEditingProfile(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Nome completo</label>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    placeholder="Ex: 5527999990000"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-24">
                    <label className="block text-[11px] text-zinc-500 mb-1">Tipo doc.</label>
                    <select
                      value={profileForm.document_type}
                      onChange={e => setProfileForm(p => ({ ...p, document_type: e.target.value }))}
                      className="w-full px-2 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      <option value="">—</option>
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] text-zinc-500 mb-1">Número</label>
                    <input
                      type="text"
                      value={profileForm.document}
                      onChange={e => setProfileForm(p => ({ ...p, document: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Tipo de atuação</label>
                  <select
                    value={profileForm.business_type}
                    onChange={e => setProfileForm(p => ({ ...p, business_type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    <option value="">Não informado</option>
                    {Object.entries(businessTypeLabels).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Funcionários</label>
                  <select
                    value={profileForm.employees}
                    onChange={e => setProfileForm(p => ({ ...p, employees: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    <option value="">Não informado</option>
                    {Object.entries(employeesLabels).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Faturamento estimado</label>
                  <select
                    value={profileForm.revenue}
                    onChange={e => setProfileForm(p => ({ ...p, revenue: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    <option value="">Não informado</option>
                    {Object.entries(revenueLabels).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => updateProfileMutation.mutate(profileForm)}
                  disabled={updateProfileMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors"
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
                  <div className="bg-amber-50 ring-1 ring-inset ring-amber-200 text-amber-700 p-3 rounded-lg text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <p>Perfil incompleto — clique em Editar para preencher.</p>
                  </div>
                )}
                {!profile && session.user_id && (
                  <div className="bg-zinc-50 ring-1 ring-inset ring-zinc-200 text-zinc-600 p-3 rounded-lg text-xs flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin flex-shrink-0 text-zinc-400" />
                    <p>Aguardando sincronização de perfil.</p>
                  </div>
                )}
                {!profile && !session.user_id && !session.email && (
                  <p className="text-sm text-zinc-400 italic">Visitante anônimo — sem dados de perfil</p>
                )}
              </div>
            )}
          </div>

          {/* Commercial Segment */}
          {session.user_id && (
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Segmento Comercial</h3>
              <div className="flex items-center gap-3">
                <select
                  value={profile?.customer_segment || ''}
                  onChange={e => segmentMutation.mutate(e.target.value || null)}
                  disabled={segmentMutation.isPending}
                  className="appearance-none px-3 py-1.5 text-sm font-medium border border-zinc-200 rounded-lg bg-white focus:ring-2 focus:ring-zinc-400 focus:outline-none transition-all"
                >
                  {SEGMENT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {segmentMutation.isPending && <Loader className="w-4 h-4 animate-spin text-zinc-400" />}
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
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Responsável Comercial</h3>
              <div className="flex items-center gap-3">
                <AdminSelect
                  options={activeSellers.map(s => ({ value: s.id, label: s.name }))}
                  value={profile?.seller_id || ''}
                  onChange={v => sellerMutation.mutate(v || null)}
                  placeholder="Sem responsável"
                  allLabel="Sem responsável"
                  icon={Users}
                />
                {sellerMutation.isPending && <Loader className="w-4 h-4 animate-spin text-zinc-400" />}
                {profile?.seller_name && !sellerMutation.isPending && (
                  <span className="text-xs font-medium text-zinc-600 bg-zinc-100 px-2 py-1 rounded-md">
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
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Tabela de Preço</h3>
              <div className="flex items-center gap-3">
                <AdminSelect
                  options={availablePriceLists.map(l => ({ value: l.id, label: l.name }))}
                  value={profile?.price_list_id || ''}
                  onChange={v => priceListMutation.mutate(v || null)}
                  placeholder="Preço padrão do catálogo"
                  allLabel="Preço padrão do catálogo"
                />
                {priceListMutation.isPending && <Loader className="w-4 h-4 animate-spin text-zinc-400" />}
              </div>
            </div>
          )}

          {/* Cart info */}
          {session.cart_items_count > 0 && orders.length === 0 && (
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5">Carrinho</h3>
              <div className="flex items-center gap-3 bg-amber-50 rounded-lg p-3.5 ring-1 ring-inset ring-amber-200">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    {session.cart_items_count} {session.cart_items_count === 1 ? 'item' : 'itens'} no carrinho
                  </p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Armazenado no navegador do cliente
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Orders */}
          {orders.length > 0 && (
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5">
                Pedidos ({orders.length})
              </h3>
              <div className="space-y-3">
                {orders.map((order) => {
                  const statusInfo = orderStatusLabels[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={order.id} className="bg-zinc-50 rounded-xl border border-zinc-200/80 overflow-hidden">
                      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-zinc-200/60 bg-white">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13px] font-bold text-zinc-900">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${statusInfo.color.replace(/bg-/, 'ring-').replace(/text-.*/, '')} ${statusInfo.color}`}>{statusInfo.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-extrabold text-zinc-900">R$ {Number(order.total).toFixed(2)}</p>
                          <p className="text-[10px] text-zinc-400 font-medium">{new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
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
                            <div key={item.id} className="flex items-center gap-2.5 bg-white rounded-lg p-2 border border-zinc-100">
                              {imgUrl ? (
                                <img src={imgUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-4 h-4 text-zinc-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-zinc-800 truncate">{item.product_name_snapshot}</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">{item.qty}× R$ {Number(item.unit_price_snapshot).toFixed(2)}</p>
                              </div>
                              <span className="text-[13px] font-bold text-zinc-800 flex-shrink-0">R$ {Number(item.line_total).toFixed(2)}</span>
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
          <div className="px-5 py-4 bg-zinc-50">
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5">Atividade da Sessão</h3>
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

          {/* Timeline Completa */}
          {session.user_id && (
            <CustomerTimeline userId={session.user_id} />
          )}

          {/* Danger Zone */}
          <div className="px-5 py-5 mt-2 border-t border-zinc-200">
            <button
              onClick={onDeleteClick}
              className="w-full py-2.5 px-4 rounded-xl ring-1 ring-inset ring-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Cliente
            </button>
            <p className="text-[10px] text-zinc-400 text-center mt-2">Ação administrativa irreversível</p>
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
      <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 leading-none">{label}</p>
        <p className="text-sm font-medium text-zinc-800 truncate mt-0.5">{value}</p>
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
    not_created: { label: 'Sem acesso', classes: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
    active:      { label: 'Ativo',      classes: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
    blocked:     { label: 'Bloqueado',  classes: 'bg-red-100 text-red-600 ring-red-200' },
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
    <div className="px-5 py-4 border-b border-zinc-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Acesso ao Portal</h3>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${statusInfo.classes}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Metadata */}
      {profile.credentials_created_at && (
        <p className="text-[11px] text-zinc-400 mb-1">
          Criado em {new Date(profile.credentials_created_at).toLocaleDateString('pt-BR')}
          {profile.auth_phone && <> · Login: <span className="font-medium text-zinc-600">{profile.auth_phone}</span></>}
        </p>
      )}
      {profile.last_password_reset_at && (
        <p className="text-[11px] text-zinc-400 mb-3">
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
            className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-400 focus:outline-none bg-white"
          />
          <button onClick={() => { setShowPasswordInput(false); setManualPassword('') }} className="text-zinc-400 hover:text-zinc-600 p-1">
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Criar Acesso
            </button>
            <button
              onClick={() => setShowPasswordInput(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:border-zinc-300 text-zinc-600 transition-colors"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {resetMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Resetar Senha
            </button>
            <button
              onClick={() => setShowPasswordInput(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:border-zinc-300 text-zinc-600 transition-colors"
            >
              Definir senha
            </button>
            <button
              onClick={() => blockMutation.mutate()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {unblockMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
            Desbloquear
          </button>
        )}
      </div>

      {/* Credential result box */}
      {credResult && (
        <div className="mt-4 bg-zinc-900 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Credenciais geradas</p>

          <div className="flex items-center justify-between gap-2 bg-zinc-800 rounded-lg px-3 py-2">
            <div>
              <p className="text-[10px] text-zinc-500 leading-none">Login</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">{credResult.phone}</p>
            </div>
            <button onClick={() => copyToClipboard(credResult.phone, 'Login')} className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 bg-zinc-800 rounded-lg px-3 py-2">
            <div>
              <p className="text-[10px] text-zinc-500 leading-none">Senha</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">{credResult.created_password}</p>
            </div>
            <button onClick={() => copyToClipboard(credResult.created_password, 'Senha')} className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => copyToClipboard(buildWhatsAppMessage(credResult), 'Mensagem')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition-colors"
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

          <button onClick={() => setCredResult(null)} className="w-full text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors pt-1">
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminClientes() {
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('')
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState<string>('wholesale_buyer')
  const [selectedOperationalFilter, setSelectedOperationalFilter] = useState<string>('')
  const [clientToDelete, setClientToDelete] = useState<ClientSession | null>(null)

  // ── Fila Comercial ─────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'funnel' | 'queue'>('funnel')
  const [activeQueueView, setActiveQueueView] = useState<string>('all')
  // "Minhas contas": persiste o seller_id do usuário atual via localStorage
  const [mySellerId, setMySellerId] = useState<string>(() =>
    localStorage.getItem('rdc_my_seller_id') ?? '',
  )

  function persistMySellerId(id: string) {
    setMySellerId(id)
    if (id) localStorage.setItem('rdc_my_seller_id', id)
    else localStorage.removeItem('rdc_my_seller_id')
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

  // Sellers para o selector "Identificar como" na fila comercial
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
      let tagsMap: Record<string, any[]> = {}

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

        const { data: tagsData } = await supabase
          .from('crm_customer_tags')
          .select(`
            user_id,
            tag:crm_tags (id, name, slug, type, color)
          `)
          .in('user_id', userIds)

        if (tagsData) {
          for (const ct of tagsData) {
            const uid = ct.user_id as string
            if (!tagsMap[uid]) tagsMap[uid] = []
            const tagObj = Array.isArray(ct.tag) ? ct.tag[0] : ct.tag
            if (tagObj) tagsMap[uid].push(tagObj)
          }
        }
      }

      return rawSessions.map(s => ({
        ...s,
        profile: s.user_id ? (profilesMap[s.user_id] || null) : null,
        orders: s.user_id ? (ordersMap[s.user_id] || []) : [],
        tags: s.user_id ? (tagsMap[s.user_id] || []) : [],
      })) as ClientSession[]
    },
    staleTime: 30 * 1000,
  })

  // Derive unique tags from loaded sessions to populate the filter dropdown
  const availableTags = useMemo(() => {
    const map = new Map<string, any>()
    sessions.forEach(s => {
      s.tags?.forEach(t => map.set(t.id, t))
    })
    return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name))
  }, [sessions])

  const filteredSessions = useMemo(() => {
    let result = sessions
    if (selectedSegmentFilter) {
      result = result.filter(s => s.profile?.customer_segment === selectedSegmentFilter)
    }
    if (selectedTagFilter) {
      result = result.filter(s => s.tags?.some(t => t.id === selectedTagFilter))
    }
    if (selectedOperationalFilter) {
      const filter = OPERATIONAL_FILTERS.find(f => f.key === selectedOperationalFilter)
      if (filter) {
        result = result.filter(s => filter.predicate(s as unknown as CrmFilterSession))
      }
    }
    return result
  }, [sessions, selectedTagFilter, selectedSegmentFilter, selectedOperationalFilter])

  // ── Fila comercial: base de sessões com profile + ordenação por prioridade ──
  const queueSessions = useMemo(() => {
    // Somente clientes com perfil e user_id (exclui visitantes anônimos)
    const base = sessions.filter(s => s.user_id && s.profile)
    const viewed = applyQueueView(base as unknown as CrmFilterSession[], activeQueueView, mySellerId)
    return sortWorkQueue(viewed) as unknown as ClientSession[]
  }, [sessions, activeQueueView, mySellerId])

  // Contagem por view para os pills
  const queueCounts = useMemo(() => {
    const base = sessions.filter(s => s.user_id && s.profile)
    return Object.fromEntries(
      QUEUE_VIEWS.map(v => [
        v.key,
        applyQueueView(base as unknown as CrmFilterSession[], v.key, mySellerId).length,
      ]),
    )
  }, [sessions, mySellerId])

  const grouped = Object.fromEntries(
    funnelStages.map(s => [s.key, filteredSessions.filter(sess => sess.status === s.key)])
  )

  // Derive selected session from live query data so mutations reflect immediately
  const selectedSession = selectedSessionId
    ? (sessions.find(s => s.id === selectedSessionId) ?? null)
    : null

  const totalSessions = filteredSessions.length
  const conversionRate = totalSessions > 0
    ? ((grouped['comprou']?.length || 0) / totalSessions * 100).toFixed(1)
    : '0'

  // Stage color config matching Pedidos' ring/bg/text pattern
  const stageColorConfig: Record<string, { ring: string; bg: string; text: string }> = {
    visitou:              { ring: 'ring-zinc-600/15',    bg: 'bg-zinc-50',    text: 'text-zinc-600' },
    visualizou_produto:   { ring: 'ring-blue-600/20',    bg: 'bg-blue-50',    text: 'text-blue-700' },
    adicionou_carrinho:   { ring: 'ring-amber-600/20',   bg: 'bg-amber-50',   text: 'text-amber-700' },
    iniciou_checkout:     { ring: 'ring-purple-600/20',  bg: 'bg-purple-50',  text: 'text-purple-700' },
    comprou:              { ring: 'ring-emerald-600/20', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    abandonou:            { ring: 'ring-red-600/20',     bg: 'bg-red-50',     text: 'text-red-700' },
  }

  return (
    <AdminLayout>
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-border sticky top-0 z-30 shadow-sm flex flex-col w-full text-left">
        <AdminHeader
          title="Clientes"
          subtitle={
            viewMode === 'queue'
              ? `Fila comercial · ${queueSessions.length} cliente${queueSessions.length !== 1 ? 's' : ''}`
              : `${selectedSegmentFilter ? `${segmentLabel(selectedSegmentFilter)} · ` : ''}Funil de vendas em tempo real.${totalSessions > 0 ? ` ${conversionRate}% de conversão.` : ''}`
          }
          badge={
            !isLoading && totalSessions > 0 ? (
              <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold border border-zinc-200 shadow-sm">
                {totalSessions} clientes
              </span>
            ) : undefined
          }
          actionNode={
            <div className="flex flex-wrap items-center gap-2">
              {/* Mode toggle */}
              <div className="flex items-center gap-0.5 bg-zinc-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('funnel')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'funnel'
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  Funil
                </button>
                <button
                  onClick={() => setViewMode('queue')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'queue'
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  Fila
                </button>
              </div>

              {/* Funnel filters */}
              {viewMode === 'funnel' && (
                <>
                  <AdminSelect
                    options={[
                      { value: 'wholesale_buyer', label: 'Comprador Atacado' },
                      { value: 'network_partner', label: 'Parceiro da Rede' },
                    ]}
                    value={selectedSegmentFilter}
                    onChange={setSelectedSegmentFilter}
                    placeholder="Tipo"
                    icon={Users}
                    allLabel="Todos os tipos"
                  />
                  {availableTags.length > 0 && (
                    <AdminSelect
                      options={availableTags.map(t => ({ value: t.id, label: t.name }))}
                      value={selectedTagFilter}
                      onChange={setSelectedTagFilter}
                      placeholder="Filtrar tag"
                      icon={Tag}
                      allLabel="Todas as tags"
                    />
                  )}
                  <AdminSelect
                    options={OPERATIONAL_FILTERS.map(f => ({ value: f.key, label: f.label }))}
                    value={selectedOperationalFilter}
                    onChange={setSelectedOperationalFilter}
                    placeholder="Situação"
                    icon={AlertTriangle}
                    allLabel="Todas as situações"
                  />
                </>
              )}

              {/* Queue: "Identificar como" seller selector */}
              {viewMode === 'queue' && sellers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap">Sou:</span>
                  <select
                    value={mySellerId}
                    onChange={e => persistMySellerId(e.target.value)}
                    className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 text-zinc-700 font-medium"
                  >
                    <option value="">Não definido</option>
                    {sellers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          }
        />

        {/* ── QUEUE VIEWS (quick tabs) ── */}
        {viewMode === 'queue' && !isLoading && (
          <div className="w-full border-t border-zinc-100 bg-zinc-50/50 px-4 sm:px-6 lg:px-8 overflow-x-auto flex flex-nowrap gap-1.5 items-center py-2" style={{ scrollbarWidth: 'thin' }}>
            {QUEUE_VIEWS.map(view => {
              const count = queueCounts[view.key] ?? 0
              const isActive = activeQueueView === view.key
              const isMyAccounts = view.key === 'my_accounts'
              const noSeller = isMyAccounts && !mySellerId

              return (
                <button
                  key={view.key}
                  onClick={() => setActiveQueueView(view.key)}
                  disabled={noSeller}
                  title={noSeller ? 'Defina "Sou:" no header para usar esta view' : undefined}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : noSeller
                      ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {view.label}
                  {count > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── SUMMARY CARDS ── */}
        {!isLoading && sessions.length > 0 && viewMode === 'funnel' && (
          <div className="w-full border-t border-zinc-100 bg-zinc-50/50 py-3 px-4 sm:px-6 lg:px-8 overflow-x-auto flex flex-nowrap gap-3 items-center" style={{ scrollbarWidth: 'thin' }}>
            <AdminSummaryCard
              icon={Users}
              iconColor="text-zinc-500"
              label="Total clientes"
              value={String(totalSessions)}
              subtitle={
                <span className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-50 text-zinc-600 border border-zinc-100">
                  {funnelStages.length} etapas
                </span>
              }
              className="min-w-[120px] sm:min-w-[120px] sm:min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ring-zinc-600/10"
            />
            <AdminSummaryCard
              label="Compraram"
              indicatorColor="bg-emerald-400"
              value={String(grouped['comprou']?.length || 0)}
              subtitle={
                <span className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-md ${(grouped['comprou']?.length || 0) > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-zinc-100 text-zinc-400'}`}>
                  {totalSessions > 0 ? `${((grouped['comprou']?.length || 0) / totalSessions * 100).toFixed(0)}% do total` : '—'}
                </span>
              }
              className={`min-w-[120px] sm:min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ${(grouped['comprou']?.length || 0) > 0 ? 'ring-emerald-600/20' : 'ring-transparent opacity-80'}`}
            />
            <AdminSummaryCard
              label="Abandonaram"
              indicatorColor="bg-red-400"
              value={String(grouped['abandonou']?.length || 0)}
              subtitle={
                <span className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-md ${(grouped['abandonou']?.length || 0) > 0 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-zinc-100 text-zinc-400'}`}>
                  {totalSessions > 0 ? `${((grouped['abandonou']?.length || 0) / totalSessions * 100).toFixed(0)}% do total` : '—'}
                </span>
              }
              className={`min-w-[120px] sm:min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ${(grouped['abandonou']?.length || 0) > 0 ? 'ring-red-600/20' : 'ring-transparent opacity-80'}`}
            />
            <AdminSummaryCard
              icon={TrendingUp}
              iconColor="text-gold-text"
              label="Conversão"
              value={`${conversionRate}%`}
              subtitle={
                <span className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-50 text-zinc-600 border border-zinc-100">
                  visitou → comprou
                </span>
              }
              className="min-w-[120px] sm:min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ring-gold/20"
            />
          </div>
        )}
      </div>

      {/* ── FUNNEL BOARD ── */}
      {viewMode === 'funnel' && (
        <div className="w-full flex-1 min-w-0 relative border-t border-zinc-100 shadow-inner bg-zinc-50/40 min-h-[calc(100vh-210px)]">
          <style dangerouslySetInnerHTML={{__html: `
            .funnel-scroll::-webkit-scrollbar { height: 16px; }
            .funnel-scroll::-webkit-scrollbar-track { background: transparent; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
            .funnel-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; border: 3px solid #f8fafc; }
            .funnel-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
          `}} />
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden funnel-scroll px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-4 sm:pb-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 w-full">
                <Loader className="w-8 h-8 animate-spin text-zinc-400 mb-4" />
                <p className="text-sm font-medium text-zinc-500">Sincronizando clientes...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl border border-zinc-200 border-dashed max-w-4xl mx-auto shadow-sm w-full">
                <Users className="w-12 h-12 text-zinc-300 mb-4" />
                <h3 className="text-lg font-bold text-zinc-700">Nenhum cliente ainda</h3>
                <p className="text-zinc-500 text-sm mt-1 mb-6 text-center max-w-xs">Os clientes aparecerão aqui quando visitantes acessarem o catálogo.</p>
              </div>
            ) : (
              <div className="flex gap-4 min-w-max h-full items-start">
                {funnelStages.map((stage) => {
                  const StageIcon = stage.icon
                  const items = grouped[stage.key] || []
                  const colors = stageColorConfig[stage.key]

                  return (
                    <div key={stage.key} className="flex flex-col w-[260px] sm:w-[300px] lg:w-[320px] bg-zinc-100/60 rounded-xl border border-zinc-200/80 shrink-0 self-stretch max-h-[75vh] flex-nowrap shadow-sm">
                      {/* Column Header */}
                      <div className="p-3 border-b border-zinc-200/60 sticky top-0 bg-white/60 backdrop-blur-md rounded-t-xl z-20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ring-2 ${stage.indicatorColor} ${colors.ring}`} />
                          <h3 className="font-bold text-[13px] text-zinc-800 tracking-tight">{stage.label}</h3>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 bg-white border border-zinc-200 shadow-sm px-2 py-0.5 rounded-full">
                          {items.length}
                        </span>
                      </div>

                      {/* Column Body */}
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 scrollbar-thin">
                        {items.length === 0 ? (
                          <div className="h-16 flex items-center justify-center rounded-xl border border-zinc-200 border-dashed bg-white/50">
                            <span className="text-[11px] font-semibold text-zinc-400">Nenhum cliente</span>
                          </div>
                        ) : (
                          items.slice(0, 30).map((session) => {
                            const clientName = getClientName(session)
                            const labels = getClientLabels(session)
                            const followUpVencido = !!(
                              session.profile?.next_action_at &&
                              new Date(session.profile.next_action_at).getTime() < Date.now()
                            )
                            const temProximaAcao = !!(session.profile?.next_action)

                            return (
                              <button
                                key={session.id}
                                onClick={() => setSelectedSessionId(session.id)}
                                className={`w-full text-left bg-white p-2.5 sm:p-3 md:p-3.5 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-md border transition-all duration-200 cursor-pointer group flex flex-col gap-2 sm:gap-2.5 relative ${followUpVencido ? 'border-red-200 hover:border-red-300' : 'border-zinc-200/80 hover:border-zinc-300'}`}
                              >
                                {/* Identity */}
                                <div className="flex items-start justify-between gap-3 w-full">
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <h4 className="text-[13px] md:text-[14px] font-bold text-zinc-800 group-hover:text-zinc-600 leading-snug line-clamp-2 transition-colors" title={clientName}>
                                      {clientName}
                                    </h4>
                                    <span className="text-[11px] font-medium text-zinc-400 leading-none">
                                      {new Date(session.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                    </span>
                                  </div>
                                  {followUpVencido && (
                                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 ring-1 ring-inset ring-red-200" title="Follow-up vencido">
                                      <Clock className="w-3 h-3" />
                                      Vencido
                                    </span>
                                  )}
                                  {!followUpVencido && temProximaAcao && (
                                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200" title={session.profile?.next_action ?? ''}>
                                      <Clock className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>

                                {/* Contact */}
                                <div className="flex items-center gap-2 mt-0.5">
                                  {session.profile?.phone ? (
                                    <span className="text-[11px] md:text-[12px] text-zinc-500 font-medium truncate">{session.profile.phone}</span>
                                  ) : session.user_id ? (
                                    <span className="text-[11px] text-zinc-400 italic">Ficha incompleta</span>
                                  ) : (
                                    <span className="text-[11px] text-zinc-400 italic">Visitante anônimo</span>
                                  )}
                                </div>

                                {/* Segment + Tags */}
                                {(session.profile?.customer_segment || (session.tags && session.tags.length > 0)) && (
                                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                    {session.profile?.customer_segment && (
                                      <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${segmentBadgeColor(session.profile.customer_segment).replace('border-', 'ring-')}`}>
                                        {segmentLabel(session.profile.customer_segment)}
                                      </span>
                                    )}
                                    {session.tags?.slice(0, 3).map(t => (
                                      <span key={t.id} className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-50 text-zinc-500 border border-zinc-200 max-w-full" title={t.name}>
                                        <span className="truncate">{t.name}</span>
                                      </span>
                                    ))}
                                    {session.tags.length > 3 && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-50 text-zinc-500 border border-zinc-200">+{session.tags.length - 3}</span>
                                    )}
                                  </div>
                                )}

                                {/* Cart + Labels footer */}
                                {(labels.length > 0 || session.cart_items_count > 0) && (
                                  <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 mt-auto">
                                    <div className="flex items-center flex-wrap gap-2 text-zinc-500 truncate">
                                      {labels.map(l => (
                                        <span key={l.text} className="inline-flex items-center gap-1 text-[10px] font-medium">
                                          <l.icon className="w-3 h-3 text-zinc-400" />
                                          <span className="truncate hidden sm:inline">{l.text}</span>
                                        </span>
                                      ))}
                                    </div>
                                    {session.cart_items_count > 0 && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-md text-[10px] font-bold">
                                        {session.cart_items_count} {session.cart_items_count === 1 ? 'item' : 'itens'}
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
      {viewMode === 'queue' && (
        <div className="w-full flex-1 min-h-[calc(100vh-210px)] bg-zinc-50/40 border-t border-zinc-100">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader className="w-8 h-8 animate-spin text-zinc-400 mb-4" />
              <p className="text-sm font-medium text-zinc-500">Carregando fila...</p>
            </div>
          ) : queueSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 max-w-md mx-auto text-center px-4">
              <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mb-4">
                <LayoutList className="w-6 h-6 text-zinc-400" />
              </div>
              <h3 className="text-base font-bold text-zinc-700 mb-1">Fila vazia</h3>
              <p className="text-sm text-zinc-400">
                {activeQueueView === 'my_accounts' && !mySellerId
                  ? 'Defina "Sou:" no header para ver suas contas.'
                  : 'Nenhum cliente nesta view no momento.'}
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-2.5">
              {/* Contagem + legenda de ordenação */}
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-zinc-400 font-medium">
                  {queueSessions.length} cliente{queueSessions.length !== 1 ? 's' : ''} · ordenado por prioridade
                </p>
                <div className="flex items-center gap-2">
                  {(['vencido', 'hoje', 'sem_acao'] as const).map(p => {
                    const conf = QUEUE_PRIORITY_CONFIG[p]
                    const count = queueSessions.filter(
                      s => getQueuePriority(s as unknown as CrmFilterSession) === p
                    ).length
                    if (count === 0) return null
                    return (
                      <span key={p} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${conf.badgeClasses}`}>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2">Excluir Cliente?</h3>
              {clientToDelete.orders && clientToDelete.orders.length > 0 ? (
                <>
                  <p className="text-sm text-amber-700 font-medium bg-amber-50 p-3 rounded-lg border border-amber-200 mb-6">
                    Bloqueado: Este cliente possui {clientToDelete.orders.length} pedido(s) vinculados. Você deve excluir os pedidos antes de excluir o cliente.
                  </p>
                  <button onClick={() => setClientToDelete(null)} className="w-full py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold transition-colors">Voltar</button>
                </>
              ) : (
                <>
                  <p className="text-sm text-zinc-500 mb-6 px-2">Esta ação apagará o cadastro inteiro deste cliente (sessão e CRM). Confirma a exclusão de <strong>{getClientName(clientToDelete)}</strong>?</p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setClientToDelete(null)}
                      disabled={deleteClientMutation.isPending}
                      className="flex-1 py-3 px-4 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-xl font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const targetId = clientToDelete.user_id || clientToDelete.id
                        deleteClientMutation.mutate(targetId)
                      }}
                      disabled={deleteClientMutation.isPending}
                      className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center"
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
