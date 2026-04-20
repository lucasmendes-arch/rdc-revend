import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { StickyNote, Plus, Edit2, Trash2, Check, X, Loader } from 'lucide-react'

interface CustomerNote {
  id: string
  customer_id: string
  content: string
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

interface CustomerNotesProps {
  userId: string
}

export function CustomerNotes({ userId }: CustomerNotesProps) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['customer-notes', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_customer_notes', {
        p_customer_id: userId,
      })
      if (error) throw error
      return (data ?? []) as CustomerNote[]
    },
    staleTime: 30 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.rpc('admin_create_customer_note', {
        p_customer_id: userId,
        p_content: content,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Nota adicionada')
      setNewContent('')
      setAdding(false)
      queryClient.invalidateQueries({ queryKey: ['customer-notes', userId] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'erro desconhecido')),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase.rpc('admin_update_customer_note', {
        p_note_id: id,
        p_content: content,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Nota atualizada')
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ['customer-notes', userId] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'erro desconhecido')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_delete_customer_note', {
        p_note_id: id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Nota excluída')
      queryClient.invalidateQueries({ queryKey: ['customer-notes', userId] })
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'erro desconhecido')),
  })

  function startEdit(note: CustomerNote) {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none'

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Notas Internas {notes.length > 0 && <span className="normal-case font-semibold opacity-60">({notes.length})</span>}
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent border border-border transition-colors"
          >
            <Plus className="w-3 h-3" />
            Adicionar
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 space-y-2">
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Escreva uma observação interna..."
            rows={3}
            className={inputCls}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(newContent)}
              disabled={createMutation.isPending || !newContent.trim()}
              className="btn-action flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg"
            >
              {createMutation.isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Salvar
            </button>
            <button
              onClick={() => { setAdding(false); setNewContent('') }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded-lg border border-border transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader className="w-4 h-4 animate-spin text-muted-foreground/40" />
          <span className="text-xs text-muted-foreground">Carregando notas...</span>
        </div>
      ) : notes.length === 0 && !adding ? (
        <div className="flex items-center gap-2.5 bg-muted/50 rounded-lg p-3 ring-1 ring-inset ring-border">
          <StickyNote className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
          <p className="text-xs text-muted-foreground italic">Nenhuma nota registrada</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notes.map(note => (
            <div key={note.id} className="bg-muted/50 rounded-xl border border-border/80 p-3">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    className={inputCls}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMutation.mutate({ id: note.id, content: editContent })}
                      disabled={updateMutation.isPending || !editContent.trim()}
                      className="btn-action flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg"
                    >
                      {updateMutation.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent rounded-lg border border-border transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-muted-foreground">
                      {note.created_by_name || 'Admin'} · {new Date(note.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                      {note.updated_at !== note.created_at && ' (editada)'}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(note)}
                        className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar nota"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(note.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Excluir nota"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
