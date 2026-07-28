import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader, MessageSquare, Image as ImageIcon, Mic, FileText, Video } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ConversationMessage {
  id: string
  direction: 'inbound' | 'outbound'
  body: string | null
  message_type: string
  sent_at: string
}

// Mensagem sem texto (áudio, imagem sem legenda, figurinha) chega com body
// nulo — em vez de uma bolha vazia, mostra o tipo. O RH precisa saber que
// existiu uma mensagem ali, senão a conversa parece ter um buraco.
const TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  image: { label: 'Imagem', icon: ImageIcon },
  audio: { label: 'Áudio', icon: Mic },
  ptt: { label: 'Áudio', icon: Mic },
  video: { label: 'Vídeo', icon: Video },
  document: { label: 'Documento', icon: FileText },
  sticker: { label: 'Figurinha', icon: ImageIcon },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === 'inbound'
  const typeInfo = message.body ? null : TYPE_LABELS[message.message_type]
  const TypeIcon = typeInfo?.icon

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          isInbound
            ? 'bg-card border border-border rounded-bl-sm'
            : 'bg-emerald-100 text-emerald-950 rounded-br-sm dark:bg-emerald-500/20 dark:text-emerald-50'
        }`}
      >
        {message.body ? (
          // whitespace-pre-line: os modelos têm quebra de linha e é assim que
          // a mensagem chegou no celular do candidato.
          <p className="text-[13px] whitespace-pre-line break-words">{message.body}</p>
        ) : (
          <p className="text-[13px] italic text-muted-foreground flex items-center gap-1.5">
            {TypeIcon && <TypeIcon className="w-3.5 h-3.5 shrink-0" />}
            {typeInfo?.label ?? message.message_type}
          </p>
        )}
        <p className={`text-[10px] mt-0.5 ${isInbound ? 'text-muted-foreground' : 'text-emerald-800/70 dark:text-emerald-100/60'}`}>
          {formatTime(message.sent_at)}
        </p>
      </div>
    </div>
  )
}

// Conversa de WhatsApp do candidato (Fase 1 da triagem de entrevistas).
// Somente leitura: as mensagens são capturadas pelo webhook-uazapi. Não há
// campo de resposta aqui de propósito — responder pelo sistema é uma decisão
// separada, ainda não tomada.
export default function ConversaWhatsapp({ candidateId }: { candidateId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: messages = [], isLoading } = useQuery<ConversationMessage[]>({
    queryKey: ['rh-candidate-conversation', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_candidate_conversation', {
        p_candidate_id: candidateId,
      })
      if (error) throw error
      return (data || []) as ConversationMessage[]
    },
    // A conversa muda por fora (webhook), então revalida ao voltar pra aba.
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Conversa no WhatsApp
        {messages.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-alt text-muted-foreground">
            {messages.length}
          </span>
        )}
      </label>

      {isLoading ? (
        <div className="bg-surface-alt rounded-lg p-4 text-center">
          <Loader className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-surface-alt rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            Nenhuma mensagem registrada. Só aparecem aqui as mensagens trocadas depois que o webhook da Uazapi foi configurado.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="bg-surface-alt rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        </div>
      )}
    </div>
  )
}
