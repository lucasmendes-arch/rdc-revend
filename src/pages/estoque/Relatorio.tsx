import { useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader, BarChart3, AlertTriangle, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { downloadCsv, slugifyForFilename, type CsvValue } from '@/lib/csv'
import { getCategoryColor } from '@/lib/stockCategoryColors'
import StyledSelect from '@/components/ui/styled-select'
import {
  groupByStockCategory,
  UNCATEGORIZED,
  type StockCategoryOption,
} from '@/lib/stockCategoryGrouping'

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

const UNCATEGORIZED_COLOR = { bg: '#F3F4F6', text: '#6B7280' }

export default function EstoqueRelatorio() {
  const { role, user } = useAuth()
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

  // Mesma queryKey de StockPivotTable — as duas telas compartilham o cache.
  const { data: stockCategories = [] } = useQuery<StockCategoryOption[]>({
    queryKey: ['stock-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_categories')
        .select('id, name, sort_order, color_index')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data || []) as StockCategoryOption[]
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

  const categoryOrderByName = useMemo(() => {
    const map = new Map<string, number>()
    stockCategories.forEach((c) => map.set(c.name, c.sort_order))
    return map
  }, [stockCategories])

  const categoryColorByName = useMemo(() => {
    const map = new Map<string, number>()
    stockCategories.forEach((c) => map.set(c.name, c.color_index))
    return map
  }, [stockCategories])

  // Loja → categorias → produtos. Duas dimensões porque o consolidado precisa
  // continuar separando as lojas: juntar categorias de lojas diferentes numa
  // seção só misturaria contagens de datas diferentes.
  const groupedByStore = useMemo(() => {
    const byStore = new Map<string, StockRow[]>()
    for (const row of rows) {
      const key = row.store_name
      if (!byStore.has(key)) byStore.set(key, [])
      byStore.get(key)!.push(row)
    }
    return Array.from(byStore.entries()).map(([storeName, storeRows]) => ({
      storeName,
      confirmedAt: storeRows[0].confirmed_at,
      categories: groupByStockCategory(
        storeRows,
        (row) => row.stock_category,
        (row) => row.product_name,
        categoryOrderByName
      ),
    }))
  }, [rows, categoryOrderByName])

  // Exporta exatamente o que está na tela — mesma fonte (`rows`), mesmo
  // filtro de loja, mesma ordem de categoria e produto. Nada de refetch:
  // relatório que baixa diferente do que se está olhando é pior que
  // relatório nenhum.
  function handleExportCsv() {
    const storeName = selectedStoreId
      ? stores.find((s) => s.id === selectedStoreId)?.name ?? 'loja'
      : 'Todas as lojas (consolidado)'
    const generatedAt = new Date()

    const lines: CsvValue[][] = [
      ['Relatório de estoque', storeName],
      ['Gerado em', generatedAt.toLocaleString('pt-BR'), 'por', user?.email ?? '—'],
      ['Base', 'Última contagem confirmada de cada loja — não reflete vendas em tempo real'],
      [],
      ['Loja', 'Contagem em', 'Categoria', 'Produto', 'Quantidade', 'Meta', 'Diferença', 'Status'],
    ]

    for (const store of groupedByStore) {
      for (const [category, categoryRows] of store.categories) {
        for (const row of categoryRows) {
          const hasTarget = row.target_quantity != null
          const quantity = row.total_units
          // Diferença só existe com os dois lados preenchidos. Sai como número
          // cru (-12, e não "-12 un") pra planilha conseguir somar e ordenar.
          const difference =
            hasTarget && quantity != null ? quantity - (row.target_quantity as number) : null

          lines.push([
            row.store_name,
            new Date(row.confirmed_at).toLocaleString('pt-BR'),
            category,
            row.product_name,
            quantity,
            row.target_quantity,
            difference,
            !hasTarget
              ? 'sem meta'
              : (quantity ?? 0) < (row.target_quantity as number)
                ? 'Abaixo'
                : 'OK',
          ])
        }
      }
    }

    const datePart = generatedAt.toISOString().slice(0, 10)
    downloadCsv(`estoque-${slugifyForFilename(storeName)}-${datePart}.csv`, lines)
  }

  if (role !== 'admin' && role !== 'administrativo') {
    return <Navigate to="/estoque/contagem" replace />
  }

  return (
    <EstoqueLayout>
      <div className="bg-card rounded-2xl border border-border shadow-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-bold text-foreground">Relatório de estoque por loja</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Mostra a última contagem confirmada de cada loja, agrupada por categoria e cruzada com a meta cadastrada. Não reflete vendas/consumo em tempo real — só é atualizado quando uma nova contagem é confirmada.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StyledSelect
            variant="inline"
            value={selectedStoreId}
            onChange={setSelectedStoreId}
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            emptyLabel="Todas as lojas (consolidado)"
            placeholder="Todas as lojas (consolidado)"
            className="h-9 bg-card"
          />
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={rows.length === 0 ? 'Nada pra exportar ainda' : 'Baixar planilha (.csv)'}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando…</p>
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6 text-center text-sm text-danger">
          Erro ao carregar relatório: {error instanceof Error ? error.message : 'desconhecido'}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border shadow-card p-8 text-center">
          <p className="text-muted-foreground">Nenhuma contagem confirmada ainda para {selectedStoreId ? 'esta loja' : 'nenhuma loja'}.</p>
        </div>
      ) : (
        groupedByStore.map((store) => (
          <section key={store.storeName} className="space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground px-1">
              {store.storeName} · última contagem em {new Date(store.confirmedAt).toLocaleString('pt-BR')}
            </h2>

            {store.categories.map(([category, categoryRows]) => {
              // Mesma cor que a categoria já tem na contagem e no estoque
              // atual — a cor identifica a categoria, não a tela.
              const color = category === UNCATEGORIZED
                ? UNCATEGORIZED_COLOR
                : getCategoryColor(categoryColorByName.get(category))
              const belowTarget = categoryRows.filter(
                (row) => row.target_quantity != null && (row.total_units ?? 0) < row.target_quantity
              ).length

              return (
                <div key={category} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block px-2.5 py-1 rounded-lg text-sm font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: color.bg, color: color.text }}
                    >
                      {category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {categoryRows.length} {categoryRows.length === 1 ? 'produto' : 'produtos'}
                      {belowTarget > 0 && ` · ${belowTarget} abaixo da meta`}
                    </span>
                  </div>

                  <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
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
                          {categoryRows.map((row) => {
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
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-subtle text-danger">
                                      <AlertTriangle className="w-3 h-3" /> Abaixo
                                    </span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-success-subtle text-success">OK</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        ))
      )}
    </EstoqueLayout>
  )
}
