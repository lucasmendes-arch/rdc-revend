import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Loader, Eye, MousePointerClick, ShoppingCart, CreditCard,
  CheckCircle, XCircle, X, User, Phone, Mail, Tag,
  Building2, FileText, Package, Clock, Calendar, Users, DollarSign, Sparkles, AlertTriangle, Trash2, TrendingUp, UserX
} from 'lucide-react'
import { CustomerTimeline } from '@/components/admin/CustomerTimeline'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminHeader } from '@/components/admin/ui/AdminHeader'
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard'
import { AdminSelect } from '@/components/admin/ui/AdminSelect'

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
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5">Dados do Cadastro</h3>
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
                  <p>Perfil incompleto ou pendente de atualização.</p>
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

export default function AdminClientes() {
  const queryClient = useQueryClient()
  const [selectedSession, setSelectedSession] = useState<ClientSession | null>(null)
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('')
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState<string>('')
  const [clientToDelete, setClientToDelete] = useState<ClientSession | null>(null)

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.rpc('admin_delete_test_client', { p_client_id: clientId })
      if (error) throw error
      return clientId
    },
    onSuccess: () => {
      toast.success('Cliente de teste excluído permanentemente')
      setClientToDelete(null)
      setSelectedSession(null)
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any) => {
      console.error("DEBUG DELETE CLIENT ERROR:", err)
      toast.error(`Falha: ${err.message || 'Verifique se ele possui pedidos.'}`)
    }
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
    return result
  }, [sessions, selectedTagFilter, selectedSegmentFilter])

  const grouped = Object.fromEntries(
    funnelStages.map(s => [s.key, filteredSessions.filter(sess => sess.status === s.key)])
  )

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
          subtitle={`${selectedSegmentFilter ? `${segmentLabel(selectedSegmentFilter)} · ` : ''}Funil de vendas em tempo real.${totalSessions > 0 ? ` ${conversionRate}% de conversão.` : ''}`}
          badge={
            !isLoading && totalSessions > 0 ? (
              <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold border border-zinc-200 shadow-sm">
                {totalSessions} clientes
              </span>
            ) : undefined
          }
          actionNode={
            <div className="flex items-center gap-2">
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
            </div>
          }
        />

        {/* ── SUMMARY CARDS ── */}
        {!isLoading && sessions.length > 0 && (
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
              className="min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ring-zinc-600/10"
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
              className={`min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ${(grouped['comprou']?.length || 0) > 0 ? 'ring-emerald-600/20' : 'ring-transparent opacity-80'}`}
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
              className={`min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ${(grouped['abandonou']?.length || 0) > 0 ? 'ring-red-600/20' : 'ring-transparent opacity-80'}`}
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
              className="min-w-[150px] flex-1 shrink-0 ring-inset ring-1 ring-gold/20"
            />
          </div>
        )}
      </div>

      {/* ── FUNNEL BOARD ── */}
      <div className="w-full flex-1 min-w-0 relative border-t border-zinc-100 shadow-inner bg-zinc-50/40 min-h-[calc(100vh-210px)]">
        <style dangerouslySetInnerHTML={{__html: `
          .funnel-scroll::-webkit-scrollbar { height: 16px; }
          .funnel-scroll::-webkit-scrollbar-track { background: transparent; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
          .funnel-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; border: 3px solid #f8fafc; }
          .funnel-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        `}} />
        <div className="absolute inset-0 overflow-x-auto overflow-y-hidden funnel-scroll px-4 sm:px-6 lg:px-8 pt-5 pb-6">
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
                  <div key={stage.key} className="flex flex-col w-[320px] bg-zinc-100/60 rounded-xl border border-zinc-200/80 shrink-0 self-stretch max-h-[75vh] flex-nowrap shadow-sm">
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

                          return (
                            <button
                              key={session.id}
                              onClick={() => setSelectedSession(session)}
                              className="w-full text-left bg-white p-3 md:p-3.5 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-md border border-zinc-200/80 hover:border-zinc-300 transition-all duration-200 cursor-pointer group flex flex-col gap-2.5 relative"
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

      {selectedSession && (
        <ClientDetailPanel
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
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
