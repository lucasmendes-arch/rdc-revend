import type { PublicProduct } from '@/hooks/useCatalogProducts'

export interface Package {
  id: number
  name: string
  price: number
  description: string
  expectedRevenue: number
  multiplier: string
  highlight?: boolean
}

export const PACKAGES: Package[] = [
  {
    id: 1,
    name: 'Iniciante',
    price: 497.99,
    description: 'Ideal para começar a revenda',
    expectedRevenue: 996,
    multiplier: '2x',
  },
  {
    id: 2,
    name: 'Crescimento',
    price: 1497.99,
    description: 'Para quem já tem clientela',
    expectedRevenue: 2996,
    multiplier: '2x',
  },
  {
    id: 3,
    name: 'Pro',
    price: 2997.99,
    description: 'Estoque completo para salões',
    expectedRevenue: 5996,
    multiplier: '2x',
    highlight: true,
  },
  {
    id: 4,
    name: 'Elite',
    price: 4997.99,
    description: 'Máxima variedade e lucro',
    expectedRevenue: 9996,
    multiplier: '2x',
  },
]

const PRIORITY_ORDER_LOW: Array<PublicProduct['category_type']> = ['alto_giro', 'recompra_alta', 'maior_margem']
const PRIORITY_ORDER_HIGH: Array<PublicProduct['category_type']> = ['alto_giro', 'maior_margem', 'recompra_alta']

export function selectProductsForPackage(pkg: Package, products: PublicProduct[]): PublicProduct[] {
  const eligible = products.filter(p => !p.is_professional && p.price > 0)
  const priority = pkg.id <= 2 ? PRIORITY_ORDER_LOW : PRIORITY_ORDER_HIGH

  const selected: PublicProduct[] = []
  let total = 0
  const used = new Set<string>()

  // Add products by priority category
  for (const cat of priority) {
    const catProducts = eligible.filter(p => p.category_type === cat && !used.has(p.id))
    for (const p of catProducts) {
      if (total + p.price > pkg.price) continue
      selected.push(p)
      total += p.price
      used.add(p.id)
    }
  }

  // Fill remaining with uncategorized products
  const rest = eligible.filter(p => !used.has(p.id))
  for (const p of rest) {
    if (total + p.price > pkg.price) continue
    selected.push(p)
    total += p.price
    used.add(p.id)
  }

  return selected
}
