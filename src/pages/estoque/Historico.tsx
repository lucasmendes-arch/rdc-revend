import { useState, useMemo, Fragment } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ClipboardList, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, Panel, EmptyState, PageLoading, Toolbar } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface StockCountRow {
  id: string
  store_id: string
  employee_id: string | null
  employee_name: string | null
  status: 'draft' | 'confirmed'
  created_at: string
  confirmed_at: string | null
  last_activity_at: string
}

interface StoreOption {
  id: string
  name: string
}

interface ProfileOption {
  id: string
  full_name: string | null
}

interface CountItemDetail {
  id: string
  closed_boxes: number
  loose_units: number
  total_units: number | null
  catalog_products: { name: string } | null
}

function ItemsExpansion({ stockCountId }: { stockCountId: string }) {
  const { data: items = [], isLoading } = useQuery<CountItemDetail[]>({
    queryKey: ['stock-count-items-history', stockCountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_count_items')
        .select('id, closed_boxes, loose_units, total_units, catalog_products(name)')
        .eq('stock_count_id', stockCountId)
      if (error) throw error
      return (data || []) as unknown as CountItemDetail[]
    },
  })

  if (isLoading) {
    return <tr><td colSpan={8}><PageLoading className="py-3" /></td></tr>
  }

  const withValue = items.filter((i) => i.closed_boxes > 0 || i.loose_units > 0)

  return (
    <tr className="hover:!bg-transparent">
      <td colSpan={8} className="!p-0 bg-surface">
        {withValue.length === 0 ? (
          <p className="px-4 py-3 text-[12.5px] text-muted-foreground">Nenhum item preenchido nesta contagem.</p>
        ) : (
          <div className="px-3 sm:px-10 py-2">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="!text-right">Caixas</th>
                  <th className="!text-right">Soltas</th>
                  <th className="!text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {withValue.map((item) => (
                  <tr key={item.id}>
                    <td className="font-medium text-foreground">{item.catalog_products?.name || 'Produto'}</td>
                    <td className="text-right">{item.closed_boxes}</td>
                    <td className="text-right">{item.loose_units}</td>
                    <td className="text-right font-semibold">{item.total_units ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  )
}

export default function EstoqueHistorico() {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const [storeFilter, setStoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Excluir contagem: itens caem junto (FK CASCADE); pedidos de reposição já
  // gerados continuam existindo, só perdem o link de origem (FK SET NULL).
  // Só admin tem policy de DELETE em stock_counts — e esta tela é admin-only.
  const deleteCount = useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase.from('stock_counts').delete().eq('id', countId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts-history'] })
      queryClient.invalidateQueries({ queryKey: ['stock-counts-list'] })
      toast.success('Contagem excluída')
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleDelete = (count: StockCountRow) => {
    const label = count.status === 'confirmed'
      ? 'Excluir esta contagem CONFIRMADA? Os itens contados serão apagados do histórico (pedidos de reposição já gerados são mantidos). Esta ação não pode ser desfeita.'
      : 'Excluir este rascunho de contagem? Os itens preenchidos serão apagados. Esta ação não pode ser desfeita.'
    if (!confirm(label)) return
    deleteCount.mutate(count.id)
  }

  // Reabrir: status volta pra draft e a contagem fica editável de novo. O
  // pedido de reposição consolidado gerado por essa confirmação (se ainda
  // 'open') é apagado — a RPC bloqueia se já estiver picking/shipped.
  const reopenCount = useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase.rpc('admin_reopen_stock_count', { p_stock_count_id: countId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts-history'] })
      queryClient.invalidateQueries({ queryKey: ['stock-counts-list'] })
      toast.success('Contagem reaberta')
    },
    onError: (err) => toast.error(`Erro ao reabrir: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const handleReopen = (count: StockCountRow) => {
    if (!confirm('Reabrir esta contagem confirmada? Ela volta a ficar editável e o pedido de reposição gerado por ela (se ainda não separado) será apagado.')) return
    reopenCount.mutate(count.id)
  }

  const { data: counts = [], isLoading: countsLoading } = useQuery<StockCountRow[]>({
    queryKey: ['stock-counts-history'],
    queryFn: async () => {
      // View stock_counts_history = stock_counts + last_activity_at (maior
      // updated_at entre os itens da contagem).
      const { data, error } = await supabase
        .from('stock_counts_history')
        .select('id, store_id, employee_id, employee_name, status, created_at, confirmed_at, last_activity_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data || []) as StockCountRow[]
    },
  })

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores-history'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as StoreOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const employeeIds = useMemo(() => Array.from(new Set(counts.map((c) => c.employee_id).filter(Boolean))) as string[], [counts])

  const { data: profiles = [] } = useQuery<ProfileOption[]>({
    queryKey: ['profiles-history', employeeIds],
    queryFn: async () => {
      if (employeeIds.length === 0) return []
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', employeeIds)
      if (error) throw error
      return (data || []) as ProfileOption[]
    },
    enabled: employeeIds.length > 0,
  })

  const storeNameById = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores])
  const employeeNameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles])

  if (role !== 'admin' && role !== 'administrativo') {
    return <Navigate to="/estoque/contagem" replace />
  }

  const filtered = counts.filter((c) => {
    if (storeFilter && c.store_id !== storeFilter) return false
    if (statusFilter && c.status !== statusFilter) return false
    return true
  })

  return (
    <EstoqueLayout>
      <AdminPage
        title="Histórico de contagens"
        description="Últimas 200 contagens de todas as lojas"
        toolbar={
          <Toolbar>
            <StyledSelect
              variant="inline"
              value={storeFilter}
              onChange={setStoreFilter}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              emptyLabel="Todas as lojas"
              placeholder="Todas as lojas"
              className="h-9"
            />
            <StyledSelect
              variant="inline"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: 'draft', label: 'Rascunho' }, { value: 'confirmed', label: 'Confirmada' }]}
              emptyLabel="Todos os status"
              placeholder="Todos os status"
              className="h-9"
            />
          </Toolbar>
        }
      >
        <Panel flush>
          {countsLoading ? (
            <PageLoading />
          ) : filtered.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nenhuma contagem encontrada" description="Ajuste os filtros de loja e status." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8" aria-label="Expandir"></th>
                    <th>Loja</th>
                    <th>Parceiro</th>
                    <th className="!text-center">Status</th>
                    <th>Criada em</th>
                    <th>Confirmada em</th>
                    <th>Última atualização</th>
                    <th className="w-20" aria-label="Ações"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((count) => (
                    <Fragment key={count.id}>
                      <tr
                        onClick={() => setExpandedId(expandedId === count.id ? null : count.id)}
                        className="cursor-pointer"
                      >
                        <td className="!px-2 text-center text-ink-400">
                          {expandedId === count.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="font-medium text-foreground whitespace-nowrap">{storeNameById.get(count.store_id) || '—'}</td>
                        <td className="text-muted-foreground">
                          {count.employee_name || (count.employee_id ? employeeNameById.get(count.employee_id) : null) || '—'}
                        </td>
                        <td className="text-center">
                          <Badge variant={count.status === 'confirmed' ? 'success' : 'neutral'}>
                            {count.status === 'confirmed' ? 'Confirmada' : 'Rascunho'}
                          </Badge>
                        </td>
                        <td className="text-muted-foreground whitespace-nowrap">{new Date(count.created_at).toLocaleString('pt-BR')}</td>
                        <td className="text-muted-foreground whitespace-nowrap">{count.confirmed_at ? new Date(count.confirmed_at).toLocaleString('pt-BR') : '—'}</td>
                        <td className="text-muted-foreground whitespace-nowrap">{new Date(count.last_activity_at).toLocaleString('pt-BR')}</td>
                        <td className="!px-2">
                          <div className="flex items-center justify-end gap-0.5">
                            {count.status === 'confirmed' && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => { e.stopPropagation(); handleReopen(count) }}
                                disabled={reopenCount.isPending}
                                title="Reabrir contagem"
                                aria-label="Reabrir contagem"
                              >
                                <RotateCcw />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={(e) => { e.stopPropagation(); handleDelete(count) }}
                              disabled={deleteCount.isPending}
                              title="Excluir contagem"
                              aria-label="Excluir contagem"
                              className="hover:text-danger"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === count.id && <ItemsExpansion stockCountId={count.id} />}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </AdminPage>
    </EstoqueLayout>
  )
}
