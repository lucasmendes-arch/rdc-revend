// Agrupamento de produtos por categoria de estoque, na ordem que o módulo
// inteiro usa: categorias na ordem cadastrada (stock_categories.sort_order),
// "Sem categoria" sempre por último, e ordem natural do nome do produto
// dentro de cada grupo (naturalCompare, pra "1l" não vir depois de "10l").
//
// A mesma regra está escrita à mão em Confirmacao.tsx e StockPivotTable.tsx —
// aqui ela existe pra não virar uma terceira cópia. Migrar as duas é
// mecânico, mas ficou fora do escopo de quem criou este arquivo.

import { naturalCompare } from '@/lib/naturalSort'

export const UNCATEGORIZED = 'Sem categoria'

export interface StockCategoryOption {
  id: string
  name: string
  sort_order: number
  color_index: number
}

/**
 * Agrupa `items` por categoria e devolve `[categoria, itens][]` já ordenado.
 * `getCategory` pode devolver null/'' — cai em "Sem categoria".
 */
export function groupByStockCategory<T>(
  items: T[],
  getCategory: (item: T) => string | null | undefined,
  getName: (item: T) => string,
  categoryOrderByName: Map<string, number>
): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = getCategory(item) || UNCATEGORIZED
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }

  for (const group of map.values()) {
    group.sort((a, b) => naturalCompare(getName(a), getName(b)))
  }

  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === UNCATEGORIZED) return 1
    if (b === UNCATEGORIZED) return -1
    const orderA = categoryOrderByName.get(a) ?? Infinity
    const orderB = categoryOrderByName.get(b) ?? Infinity
    if (orderA !== orderB) return orderA - orderB
    return a.localeCompare(b)
  })
}
