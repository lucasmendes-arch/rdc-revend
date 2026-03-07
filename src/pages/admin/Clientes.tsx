import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, Eye, MousePointerClick, ShoppingCart, CreditCard, CheckCircle, XCircle } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

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
}

const funnelStages = [
  {
    key: 'visitou',
    label: 'Visitou o Site',
    subtitle: 'Fez login e acessou o catálogo',
    icon: Eye,
    headerColor: 'bg-slate-50 border-slate-200',
    badgeColor: 'bg-slate-100 text-slate-600',
  },
  {
    key: 'visualizou_produto',
    label: 'Visualizou Produtos',
    subtitle: 'Abriu a página de um ou mais produtos',
    icon: MousePointerClick,
    headerColor: 'bg-blue-50 border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-600',
  },
  {
    key: 'adicionou_carrinho',
    label: 'Adicionou no Carrinho',
    subtitle: 'Colocou pelo menos 1 item',
    icon: ShoppingCart,
    headerColor: 'bg-amber-50 border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'iniciou_checkout',
    label: 'Iniciou Checkout',
    subtitle: 'Clicou em fechar pedido',
    icon: CreditCard,
    headerColor: 'bg-purple-50 border-purple-200',
    badgeColor: 'bg-purple-100 text-purple-700',
  },
  {
    key: 'comprou',
    label: 'Comprou',
    subtitle: 'Pedido finalizado',
    icon: CheckCircle,
    headerColor: 'bg-green-50 border-green-200',
    badgeColor: 'bg-green-100 text-green-700',
  },
  {
    key: 'abandonou',
    label: 'Abandonou Carrinho',
    subtitle: 'Adicionou mas saiu sem comprar',
    icon: XCircle,
    headerColor: 'bg-red-50 border-red-200',
    badgeColor: 'bg-red-100 text-red-600',
  },
] as const

export default function AdminClientes() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['client-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_sessions')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data || []) as ClientSession[]
    },
    staleTime: 30 * 1000,
  })

  const grouped = Object.fromEntries(
    funnelStages.map(s => [s.key, sessions.filter(sess => sess.status === s.key)])
  )

  const totalSessions = sessions.length
  const conversionRate = totalSessions > 0
    ? ((grouped['comprou']?.length || 0) / totalSessions * 100).toFixed(1)
    : '0'

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Clientes — Funil de Vendas</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe a jornada dos seus clientes em tempo real</p>
        </div>
      </div>

      {/* Stats bar */}
      {!isLoading && sessions.length > 0 && (
        <div className="px-4 sm:px-6 py-4 bg-surface-alt border-b border-border">
          <div className="flex flex-wrap gap-4 sm:gap-8 text-sm">
            <div>
              <span className="text-muted-foreground">Total sessões:</span>{' '}
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

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando sessões...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Nenhuma sessão registrada ainda.</p>
            <p className="text-sm text-muted-foreground mt-2">As sessões aparecerão aqui quando visitantes acessarem o catálogo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
            {funnelStages.map((stage) => {
              const Icon = stage.icon
              const items = grouped[stage.key] || []

              return (
                <div key={stage.key} className="flex flex-col min-w-0">
                  {/* Column Header */}
                  <div className={`rounded-t-xl border px-4 py-3 ${stage.headerColor}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-bold truncate">{stage.label}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${stage.badgeColor}`}>
                        {items.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{stage.subtitle}</p>
                  </div>

                  {/* Column Cards */}
                  <div className="bg-white rounded-b-xl border border-t-0 border-border min-h-[180px] max-h-[400px] overflow-y-auto p-2 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum cliente</p>
                    ) : (
                      items.slice(0, 30).map((session) => (
                        <div
                          key={session.id}
                          className="bg-surface-alt rounded-lg p-3 border border-border text-sm"
                        >
                          <p className="font-medium text-foreground truncate text-xs">
                            {session.email || `Visitante ${session.session_id.slice(0, 8)}`}
                          </p>
                          {session.last_page && (
                            <p className="text-[10px] text-muted-foreground truncate mt-1">
                              {session.last_page}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            {session.cart_items_count > 0 && (
                              <span className="text-[10px] text-gold-text font-medium">
                                {session.cart_items_count} itens
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {new Date(session.updated_at).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
