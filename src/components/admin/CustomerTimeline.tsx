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
    staleTime: 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="px-6 py-8 text-center border-t border-border flex flex-col items-center justify-center">
        <Loader className="w-5 h-5 animate-spin text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">Carregando histórico do cliente...</p>
      </div>
    )
  }

  const events = timeline?.events || []
  const stats = timeline?.stats

  if (events.length === 0 && !stats) {
    return (
      <div className="px-6 py-8 text-center border-t border-border">
        <p className="text-xs text-muted-foreground">Nenhum histórico encontrado para este cliente.</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 border-t border-border bg-card">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Timeline do Cliente
      </h3>

      {stats && stats.total_orders > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <p className="text-lg font-black text-amber-600 dark:text-amber-400">{stats.total_orders}</p>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-semibold uppercase">Pedidos</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">R$ {Number(stats.total_spent).toFixed(2)}</p>
            <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-semibold uppercase">Total Gasto</p>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="relative border-l-2 border-border ml-3 space-y-5 pb-4">
          {events.slice(0, 30).map((evt, idx) => {
            const evtType = evt.type || ''
            const isMsg = evtType.includes('whatsapp') || evtType === 'send_whatsapp'
            const isOrder = evtType.includes('order') || evtType.includes('comprou') || evtType === 'purchase_completed'
            const isCart = evtType.includes('carrinho') || evtType.includes('cart')

            let Icon = Sparkles
            let dotCls = 'bg-muted border-border'
            let iconCls = 'text-muted-foreground'

            if (isMsg) {
              Icon = MessageCircle
              dotCls = 'bg-emerald-500/10 border-emerald-500/30'
              iconCls = 'text-emerald-500'
            } else if (isOrder) {
              Icon = Package
              dotCls = 'bg-amber-500/10 border-amber-500/30'
              iconCls = 'text-amber-500'
            } else if (isCart) {
              Icon = ShoppingCart
              dotCls = 'bg-destructive/10 border-destructive/30'
              iconCls = 'text-destructive'
            }

            return (
              <div key={idx} className="relative pl-6">
                <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center shadow-sm ${dotCls}`}>
                  <Icon className={`w-2.5 h-2.5 ${iconCls}`} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${iconCls}`}>
                      {evtType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {new Date(evt.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[280px]">
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
