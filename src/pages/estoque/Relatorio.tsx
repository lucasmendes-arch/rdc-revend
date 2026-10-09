import { useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, AlertTriangle, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import { downloadCsv, slugifyForFilename, type CsvValue } from '@/lib/csv'
import { getCategoryColor } from '@/lib/stockCategoryColors'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, AdminSection, Panel, EmptyState, PageLoading, Toolbar } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
      <AdminPage
        title="Relatório de estoque por loja"
        description="Última contagem confirmada de cada loja, agrupada por categoria e cruzada com a meta cadastrada. Só é atualizado quando uma nova contagem é confirmada — não reflete vendas em tempo real."
        actions={
          <Button
            variant="secondary"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            title={rows.length === 0 ? 'Nada pra exportar ainda' : 'Baixar planilha (.csv)'}
          >
            <Download />
            Exportar CSV
          </Button>
        }
        toolbar={
          <Toolbar>
            <StyledSelect
              variant="inline"
              value={selectedStoreId}
              onChange={setSelectedStoreId}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              emptyLabel="Todas as lojas (consolidado)"
              placeholder="Todas as lojas (consolidado)"
              className="h-9"
            />
          </Toolbar>
        }
      >
        {isLoading ? (
          <PageLoading />
        ) : error ? (
          <Panel className="text-center text-[13px] text-danger">
            Erro ao carregar relatório: {error instanceof Error ? error.message : 'desconhecido'}
          </Panel>
        ) : rows.length === 0 ? (
          <Panel flush>
            <EmptyState
              icon={BarChart3}
              title="Nenhuma contagem confirmada ainda"
              description={selectedStoreId ? 'Esta loja ainda não confirmou nenhuma contagem.' : 'Nenhuma loja confirmou contagem ainda.'}
            />
          </Panel>
        ) : (
          <div className="space-y-8">
            {groupedByStore.map((store) => (
              <AdminSection
                key={store.storeName}
                title={store.storeName}
                description={`Última contagem em ${new Date(store.confirmedAt).toLocaleString('pt-BR')}`}
              >
                <div className="space-y-5">
                  {store.categories.map(([category, categoryRows]) => {
                    // Mesma cor que a categoria já tem na contagem e no estoque
                    // atual — a cor identifica a categoria, não a tela.
                    const isUncategorized = category === UNCATEGORIZED
                    const color = isUncategorized ? null : getCategoryColor(categoryColorByName.get(category))
                    const belowTarget = categoryRows.filter(
                      (row) => row.target_quantity != null && (row.total_units ?? 0) < row.target_quantity
                    ).length

                    return (
                      <div key={category} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center h-6 px-2 rounded-md text-[12.5px] font-medium ${isUncategorized ? 'bg-muted text-ink-600' : ''}`}
                            style={color ? { backgroundColor: color.bg, color: color.text } : undefined}
                          >
                            {category}
                          </span>
                          <span className="text-[12px] text-muted-foreground tabular-nums">
                            {categoryRows.length} {categoryRows.length === 1 ? 'produto' : 'produtos'}
                            {belowTarget > 0 && ` · ${belowTarget} abaixo da meta`}
                          </span>
                        </div>

                        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Produto</th>
                                  <th className="!text-right">Quantidade</th>
                                  <th className="!text-right">Meta</th>
                                  <th className="!text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {categoryRows.map((row) => {
                                  const hasTarget = row.target_quantity != null
                                  const isLow = hasTarget && (row.total_units ?? 0) < (row.target_quantity as number)
                                  return (
                                    <tr key={row.product_id}>
                                      <td className="font-medium text-foreground">{row.product_name}</td>
                                      <td className="text-right font-semibold">{row.total_units ?? '—'}</td>
                                      <td className="text-right text-muted-foreground">{row.target_quantity ?? '—'}</td>
                                      <td className="text-center">
                                        {!hasTarget ? (
                                          <span className="text-[12px] text-muted-foreground">Sem meta</span>
                                        ) : isLow ? (
                                          <Badge variant="danger"><AlertTriangle className="w-3 h-3" /> Abaixo</Badge>
                                        ) : (
                                          <Badge variant="success">OK</Badge>
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
                </div>
              </AdminSection>
            ))}
          </div>
        )}
      </AdminPage>
    </EstoqueLayout>
  )
}
