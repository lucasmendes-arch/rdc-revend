import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, Eye, ShoppingCart, CreditCard } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

interface ClientSession {
  id: string
  session_id: string
  user_id: string | null
  email: string | null
  status: 'visitou' | 'escolhendo' | 'comprou'
  last_page: string | null
  cart_items_count: number
  created_at: string
  updated_at: string
}

const statusConfig = {
  visitou: { label: 'Visitou', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Eye, headerColor: 'bg-blue-50 border-blue-200' },
  escolhendo: { label: 'Escolhendo', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: ShoppingCart, headerColor: 'bg-yellow-50 border-yellow-200' },
  comprou: { label: 'Comprou', color: 'bg-green-100 text-green-700 border-green-200', icon: CreditCard, headerColor: 'bg-green-50 border-green-200' },
}

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

  const grouped = {
    visitou: sessions.filter((s) => s.status === 'visitou'),
    escolhendo: sessions.filter((s) => s.status === 'escolhendo'),
    comprou: sessions.filter((s) => s.status === 'comprou'),
  }

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Clientes — Kanban</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe a jornada dos seus clientes em tempo real</p>
        </div>
      </div>

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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map((status) => {
              const config = statusConfig[status]
              const Icon = config.icon
              const items = grouped[status]

              return (
                <div key={status} className="flex flex-col">
                  {/* Column Header */}
                  <div className={`rounded-t-xl border px-4 py-3 flex items-center justify-between ${config.headerColor}`}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-bold">{config.label}</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80">
                      {items.length}
                    </span>
                  </div>

                  {/* Column Cards */}
                  <div className="bg-white rounded-b-xl border border-t-0 border-border min-h-[200px] p-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum cliente</p>
                    ) : (
                      items.slice(0, 20).map((session) => (
                        <div
                          key={session.id}
                          className="bg-surface-alt rounded-lg p-3 border border-border text-sm"
                        >
                          <p className="font-medium text-foreground truncate">
                            {session.email || `Visitante ${session.session_id.slice(0, 8)}`}
                          </p>
                          {session.last_page && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {session.last_page}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            {session.cart_items_count > 0 && (
                              <span className="text-xs text-gold-text font-medium">
                                {session.cart_items_count} itens no carrinho
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
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
