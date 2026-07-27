import { MessageSquare, Phone, Send, Loader } from 'lucide-react'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { stageLabel } from '@/lib/rhStages'

// Uma linha por ação send_whatsapp que vai disparar — devolvida pela RPC
// preview_candidate_stage_automations, que renderiza o modelo com exatamente
// o mesmo contexto que o disparo real vai usar.
export interface AutomationPreview {
  automation_id: string
  automation_name: string
  template_name: string | null
  phone_number: string
  message: string
  instance_name: string | null
}

function formatPhone(raw: string) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw
}

export default function ConfirmarAutomacaoModal({
  candidateName, newStage, previews, sending, onConfirm, onCancel,
}: {
  candidateName: string
  newStage: string
  previews: AutomationPreview[]
  sending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEscapeToClose(onCancel, !sending)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => !sending && onCancel()} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-foreground mb-1">Confirmar envio</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Mover <strong className="text-foreground">{candidateName}</strong> para{' '}
          <strong className="text-foreground">{stageLabel(newStage)}</strong> vai enviar
          {previews.length > 1 ? ` ${previews.length} mensagens` : ' esta mensagem'} no WhatsApp.
        </p>

        <div className="space-y-3">
          {previews.map((p, i) => (
            <div key={`${p.automation_id}-${i}`} className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-alt/60 border-b border-border flex-wrap">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">{p.automation_name}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-auto shrink-0">
                  <Phone className="w-3 h-3" /> {formatPhone(p.phone_number)}
                </span>
              </div>
              {/* whitespace-pre-line preserva as quebras de linha do modelo —
                  é assim que a mensagem chega no WhatsApp. */}
              <p className="px-3 py-2.5 text-sm text-foreground whitespace-pre-line break-words">{p.message}</p>
              {p.instance_name && (
                <p className="px-3 pb-2 text-[11px] text-muted-foreground">Enviando por: {p.instance_name}</p>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mt-4">
          Os asteriscos viram negrito no WhatsApp. Pra mudar data/horário, cancele e use "Variáveis da mensagem".
        </p>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onConfirm}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70"
          >
            {sending ? <><Loader className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Confirmar e enviar</>}
          </button>
          <button
            onClick={onCancel}
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent disabled:opacity-70"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
