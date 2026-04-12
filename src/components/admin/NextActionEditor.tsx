import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Clock, Edit2, X, Check, Loader, AlertCircle } from 'lucide-react'

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
    // Convert UTC ISO to local datetime-local value
    if (nextActionAt) {
      const local = new Date(nextActionAt)
      // Format as YYYY-MM-DDTHH:MM for datetime-local input
      const pad = (n: number) => String(n).padStart(2, '0')
      const localStr = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`
      setActionDate(localStr)
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
            ? {
                ...s,
                profile: {
                  ...s.profile,
                  next_action: text || null,
                  next_action_at: date ? new Date(date).toISOString() : null,
                },
              }
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

  return (
    <div className="px-5 py-4 border-b border-zinc-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Próxima Ação</h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-zinc-500 hover:bg-zinc-100 border border-zinc-200 transition-colors"
          >
            <Edit2 className="w-3 h-3" />
            {nextAction ? 'Editar' : 'Definir'}
          </button>
        )}
        {editing && (
          <button
            onClick={() => setEditing(false)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancelar
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2.5">
          <input
            type="text"
            value={actionText}
            onChange={e => setActionText(e.target.value)}
            placeholder="Ex: Ligar para confirmar pedido, Enviar proposta..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
            autoFocus
          />
          <input
            type="datetime-local"
            value={actionDate}
            onChange={e => setActionDate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => saveMutation.mutate({ text: actionText, date: actionDate })}
              disabled={isLoading || !actionText.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Salvar
            </button>
            {nextAction && (
              <button
                onClick={() => { clearMutation.mutate(); setEditing(false) }}
                disabled={isLoading}
                className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                Remover
              </button>
            )}
          </div>
        </div>
      ) : status === 'empty' ? (
        <div className="flex items-center gap-2.5 bg-zinc-50 rounded-lg p-3 ring-1 ring-inset ring-zinc-200">
          <Clock className="w-4 h-4 text-zinc-300 flex-shrink-0" />
          <p className="text-xs text-zinc-400 italic">Nenhuma próxima ação definida</p>
        </div>
      ) : (
        <div className={`flex items-start gap-2.5 rounded-lg p-3 ring-1 ring-inset ${
          status === 'overdue'
            ? 'bg-red-50 ring-red-200'
            : 'bg-emerald-50 ring-emerald-200'
        }`}>
          {status === 'overdue' ? (
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-snug ${status === 'overdue' ? 'text-red-800' : 'text-emerald-800'}`}>
              {nextAction}
            </p>
            {nextActionAt && (
              <p className={`text-[11px] mt-0.5 font-medium ${status === 'overdue' ? 'text-red-500' : 'text-emerald-600'}`}>
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
