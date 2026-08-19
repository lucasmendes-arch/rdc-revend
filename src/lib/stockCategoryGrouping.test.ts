import { describe, it, expect } from 'vitest'
import { groupByStockCategory, UNCATEGORIZED } from './stockCategoryGrouping'

interface Item {
  name: string
  category: string | null
}

const order = new Map([
  ['Ativador 1l', 1],
  ['Uso Profissional', 2],
  ['Consumo', 3],
])

function group(items: Item[]) {
  return groupByStockCategory(items, (i) => i.category, (i) => i.name, order)
}

describe('groupByStockCategory', () => {
  it('respeita o sort_order cadastrado, não a ordem alfabética', () => {
    const result = group([
      { name: 'Açúcar', category: 'Consumo' },
      { name: 'Ampola', category: 'Uso Profissional' },
      { name: 'Abacate 1L', category: 'Ativador 1l' },
    ])
    expect(result.map(([c]) => c)).toEqual(['Ativador 1l', 'Uso Profissional', 'Consumo'])
  })

  it('joga "Sem categoria" pro fim, mesmo vindo de null ou string vazia', () => {
    const result = group([
      { name: 'Sem dono', category: null },
      { name: 'Vazio', category: '' },
      { name: 'Açúcar', category: 'Consumo' },
    ])
    expect(result.map(([c]) => c)).toEqual(['Consumo', UNCATEGORIZED])
    expect(result[1][1]).toHaveLength(2)
  })

  it('ordena produto por ordem natural dentro do grupo (10l depois de 2l)', () => {
    const result = group([
      { name: 'Ativador 10L', category: 'Ativador 1l' },
      { name: 'Ativador 2L', category: 'Ativador 1l' },
    ])
    expect(result[0][1].map((i) => i.name)).toEqual(['Ativador 2L', 'Ativador 10L'])
  })

  it('categoria fora do cadastro vai pro fim, antes de "Sem categoria"', () => {
    const result = group([
      { name: 'Órfã', category: 'Categoria apagada' },
      { name: 'Nenhuma', category: null },
      { name: 'Açúcar', category: 'Consumo' },
    ])
    expect(result.map(([c]) => c)).toEqual(['Consumo', 'Categoria apagada', UNCATEGORIZED])
  })
})
