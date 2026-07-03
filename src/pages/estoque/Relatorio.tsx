import { useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader, BarChart3, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'

interface StoreOption {
  id: string
  name: string
}

interface StockRow {
  store_id: string
  store_name: string
  store_type: string
  product_id: string
  product_name: string
  stock_category: string | null
  total_units: number | null
  target_quantity: number | null
  confirmed_at: string
}

export default function EstoqueRelatorio() {
  const { role } = useAuth()
  const [selectedStoreId, setSelectedStoreId] = useState<string>('') // '' = consolidado (todas)

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores-relatorio'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as StoreOption[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: rows = [], isLoading, error } = useQuery<StockRow[]>({
    queryKey: ['current-store-stock', selectedStoreId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_store_stock', {
        p_store_id: selectedStoreId || null,
      })
      if (error) throw error
      return (data || []) as StockRow[]
    },
  })

  const grouped = useMemo(() => {
    const map = new Map<string, StockRow[]>()
    for (const row of rows) {
      const key = row.store_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return Array.from(map.entries())
  }, [rows])

  if (role !== 'admin') {
    return <Navigate to="/estoque/contagem" replace />
  }

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-600" />
          <h1 className="text-lg font-bold text-foreground">Relatório de estoque por loja</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Mostra a última contagem confirmada de cada loja, cruzada com a meta cadastrada. Não reflete vendas/consumo em tempo real — só é atualizado quando uma nova contagem é confirmada.
        </p>
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="h-9 rounded-lg border border-input text-sm bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">Todas as lojas (consolidado)</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando…</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-border shadow-card p-6 text-center text-sm text-red-600">
          Erro ao carregar relatório: {error instanceof Error ? error.message : 'desconhecido'}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border shadow-card p-8 text-center">
          <p className="text-muted-foreground">Nenhuma contagem confirmada ainda para {selectedStoreId ? 'esta loja' : 'nenhuma loja'}.</p>
        </div>
      ) : (
        grouped.map(([storeName, storeRows]) => (
          <section key={storeName} className="space-y-2">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground px-1">
              {storeName} · última contagem em {new Date(storeRows[0].confirmed_at).toLocaleString('pt-BR')}
            </h2>
            <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground">Produto</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Quantidade</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Meta</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeRows.map((row) => {
                      const hasTarget = row.target_quantity != null
                      const isLow = hasTarget && (row.total_units ?? 0) < (row.target_quantity as number)
                      return (
                        <tr key={row.product_id} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground">{row.product_name}</td>
                          <td className="px-4 py-2.5 text-sm text-center font-bold">{row.total_units ?? '—'}</td>
                          <td className="px-4 py-2.5 text-sm text-center text-muted-foreground">{row.target_quantity ?? '—'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {!hasTarget ? (
                              <span className="text-xs text-muted-foreground">sem meta</span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                <AlertTriangle className="w-3 h-3" /> Abaixo
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">OK</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))
      )}
    </EstoqueLayout>
  )
}
