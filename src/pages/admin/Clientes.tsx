import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Loader, Eye, MousePointerClick, ShoppingCart, CreditCard,
  CheckCircle, XCircle, X, User, Phone, Mail,
  Building2, FileText, Package, Clock, Calendar, Users, DollarSign, Sparkles, AlertTriangle
} from 'lucide-react'
import { CustomerTimeline } from '@/components/admin/CustomerTimeline'
import AdminLayout from '@/components/admin/AdminLayout'

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
function ClientDetailPanel({ session, onClose }: { session: ClientSession; onClose: () => void }) {
  const profile = session.profile
  const orders = session.orders || []
  const stageInfo = funnelStages.find(s => s.key === session.status) || funnelStages[0]
  const StageIcon = stageInfo.icon
  const labels = getClientLabels(session)

  const clientName = getClientName(session)
  const initials = clientName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 transition-opacity" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="border-b border-border px-6 py-5 flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{clientName}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white shadow-sm ${stageInfo.indicatorColor}`}>
                <StageIcon className="w-3 h-3" />
                {stageInfo.label}
              </span>
              {labels.map(l => (
                <span key={l.text} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${l.color}`}>
                  <l.icon className="w-2.5 h-2.5" />
                  {l.text}
                </span>
              ))}
              {session.tags?.map(t => (
                <span key={t.id} className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTagColorClasses(t.slug)}`}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-muted-foreground flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Client Profile */}
          <div className="px-6 py-5 border-b border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Dados do Cadastro</h3>
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
                <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <p>O perfil deste usuário está incompleto ou pendente de atualização. As informações detalhadas podem demorar alguns minutos para refletir no sistema caso ele tenha acabado de se cadastrar.</p>
                </div>
              )}
              {!profile && session.user_id && (
                <div className="bg-slate-50 border border-slate-200 text-slate-600 p-3 rounded-xl text-xs flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin flex-shrink-0 text-slate-400" />
                  <p>Aguardando sincronização de perfil (perfil base criado, dependendo do salvamento de atributos adicionais).</p>
                </div>
              )}
              {!profile && !session.user_id && !session.email && (
                <p className="text-sm text-muted-foreground italic">Visitante anônimo — sem dados de perfil vinculados</p>
              )}
            </div>
          </div>

          {/* Cart info */}
          {session.cart_items_count > 0 && orders.length === 0 && (
            <div className="px-6 py-5 border-b border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Carrinho</h3>
              <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    {session.cart_items_count} {session.cart_items_count === 1 ? 'item' : 'itens'} no carrinho
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Detalhes dos itens não disponíveis (armazenados no navegador do cliente)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Orders */}
          {orders.length > 0 && (
            <div className="px-6 py-5 border-b border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
                Pedidos ({orders.length})
              </h3>
              <div className="space-y-4">
                {orders.map((order) => {
                  const statusInfo = orderStatusLabels[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={order.id} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200 bg-white">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-foreground">R$ {Number(order.total).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {order.order_items.map((item) => {
                          let imgUrl: string | null = null
                          if (Array.isArray(item.catalog_products)) {
                            imgUrl = (item.catalog_products as any)[0]?.main_image
                          } else {
                            imgUrl = item.catalog_products?.main_image || null
                          }
                          return (
                            <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-slate-100">
                              {imgUrl ? (
                                <img src={imgUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm" />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-5 h-5 text-slate-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{item.qty}× R$ {Number(item.unit_price_snapshot).toFixed(2)}</p>
                              </div>
                              <span className="text-sm font-bold text-foreground flex-shrink-0">R$ {Number(item.line_total).toFixed(2)}</span>
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
          <div className="px-6 py-5 bg-slate-50">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Atividade da Sessão</h3>
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
        </div>
      </div>
    </>
  )
}



// Reusable info row
function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-medium text-foreground truncate mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// --- Main Page ---
import { useMemo } from 'react'
import { Filter } from 'lucide-react'

export default function AdminClientes() {
  const [selectedSession, setSelectedSession] = useState<ClientSession | null>(null)
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('')

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
    if (!selectedTagFilter) return sessions
    return sessions.filter(s => s.tags?.some(t => t.id === selectedTagFilter))
  }, [sessions, selectedTagFilter])

  const grouped = Object.fromEntries(
    funnelStages.map(s => [s.key, filteredSessions.filter(sess => sess.status === s.key)])
  )

  const totalSessions = filteredSessions.length
  const conversionRate = totalSessions > 0
    ? ((grouped['comprou']?.length || 0) / totalSessions * 100).toFixed(1)
    : '0'

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Clientes — Funil de Vendas</h1>
            <p className="text-sm text-muted-foreground mt-1">Acompanhe a jornada dos seus clientes em tempo real</p>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={selectedTagFilter}
              onChange={(e) => setSelectedTagFilter(e.target.value)}
              className="w-full sm:w-64 text-sm bg-surface border border-input rounded-lg p-2 focus:ring-2 focus:ring-amber-400 focus:outline-none"
            >
              <option value="">Todas as Tags</option>
              {availableTags.map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name} ({tag.type})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!isLoading && sessions.length > 0 && (
        <div className="px-4 sm:px-6 py-4 bg-surface-alt border-b border-border">
          <div className="flex flex-wrap gap-4 sm:gap-8 text-sm">
            <div>
              <span className="text-muted-foreground">Total clientes:</span>{' '}
              <span className="font-bold text-foreground">{totalSessions}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Compraram:</span>{' '}
              <span className="font-bold text-green-600">{grouped['comprou']?.length || 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Abandonaram:</span>{' '}
              <span className="font-bold text-red-600">{grouped['abandonou']?.length || 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Taxa de conversão:</span>{' '}
              <span className="font-bold text-foreground">{conversionRate}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-[100vw] lg:max-w-[calc(100vw-240px)] overflow-hidden">
        <div className="py-8">
          {isLoading ? (
            <div className="text-center py-16 px-4">
              <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
              <p className="text-muted-foreground">Carregando clientes...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 px-4">
              <p className="text-muted-foreground">Nenhum cliente registrado ainda.</p>
              <p className="text-sm text-muted-foreground mt-2">Os clientes aparecerão aqui quando visitantes acessarem o catálogo.</p>
            </div>
          ) : (
            <div className="flex overflow-x-auto pb-6 pl-4 sm:pl-6 scroll-smooth custom-scrollbar">
              <div className="flex w-max min-w-full gap-4 xl:gap-6 items-stretch pr-4 sm:pr-6">
              {funnelStages.map((stage) => {
                const Icon = stage.icon
                const items = grouped[stage.key] || []

                return (
                  <div key={stage.key} className="flex flex-col flex-shrink-0 w-[280px] xl:w-[320px] bg-slate-50/60 rounded-xl border border-border shadow-sm overflow-hidden">
                    {/* Header Limpo Estilo CRM */}
                    <div className="px-5 py-4 bg-white/60 border-b border-border relative flex flex-col gap-1.5 backdrop-blur-sm">
                      {/* Accent color bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1 transition-colors ${stage.indicatorColor}`}></div>
                      
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2 text-slate-800">
                          <Icon className="w-4 h-4 text-slate-500" />
                          <h3 className="text-[14px] font-bold tracking-tight">{stage.label}</h3>
                        </div>
                        <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 shadow-sm px-2.5 py-0.5 rounded-full">
                          {items.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium truncate">{stage.subtitle}</p>
                    </div>

                    {/* Column Body / Dropzone */}
                    <div className="flex-1 p-3 overflow-y-auto min-h-[500px] max-h-[75vh] space-y-3 custom-scrollbar">
                      {items.length === 0 ? (
                        <div className="flex items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-lg bg-white/30">
                          <p className="text-xs text-slate-400 font-medium">Nenhum cliente neste estágio</p>
                        </div>
                      ) : (
                        items.slice(0, 30).map((session) => {
                          const clientName = getClientName(session)
                          const labels = getClientLabels(session)

                          return (
                            <button
                              key={session.id}
                              onClick={() => setSelectedSession(session)}
                              className="w-full text-left bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col gap-3 relative"
                            >
                              {/* Prioriade 1: Identidade (Nome e Data) */}
                              <div className="flex items-start justify-between gap-3 w-full">
                                <h4 className="text-[14px] font-bold text-slate-900 group-hover:text-slate-700 leading-snug line-clamp-2" title={clientName}>
                                  {clientName}
                                </h4>
                                <span className="text-[10px] text-slate-400 font-mono flex-shrink-0 pt-0.5" title="Última atualização">
                                  {new Date(session.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </span>
                              </div>

                              {/* Prioriade 2: Contato Comercial Claro (Sem Badges) */}
                              <div className="flex items-center gap-1.5 text-slate-500">
                                {session.profile?.phone ? (
                                  <>
                                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-xs font-semibold">{session.profile.phone}</span>
                                  </>
                                ) : session.user_id ? (
                                  <>
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-[11px] italic">Ficha incompleta</span>
                                  </>
                                ) : (
                                  <>
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-[11px] italic">Visitante anônimo</span>
                                  </>
                                )}
                              </div>

                              {/* Prioriade 3: Tags Discretas */}
                              {session.tags && session.tags.length > 0 && (
                                <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-slate-50 min-h-[34px]">
                                  {session.tags.slice(0, 3).map(t => (
                                    <span key={t.id} className="inline-flex items-center text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 max-w-full" title={t.name}>
                                      <span className="truncate">{t.name}</span>
                                    </span>
                                  ))}
                                  {session.tags.length > 3 && (
                                    <span className="text-[10px] sm:text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">+{session.tags.length - 3}</span>
                                  )}
                                </div>
                              )}

                              {/* Prioriade 4: Status do Carrinho e Rótulos (Footer Minimo) */}
                              {(labels.length > 0 || session.cart_items_count > 0) && (
                                <div className="flex items-center justify-between gap-2 mt-auto pt-2 max-w-full">
                                  <div className="flex items-center flex-wrap gap-2 text-slate-500 truncate">
                                    {labels.map(l => (
                                      <span key={l.text} className="inline-flex items-center gap-1 text-[10px] font-medium">
                                        <l.icon className="w-3 h-3 text-slate-400" />
                                        <span className="truncate hidden sm:inline">{l.text}</span>
                                      </span>
                                    ))}
                                  </div>
                                  
                                  {session.cart_items_count > 0 && (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 flex-shrink-0 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                                      <ShoppingCart className="w-3 h-3 text-slate-400" />
                                      {session.cart_items_count}
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
        )}
        </div>
      </div>

      {selectedSession && (
        <ClientDetailPanel
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </AdminLayout>
  )
}
