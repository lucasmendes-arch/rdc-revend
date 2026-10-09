import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMyStore } from '@/hooks/useMyStore'
import { naturalCompare } from '@/lib/naturalSort'
import { getCategoryColor } from '@/lib/stockCategoryColors'
import { sortByStoreOrder } from '@/lib/storeOrder'
import { Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'

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

interface StockCategoryOption {
  id: string
  name: string
  sort_order: number
  color_index: number
}

interface ProductPivotRow {
  product_id: string
  product_name: string
  stock_category: string | null
  // undefined = loja não tem contagem confirmada com este produto;
  // null = contou, mas produto ainda não classificado (sem units_per_box).
  totalsByStore: Map<string, number | null>
  targetsByStore: Map<string, number | null>
  total: number
}

// Larguras fixas de coluna (px) — mesmas em todas as tabelas de categoria,
// via colgroup + table-fixed, pra não "bagunçar" o alinhamento entre seções
// quando os nomes de produto/loja têm tamanhos diferentes de uma categoria
// pra outra.
const PRODUCT_COL_WIDTH = 220
const STORE_COL_WIDTH = 84
const TOTAL_COL_WIDTH = 96

interface StockPivotTableProps {
  // Quando informado, mostra só a contagem daquela loja (sem colunas por
  // loja, uma coluna "Quantidade" só) — usado na view "Linhares (CD)" de
  // /admin/estoque. Sem storeId: pivot "produto × loja + Total" entre todas
  // as unidades. Nenhum dos dois casos filtra por is_active/stock_only —
  // é sempre tudo que foi contado, não só o que é vendido no catálogo B2B
  // (essa filtragem só existe na aba "Checkout", que lê `inventory`).
  storeId?: string
}

// Tabela "produto × loja + Total" — soma o estoque atual (última contagem
// confirmada de cada loja) por produto entre todas as unidades. Usada tanto
// em /estoque/atual quanto na aba "Todas as unidades" de /admin/estoque.
export default function StockPivotTable({ storeId }: StockPivotTableProps) {
  const { allStores } = useMyStore()

  const { data: rows = [], isLoading, error } = useQuery<StockRow[]>({
    queryKey: ['current-store-stock-all', storeId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_store_stock', { p_store_id: storeId ?? null })
      if (error) throw error
      return (data || []) as StockRow[]
    },
  })

  const { data: stockCategories = [] } = useQuery<StockCategoryOption[]>({
    queryKey: ['stock-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_categories').select('id, name, sort_order, color_index').order('sort_order').order('name')
      if (error) throw error
      return (data || []) as StockCategoryOption[]
    },
    staleTime: 5 * 60 * 1000,
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

  // Com storeId, é uma view de loja única — sem colunas por loja, só uma
  // coluna "Quantidade" (ver render abaixo).
  const storeColumns = useMemo(() => (storeId ? [] : sortByStoreOrder(allStores)), [allStores, storeId])

  // Pivota "loja x produto" (formato da RPC) para "produto x [loja1, loja2, ...] + total".
  const pivotByProduct = useMemo(() => {
    const map = new Map<string, ProductPivotRow>()
    for (const row of rows) {
      let entry = map.get(row.product_id)
      if (!entry) {
        entry = {
          product_id: row.product_id,
          product_name: row.product_name,
          stock_category: row.stock_category,
          totalsByStore: new Map(),
          targetsByStore: new Map(),
          total: 0,
        }
        map.set(row.product_id, entry)
      }
      entry.totalsByStore.set(row.store_id, row.total_units)
      entry.targetsByStore.set(row.store_id, row.target_quantity)
      if (row.total_units != null) entry.total += row.total_units
    }
    return map
  }, [rows])

  // Mesmo agrupamento/ordem por categoria usado em Confirmacao.tsx — "Sem
  // categoria" sempre por último, ordem natural do nome dentro do grupo.
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, ProductPivotRow[]>()
    for (const entry of pivotByProduct.values()) {
      const key = entry.stock_category || 'Sem categoria'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => naturalCompare(a.product_name, b.product_name))
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Sem categoria') return 1
      if (b === 'Sem categoria') return -1
      const orderA = categoryOrderByName.get(a) ?? Infinity
      const orderB = categoryOrderByName.get(b) ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }, [pivotByProduct, categoryOrderByName])

  // Larguras como % (mantendo a mesma proporção da versão em px) — a tabela
  // ocupa 100% do card em vez de ficar "encolhida" à esquerda, mas como toda
  // categoria usa o mesmo conjunto de % e os cards têm a mesma largura, o
  // grid continua idêntico célula embaixo de célula em qualquer seção.
  // min-width em px é só a salvaguarda pra não espremer demais em telas
  // estreitas (aí sim entra o scroll horizontal, igual em todas as seções).
  const tableWidthPx = PRODUCT_COL_WIDTH + storeColumns.length * STORE_COL_WIDTH + TOTAL_COL_WIDTH
  const productColPct = (PRODUCT_COL_WIDTH / tableWidthPx) * 100
  const storeColPct = (STORE_COL_WIDTH / tableWidthPx) * 100
  const totalColPct = (TOTAL_COL_WIDTH / tableWidthPx) * 100

  if (isLoading) return <PageLoading />

  if (error) {
    return (
      <Panel className="text-center text-[13px] text-danger">
        Erro ao carregar estoque: {error instanceof Error ? error.message : 'desconhecido'}
      </Panel>
    )
  }

  if (groupedByCategory.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          icon={Boxes}
          title="Nenhuma contagem confirmada ainda"
          description="O estoque aparece aqui assim que uma loja confirmar a primeira contagem."
        />
      </Panel>
    )
  }

  // Chip violeta de "acima do dobro da meta" — exceção categórica de unidade/loja (design-tokens §8).
  const overstockChip = 'inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30'

  return (
    <div className="space-y-6">
      {groupedByCategory.map(([category, categoryRows]) => {
        const isUncategorized = category === 'Sem categoria'
        const color = isUncategorized ? null : getCategoryColor(categoryColorByName.get(category))
        return (
          <section key={category} className="space-y-2">
            {/* Cor da categoria é escolhida pelo usuário (exceção categórica) */}
            <span
              className={`inline-flex items-center h-6 px-2 rounded-md text-[12.5px] font-medium ${isUncategorized ? 'bg-muted text-ink-600' : ''}`}
              style={color ? { backgroundColor: color.bg, color: color.text } : undefined}
            >
              {category}
            </span>
            <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  className="data-table table-fixed"
                  style={{ minWidth: tableWidthPx }}
                >
                  <colgroup>
                    <col style={{ width: `${productColPct}%` }} />
                    {storeColumns.map((s) => <col key={s.id} style={{ width: `${storeColPct}%` }} />)}
                    <col style={{ width: `${totalColPct}%` }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      {storeColumns.map((s) => (
                        <th key={s.id} className="!text-center truncate" title={s.name}>
                          {s.name}
                        </th>
                      ))}
                      <th className="!text-center !text-foreground">{storeId ? 'Quantidade' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((entry) => {
                      const lastValue = storeId ? entry.totalsByStore.get(storeId) : entry.total
                      const lastTarget = storeId ? entry.targetsByStore.get(storeId) : undefined
                      const lastOverstocked = typeof lastValue === 'number' && typeof lastTarget === 'number' && lastTarget > 0 && lastValue > lastTarget * 2
                      return (
                        <tr key={entry.product_id}>
                          <td className="font-medium text-foreground truncate" title={entry.product_name}>
                            {entry.product_name}
                          </td>
                          {storeColumns.map((s) => {
                            const value = entry.totalsByStore.get(s.id)
                            const target = entry.targetsByStore.get(s.id)
                            const isOverstocked = typeof value === 'number' && typeof target === 'number' && target > 0 && value > target * 2
                            return (
                              <td
                                key={s.id}
                                className="text-center"
                                title={isOverstocked ? `Meta em ${s.name}: ${target}` : undefined}
                              >
                                {value === undefined ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : value === null ? (
                                  <span className="text-[11.5px] font-medium text-warning">não classif.</span>
                                ) : isOverstocked ? (
                                  <span className={overstockChip}>
                                    {value}
                                    <TrendingUp className="w-3 h-3 shrink-0" />
                                  </span>
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          })}
                          <td className="text-center font-semibold bg-surface">
                            {storeId ? (
                              lastValue === undefined ? (
                                <span className="text-muted-foreground">—</span>
                              ) : lastValue === null ? (
                                <span className="text-[11.5px] font-medium text-warning">não classif.</span>
                              ) : lastOverstocked ? (
                                <span className={overstockChip}>
                                  {lastValue}
                                  <TrendingUp className="w-3 h-3 shrink-0" />
                                </span>
                              ) : (
                                lastValue
                              )
                            ) : (
                              entry.total
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
        )
      })}
    </div>
  )
}
