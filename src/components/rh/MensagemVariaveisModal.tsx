import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/admin/ui/AdminPage'
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
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-popover rounded-xl shadow-xl border border-border p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">Variáveis da mensagem</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Valem pra todas as mensagens enviadas a partir de agora. Ajuste antes de mover o lote de candidatos.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar" className="shrink-0 -mt-1 -mr-1">
            <X />
          </Button>
        </div>

        {isLoading ? (
          <PageLoading className="py-8" />
        ) : variables.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-6 text-center">
            Nenhuma variável cadastrada. Crie na aba "Variáveis" do construtor de automações.
          </p>
        ) : (
          <div className="space-y-4">
            {variables.map((v) => (
              <div key={v.id}>
                <label className="flex items-center gap-2 mb-1.5">
                  <span className="text-[13px] font-medium text-foreground">{v.label}</span>
                  <code className="text-[11px] font-mono px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">{`{var.${v.key}}`}</code>
                </label>
                <Input
                  type="text"
                  value={valueOf(v)}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  placeholder={v.help_text ?? ''}
                />
                {v.help_text && <p className="text-[12px] text-muted-foreground mt-1">{v.help_text}</p>}
              </div>
            ))}
          </div>
        )}

        {variables.length > 0 && (
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !isDirty}>
              {save.isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
