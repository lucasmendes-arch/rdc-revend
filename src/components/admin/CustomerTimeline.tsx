import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Clock, Loader, Sparkles, MessageCircle, Package, ShoppingCart } from 'lucide-react'

interface TimelineEvent {
  type: string
  metadata: Record<string, unknown>
  created_at: string
}

interface TimelineData {
  profile?: Record<string, unknown>
  session?: Record<string, unknown>
  tags?: Array<{ slug: string; name: string; color: string; type: string }>
  events?: TimelineEvent[]
  orders?: Array<Record<string, unknown>>
  stats?: {
    total_orders: number
    total_spent: number
    first_order_at: string | null
    last_order_at: string | null
    total_events: number
  }
}

export function CustomerTimeline({ userId }: { userId: string }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['customer-timeline', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_timeline', { p_user_id: userId })
      if (error) {
        console.error('Erro ao buscar timeline:', error)
        return null
      }
      return data as TimelineData | null
    },
    enabled: !!userId,
    staleTime: 60 * 1000
  })

  if (isLoading) {
    return (
      <div className="px-6 py-8 text-center border-t border-slate-100 flex flex-col items-center justify-center">
         <Loader className="w-5 h-5 animate-spin text-slate-300 mb-2" />
         <p className="text-xs text-muted-foreground">Carregando histórico do cliente...</p>
      </div>
    )
  }

  const events = timeline?.events || []
  const stats = timeline?.stats

  if (events.length === 0 && !stats) {
    return (
      <div className="px-6 py-8 text-center border-t border-slate-100">
         <p className="text-xs text-muted-foreground">Nenhum histórico encontrado para este cliente.</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 border-t border-slate-100 bg-white">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Timeline do Cliente
      </h3>

      {/* Stats Summary */}
      {stats && stats.total_orders > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
            <p className="text-lg font-black text-amber-700">{stats.total_orders}</p>
            <p className="text-[10px] text-amber-600 font-semibold uppercase">Pedidos</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
            <p className="text-lg font-black text-emerald-700">R$ {Number(stats.total_spent).toFixed(2)}</p>
            <p className="text-[10px] text-emerald-600 font-semibold uppercase">Total Gasto</p>
          </div>
        </div>
      )}
      
      {/* Event Timeline */}
      {events.length > 0 && (
        <div className="relative border-l-2 border-slate-100 ml-3 space-y-5 pb-4">
          {events.slice(0, 30).map((evt, idx) => {
            const evtType = evt.type || ''
            const isMsg = evtType.includes('whatsapp') || evtType === 'send_whatsapp'
            const isOrder = evtType.includes('order') || evtType.includes('comprou') || evtType === 'purchase_completed'
            const isCart = evtType.includes('carrinho') || evtType.includes('cart')
            
            let Icon = Sparkles
            let color = 'bg-slate-100'
            let iconColor = 'text-slate-500'
            
            if (isMsg) {
               Icon = MessageCircle; color = 'bg-emerald-50 border border-emerald-200'; iconColor = 'text-emerald-500'
            } else if (isOrder) {
               Icon = Package; color = 'bg-amber-50 border border-amber-200'; iconColor = 'text-amber-500'
            } else if (isCart) {
               Icon = ShoppingCart; color = 'bg-red-50 border border-red-200'; iconColor = 'text-red-500'
            }

            return (
              <div key={idx} className="relative pl-6">
                <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${color}`}>
                   <Icon className={`w-2.5 h-2.5 ${iconColor}`} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${iconColor}`}>
                      {evtType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(evt.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[280px]">
                      {JSON.stringify(evt.metadata).substring(0, 100)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
