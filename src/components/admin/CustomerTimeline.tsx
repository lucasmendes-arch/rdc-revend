import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Clock, Loader, Sparkles, MessageCircle, Package, ShoppingCart } from 'lucide-react'

export function CustomerTimeline({ phone }: { phone: string }) {
  const { data: timelineEvents = [], isLoading } = useQuery({
    queryKey: ['customer-timeline', phone],
    queryFn: async () => {
      const cleanPhone = phone.replace(/\D/g, '')
      const { data, error } = await supabase.rpc('get_customer_timeline', { p_phone: cleanPhone })
      if (error) {
        console.error('Erro ao buscar timeline:', error)
        return []
      }
      return data || []
    },
    enabled: !!phone,
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

  if (timelineEvents.length === 0) {
    return (
      <div className="px-6 py-8 text-center border-t border-slate-100">
         <p className="text-xs text-muted-foreground">Nenhum histórico amplo encontrado para este telefone.</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 border-t border-slate-100 bg-white">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-6 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Timeline Global do Cliente
      </h3>
      
      <div className="relative border-l-2 border-slate-100 ml-3 space-y-6 pb-4">
        {timelineEvents.map((evt: any, idx: number) => {
          const isMsg = evt.tipo_evento === 'Mensagem Enviada'
          const isCart = evt.tipo_evento === 'Carrinho Abandonado'
          const isOrder = evt.tipo_evento === 'Pedido Efetuado'
          
          let Icon = Sparkles
          let color = 'bg-slate-100 text-slate-500'
          let iconColor = 'text-slate-500'
          
          if (isMsg) {
             Icon = MessageCircle
             color = 'bg-emerald-50 border-emerald-200'
             iconColor = 'text-emerald-500'
          } else if (isOrder) {
             Icon = Package
             color = 'bg-amber-50 border-amber-200'
             iconColor = 'text-amber-500'
          } else if (isCart) {
             Icon = ShoppingCart
             color = 'bg-red-50 border-red-200'
             iconColor = 'text-red-500'
          }

          return (
            <div key={idx} className="relative pl-6">
              {/* Timeline Dot */}
              <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${color}`}>
                 <Icon className={`w-2.5 h-2.5 ${iconColor}`} />
              </div>
              
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${iconColor}`}>
                    {evt.tipo_evento}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {new Date(evt.data_evento).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <p className="text-sm text-slate-700 font-medium leading-snug">
                  {evt.descricao}
                </p>
                
                {evt.metadata && Object.keys(evt.metadata).length > 0 && evt.metadata.total && (
                  <p className="text-[11px] font-bold text-slate-600 mt-1.5 bg-slate-50 self-start px-2 py-0.5 rounded border border-slate-100">
                    Total: R$ {Number(evt.metadata.total).toFixed(2)}
                  </p>
                )}
                {evt.metadata && evt.metadata.template && (
                  <p className="text-[10px] text-slate-500 mt-1 italic">
                    Template: {evt.metadata.template}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
