import { naturalCompare } from './naturalSort'

// Ordem fixa das lojas pedida pelo usuário pra qualquer tela que liste lojas
// lado a lado (colunas de tabela, seletores) — não é alfabética nem
// central-primeiro. Loja fora dessa lista (nova filial cadastrada) cai no
// fim, ordenada por nome.
export const STORE_COLUMN_ORDER = ['linhares', 'serra', 'colatina', 'teixeira', 'sao-gabriel']

export function sortByStoreOrder<T extends { slug: string; name: string }>(stores: T[]): T[] {
  return [...stores].sort((a, b) => {
    const orderA = STORE_COLUMN_ORDER.indexOf(a.slug)
    const orderB = STORE_COLUMN_ORDER.indexOf(b.slug)
    if (orderA === -1 && orderB === -1) return naturalCompare(a.name, b.name)
    if (orderA === -1) return 1
    if (orderB === -1) return -1
    return orderA - orderB
  })
}
