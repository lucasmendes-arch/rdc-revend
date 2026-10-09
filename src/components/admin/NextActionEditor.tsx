import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Clock, Edit2, Check, Loader, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'

interface NextActionEditorProps {
  userId: string
  nextAction: string | null
  nextActionAt: string | null
}

function getStatus(nextAction: string | null, nextActionAt: string | null) {
  if (!nextAction) return 'empty'
  if (!nextActionAt) return 'set'
  return new Date(nextActionAt).getTime() < Date.now() ? 'overdue' : 'upcoming'
}

export function NextActionEditor({ userId, nextAction, nextActionAt }: NextActionEditorProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [actionText, setActionText] = useState('')
  const [actionDate, setActionDate] = useState('')

  const status = getStatus(nextAction, nextActionAt)

  function startEdit() {
    setActionText(nextAction ?? '')
    if (nextActionAt) {
      const local = new Date(nextActionAt)
      const pad = (n: number) => String(n).padStart(2, '0')
      setActionDate(`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`)
    } else {
      setActionDate('')
    }
    setEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: async ({ text, date }: { text: string; date: string }) => {
      const { error } = await supabase.rpc('admin_set_profile_next_action', {
        p_user_id: userId,
        p_next_action: text || null,
        p_next_action_at: date ? new Date(date).toISOString() : null,
      })
      if (error) throw error
    },
    onMutate: async ({ text, date }) => {
      await queryClient.cancelQueries({ queryKey: ['client-sessions'] })
      const prev = queryClient.getQueryData(['client-sessions'])
      queryClient.setQueryData(['client-sessions'], (old: any) => {
        if (!old) return old
        return old.map((s: any) =>
          s.user_id === userId
            ? { ...s, profile: { ...s.profile, next_action: text || null, next_action_at: date ? new Date(date).toISOString() : null } }
            : s,
        )
      })
      return { prev }
    },
    onSuccess: () => {
      toast.success('Próxima ação atualizada')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any, _v, context) => {
      if (context?.prev) queryClient.setQueryData(['client-sessions'], context.prev)
      toast.error('Erro ao salvar: ' + (err?.message || 'erro desconhecido'))
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_profile_next_action', {
        p_user_id: userId,
        p_next_action: null,
        p_next_action_at: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Próxima ação removida')
      queryClient.invalidateQueries({ queryKey: ['client-sessions'] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'erro desconhecido')),
  })

  const isLoading = saveMutation.isPending || clearMutation.isPending

  const datePart = actionDate ? actionDate.slice(0, 10) : ''
  const timePart = actionDate ? actionDate.slice(11, 16) : ''
  const setDatePart = (d: string | null) => setActionDate(d ? `${d}T${timePart || '09:00'}` : '')
  const setTimePart = (t: string) => { if (datePart) setActionDate(`${datePart}T${t || '09:00'}`) }

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Próxima ação</h3>
        {!editing ? (
          <Button variant="secondary" size="xs" onClick={startEdit}>
            <Edit2 />
            {nextAction ? 'Editar' : 'Definir'}
          </Button>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2.5">
          <Input
            type="text"
            value={actionText}
            onChange={e => setActionText(e.target.value)}
            placeholder="Ex: Ligar para confirmar pedido, enviar proposta…"
            aria-label="Próxima ação"
            autoFocus
          />
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <DateField value={datePart || null} onChange={setDatePart} placeholder="Data (opcional)" />
            </div>
            <Input
              type="time"
              value={timePart}
              onChange={e => setTimePart(e.target.value)}
              disabled={!datePart}
              aria-label="Horário"
              className="w-28 shrink-0 tabular-nums"
            />
          </div>
          <div className="flex gap-2">
            {nextAction && (
              <Button
                variant="secondary"
                onClick={() => { clearMutation.mutate(); setEditing(false) }}
                disabled={isLoading}
                className="text-danger hover:text-danger hover:bg-danger-subtle"
              >
                Remover
              </Button>
            )}
            <Button
              onClick={() => saveMutation.mutate({ text: actionText, date: actionDate })}
              disabled={isLoading || !actionText.trim()}
              className="flex-1"
            >
              {saveMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
              Salvar
            </Button>
          </div>
        </div>
      ) : status === 'empty' ? (
        <div className="flex items-center gap-2.5 bg-surface rounded-md p-3 border border-border">
          <Clock className="w-4 h-4 text-ink-400 shrink-0" />
          <p className="text-[13px] text-muted-foreground">Nenhuma próxima ação definida</p>
        </div>
      ) : (
        <div className={`flex items-start gap-2.5 rounded-md p-3 border ${
          status === 'overdue'
            ? 'bg-danger-subtle border-danger-border'
            : 'bg-success-subtle border-success-border'
        }`}>
          {status === 'overdue' ? (
            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-4 h-4 text-success shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={`text-[13.5px] font-semibold leading-snug ${
              status === 'overdue' ? 'text-danger' : 'text-success'
            }`}>
              {nextAction}
            </p>
            {nextActionAt && (
              <p className={`text-[12px] mt-0.5 tabular-nums ${
                status === 'overdue' ? 'text-danger' : 'text-success'
              }`}>
                {status === 'overdue' ? 'Venceu em ' : 'Agendado para '}
                {new Date(nextActionAt).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
