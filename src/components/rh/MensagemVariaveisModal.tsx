import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Loader } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'

interface AutomationVariable {
  id: string
  key: string
  label: string
  value: string | null
  help_text: string | null
  sort_order: number
}

// Substitui o nó "Set" que existia no fluxo do n8n: os valores que mudam a
// cada rodada de entrevistas (data e horários) eram editados à mão antes de
// mover o lote de candidatos. Fica aqui, no kanban, porque é onde a pessoa
// está no momento de trocar — a definição das variáveis (criar/renomear) mora
// na aba "Variáveis" do construtor de automações.
//
// Um único "Salvar Alterações" no fim, não um botão por campo.
export default function MensagemVariaveisModal({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose)
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const { data: variables = [], isLoading } = useQuery<AutomationVariable[]>({
    queryKey: ['rh-automation-variables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_variables').select('*').order('sort_order')
      if (error) throw error
      return (data || []) as AutomationVariable[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const changed = variables.filter((v) => drafts[v.id] !== undefined && drafts[v.id] !== (v.value ?? ''))
      for (const v of changed) {
        const { error } = await supabase
          .from('automation_variables')
          .update({ value: drafts[v.id].trim() || null, updated_at: new Date().toISOString() })
          .eq('id', v.id)
        if (error) throw error
      }
      return changed.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['rh-automation-variables'] })
      toast.success(count === 0 ? 'Nada mudou' : 'Variáveis atualizadas')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const valueOf = (v: AutomationVariable) => drafts[v.id] ?? v.value ?? ''
  const isDirty = variables.some((v) => drafts[v.id] !== undefined && drafts[v.id] !== (v.value ?? ''))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Variáveis da mensagem</h2>
            <p className="text-xs text-muted-foreground">
              Valem pra todas as mensagens enviadas a partir de agora. Ajuste antes de mover o lote de candidatos.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8"><Loader className="w-5 h-5 animate-spin text-gold-text mx-auto" /></div>
        ) : variables.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma variável cadastrada. Crie na aba "Variáveis" do construtor de automações.
          </p>
        ) : (
          <div className="space-y-3">
            {variables.map((v) => (
              <div key={v.id}>
                <label className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{v.label}</span>
                  <code className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-surface-alt text-muted-foreground">{`{var.${v.key}}`}</code>
                </label>
                <input
                  type="text"
                  value={valueOf(v)}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  placeholder={v.help_text ?? ''}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {v.help_text && <p className="text-[11px] text-muted-foreground mt-1">{v.help_text}</p>}
              </div>
            ))}
          </div>
        )}

        {variables.length > 0 && (
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !isDirty}
              className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-50"
            >
              {save.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
