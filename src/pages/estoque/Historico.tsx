import { useState, useMemo, Fragment } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader, ChevronDown, ChevronRight, ClipboardList, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'

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
    return <tr><td colSpan={8} className="px-4 py-3 text-center"><Loader className="w-4 h-4 animate-spin text-muted-foreground mx-auto" /></td></tr>
  }

  const withValue = items.filter((i) => i.closed_boxes > 0 || i.loose_units > 0)

  return (
    <tr>
      <td colSpan={8} className="px-4 py-3 bg-surface-alt">
        {withValue.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum item preenchido nesta contagem.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1.5 font-semibold">Produto</th>
                <th className="pb-1.5 font-semibold text-center">Caixas</th>
                <th className="pb-1.5 font-semibold text-center">Soltas</th>
                <th className="pb-1.5 font-semibold text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {withValue.map((item) => (
                <tr key={item.id} className="border-t border-border/60">
                  <td className="py-1.5 font-medium text-foreground">{item.catalog_products?.name || 'Produto'}</td>
                  <td className="py-1.5 text-center">{item.closed_boxes}</td>
                  <td className="py-1.5 text-center">{item.loose_units}</td>
                  <td className="py-1.5 text-center font-bold">{item.total_units ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

  if (role !== 'admin') {
    return <Navigate to="/estoque/contagem" replace />
  }

  const filtered = counts.filter((c) => {
    if (storeFilter && c.store_id !== storeFilter) return false
    if (statusFilter && c.status !== statusFilter) return false
    return true
  })

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
        <h1 className="text-lg font-bold text-foreground">Histórico de contagens</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="h-9 rounded-lg border border-input text-sm bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">Todas as lojas</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-input text-sm bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="confirmed">Confirmada</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        {countsLoading ? (
          <div className="text-center py-10"><Loader className="w-6 h-6 animate-spin text-gold-text mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma contagem encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="w-8"></th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Loja</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Colaborador</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Criada em</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Confirmada em</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Última atualização</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((count) => (
                  <Fragment key={count.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === count.id ? null : count.id)}
                      className="border-b border-border last:border-b-0 hover:bg-surface-alt/80 cursor-pointer transition-colors"
                    >
                      <td className="px-2 text-center text-muted-foreground">
                        {expandedId === count.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">{storeNameById.get(count.store_id) || '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">
                        {count.employee_name || (count.employee_id ? employeeNameById.get(count.employee_id) : null) || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          count.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {count.status === 'confirmed' ? 'Confirmada' : 'Rascunho'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">{new Date(count.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">{count.confirmed_at ? new Date(count.confirmed_at).toLocaleString('pt-BR') : '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">{new Date(count.last_activity_at).toLocaleString('pt-BR')}</td>
                      <td className="px-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {count.status === 'confirmed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReopen(count) }}
                              disabled={reopenCount.isPending}
                              className="text-muted-foreground hover:text-amber-600 disabled:opacity-40 transition-colors"
                              title="Reabrir contagem"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(count) }}
                            disabled={deleteCount.isPending}
                            className="text-muted-foreground hover:text-red-600 disabled:opacity-40 transition-colors"
                            title="Excluir contagem"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
      </div>
    </EstoqueLayout>
  )
}
