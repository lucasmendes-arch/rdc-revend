import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Plus, ClipboardList, ChevronRight, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useMyStore } from '@/hooks/useMyStore'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'

interface StockCountRow {
  id: string
  status: 'draft' | 'confirmed'
  created_at: string
  confirmed_at: string | null
}

export default function EstoqueContagem() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { store, isLoading: storeLoading, needsStoreSelection } = useMyStore()
  const storeId = store?.id
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [employeeName, setEmployeeName] = useState('')

  const { data: counts = [], isLoading: countsLoading } = useQuery<StockCountRow[]>({
    queryKey: ['stock-counts-list', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id, status, created_at, confirmed_at')
        .eq('store_id', storeId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as StockCountRow[]
    },
    enabled: !!storeId,
  })

  const countIds = useMemo(() => counts.map((c) => c.id), [counts])

  const { data: itemCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['stock-counts-item-counts', countIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_count_items')
        .select('stock_count_id')
        .in('stock_count_id', countIds)
      if (error) throw error
      const map: Record<string, number> = {}
      for (const row of (data || []) as { stock_count_id: string }[]) {
        map[row.stock_count_id] = (map[row.stock_count_id] || 0) + 1
      }
      return map
    },
    enabled: countIds.length > 0,
  })

  const draft = counts.find((c) => c.status === 'draft')

  const createDraft = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('stock_counts')
        .insert({ store_id: storeId, employee_id: user?.id, employee_name: name })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts-list', storeId] })
      setShowNamePrompt(false)
      setEmployeeName('')
      navigate(`/estoque/contagem/${data.id}`)
    },
    onError: (err) => {
      toast.error(`Erro ao iniciar contagem: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
  })

  function handleNovaContagem() {
    if (draft) {
      navigate(`/estoque/contagem/${draft.id}`)
    } else {
      setShowNamePrompt(true)
    }
  }

  function handleConfirmName() {
    const trimmed = employeeName.trim()
    if (!trimmed) return
    createDraft.mutate(trimmed)
  }

  if (needsStoreSelection) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Selecione uma loja no menu acima para começar.</p>
        </div>
      </EstoqueLayout>
    )
  }

  if (storeLoading || countsLoading) {
    return (
      <EstoqueLayout>
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando…</p>
        </div>
      </EstoqueLayout>
    )
  }

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-1">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Contagem de estoque</h1>
            <p className="text-xs text-muted-foreground">{store?.name}</p>
          </div>
          <button
            onClick={handleNovaContagem}
            disabled={createDraft.isPending}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl btn-gold text-sm font-bold disabled:opacity-60 shrink-0"
          >
            {createDraft.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {draft ? 'Continuar contagem' : 'Nova contagem'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Histórico</h2>
        </div>
        {counts.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma contagem ainda. Toque em "Nova contagem" pra começar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {counts.map((count) => (
              <button
                key={count.id}
                onClick={() => navigate(count.status === 'confirmed' ? `/estoque/contagem/${count.id}/confirmar` : `/estoque/contagem/${count.id}`)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-alt transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    count.status === 'confirmed' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    {count.status === 'confirmed' ? <PackageCheck className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(count.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {itemCounts[count.id] || 0} produto{(itemCounts[count.id] || 0) !== 1 ? 's' : ''} · {count.status === 'confirmed' ? 'Confirmada' : 'Rascunho'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {showNamePrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !createDraft.isPending && setShowNamePrompt(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Nova contagem</p>
              <h2 className="text-base font-bold text-foreground">Quem está contando?</h2>
              <p className="text-xs text-muted-foreground mt-1">Esse nome fica registrado na contagem, no campo Parceiro.</p>
            </div>
            <input
              type="text"
              autoFocus
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmName() }}
              placeholder="Seu nome"
              className="w-full h-11 rounded-xl border border-input text-sm bg-white px-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNamePrompt(false)}
                disabled={createDraft.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmName}
                disabled={!employeeName.trim() || createDraft.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl btn-gold text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {createDraft.isPending && <Loader className="w-4 h-4 animate-spin" />}
                {createDraft.isPending ? 'Iniciando…' : 'Começar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </EstoqueLayout>
  )
}
