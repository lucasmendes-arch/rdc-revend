import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, Plus, ClipboardList, ChevronRight, PackageCheck, Store } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useMyStore } from '@/hooks/useMyStore'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

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
        <AdminPage title="Contagem de estoque">
          <Panel flush>
            <EmptyState icon={Store} title="Selecione uma loja" description="Escolha a loja no seletor acima para ver e lançar contagens." />
          </Panel>
        </AdminPage>
      </EstoqueLayout>
    )
  }

  if (storeLoading || countsLoading) {
    return (
      <EstoqueLayout>
        <AdminPage title="Contagem de estoque">
          <PageLoading />
        </AdminPage>
      </EstoqueLayout>
    )
  }

  return (
    <EstoqueLayout>
      <AdminPage
        title="Contagem de estoque"
        description={store?.name}
        actions={
          <Button size="lg" onClick={handleNovaContagem} disabled={createDraft.isPending} className="w-full sm:w-auto">
            {createDraft.isPending ? <Loader className="animate-spin" /> : <Plus />}
            {draft ? 'Continuar contagem' : 'Nova contagem'}
          </Button>
        }
      >
        <Panel title="Histórico" flush>
          {counts.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma contagem ainda"
              description='Toque em "Nova contagem" para começar.'
            />
          ) : (
            <div className="divide-y divide-border">
              {counts.map((count) => {
                const n = itemCounts[count.id] || 0
                const confirmed = count.status === 'confirmed'
                return (
                  <button
                    key={count.id}
                    type="button"
                    onClick={() => navigate(confirmed ? `/estoque/contagem/${count.id}/confirmar` : `/estoque/contagem/${count.id}`)}
                    className="w-full min-h-[60px] flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {confirmed
                        ? <PackageCheck className="w-4 h-4 shrink-0 text-success" />
                        : <ClipboardList className="w-4 h-4 shrink-0 text-ink-400" />}
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground">
                          {new Date(count.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[12px] text-muted-foreground truncate tabular-nums">
                          {n} produto{n !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={confirmed ? 'success' : 'neutral'}>{confirmed ? 'Confirmada' : 'Rascunho'}</Badge>
                      <ChevronRight className="w-4 h-4 text-ink-400" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Panel>
      </AdminPage>

      <Dialog open={showNamePrompt} onOpenChange={(open) => { if (!createDraft.isPending) setShowNamePrompt(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quem está contando?</DialogTitle>
            <DialogDescription>Esse nome fica registrado na contagem, no campo Parceiro.</DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            autoFocus
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmName() }}
            placeholder="Seu nome"
            className="h-11"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" size="lg" onClick={() => setShowNamePrompt(false)} disabled={createDraft.isPending}>
              Cancelar
            </Button>
            <Button size="lg" onClick={handleConfirmName} disabled={!employeeName.trim() || createDraft.isPending}>
              {createDraft.isPending && <Loader className="animate-spin" />}
              {createDraft.isPending ? 'Iniciando…' : 'Começar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EstoqueLayout>
  )
}
