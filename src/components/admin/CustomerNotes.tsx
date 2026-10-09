import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { StickyNote, Plus, Edit2, Trash2, Check, Loader } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

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

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
          Notas internas {notes.length > 0 && <span className="font-normal text-muted-foreground tabular-nums">({notes.length})</span>}
        </h3>
        {!adding && (
          <Button variant="secondary" size="xs" onClick={() => setAdding(true)}>
            <Plus />
            Adicionar
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 space-y-2">
          <Textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Escreva uma observação interna…"
            rows={3}
            className="resize-none"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setNewContent('') }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(newContent)}
              disabled={createMutation.isPending || !newContent.trim()}
            >
              {createMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
              Salvar nota
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-[13px] text-muted-foreground">
          <Loader className="w-4 h-4 animate-spin text-ink-400" />
          Carregando notas…
        </div>
      ) : notes.length === 0 && !adding ? (
        <div className="flex items-center gap-2.5 bg-surface rounded-md p-3 border border-border">
          <StickyNote className="w-4 h-4 text-ink-400 shrink-0" />
          <p className="text-[13px] text-muted-foreground">Nenhuma nota registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div key={note.id} className="bg-surface rounded-md border border-border p-3">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    className="resize-none bg-card"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="xs" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => updateMutation.mutate({ id: note.id, content: editContent })}
                      disabled={updateMutation.isPending || !editContent.trim()}
                    >
                      {updateMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-foreground leading-snug whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-[12px] text-muted-foreground">
                      {note.created_by_name || 'Admin'} · {new Date(note.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                      {note.updated_at !== note.created_at && ' (editada)'}
                    </p>
                    <div className="flex gap-0.5 -mr-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => startEdit(note)}
                        title="Editar nota"
                        aria-label="Editar nota"
                      >
                        <Edit2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 hover:text-danger hover:bg-danger-subtle"
                        onClick={() => deleteMutation.mutate(note.id)}
                        disabled={deleteMutation.isPending}
                        title="Excluir nota"
                        aria-label="Excluir nota"
                      >
                        <Trash2 />
                      </Button>
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
