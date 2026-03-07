import type { PublicProduct } from '@/hooks/useCatalogProducts'

export interface PackageItem {
  nameMatch: string
  qty: number
}

export interface Package {
  id: number
  name: string
  price: number
  description: string
  expectedRevenue: number
  multiplier: string
  highlight?: boolean
  items: PackageItem[]
}

export const PACKAGES: Package[] = [
  {
    id: 1,
    name: 'Iniciante',
    price: 500,
    description: 'Ideal para começar a revenda',
    expectedRevenue: 900,
    multiplier: '1.8x',
    items: [
      { nameMatch: 'Ativador Morango', qty: 2 },
      { nameMatch: 'Ativador Girassol', qty: 2 },
      { nameMatch: 'Ativador Whey', qty: 2 },
      { nameMatch: 'Mix de Óleos', qty: 1 },
      { nameMatch: 'Café Verde', qty: 1 },
      { nameMatch: 'Gelatina', qty: 1 },
    ],
  },
  {
    id: 2,
    name: 'Crescimento',
    price: 1500,
    description: 'Para quem já tem clientela',
    expectedRevenue: 3000,
    multiplier: '2x',
    items: [
      { nameMatch: 'Ativador Morango', qty: 3 },
      { nameMatch: 'Ativador Girassol', qty: 3 },
      { nameMatch: 'Ativador Whey', qty: 3 },
      { nameMatch: 'Mix de Óleos', qty: 2 },
      { nameMatch: 'Café Verde', qty: 2 },
      { nameMatch: 'Babosa e Tutano', qty: 2 },
      { nameMatch: 'Kari', qty: 2 },
      { nameMatch: 'Love', qty: 2 },
      { nameMatch: 'Gelatina Modeladora', qty: 3 },
      { nameMatch: 'Óleo Argan', qty: 1 },
      { nameMatch: 'Óleo Rícino', qty: 1 },
      { nameMatch: 'Óleo Coco', qty: 1 },
    ],
  },
  {
    id: 3,
    name: 'Pro',
    price: 3000,
    description: 'Estoque completo para salões',
    expectedRevenue: 6750,
    multiplier: '2.25x',
    highlight: true,
    items: [
      { nameMatch: 'Ativador Morango', qty: 3 },
      { nameMatch: 'Ativador Girassol', qty: 3 },
      { nameMatch: 'Ativador Whey', qty: 3 },
      { nameMatch: 'Ativador de Coco', qty: 3 },
      { nameMatch: 'Ativador de Mandioca', qty: 3 },
      { nameMatch: 'Máscara Mandioca', qty: 3 },
      { nameMatch: 'Máscara de Coco', qty: 3 },
      { nameMatch: 'Máscara de Morango', qty: 3 },
      { nameMatch: 'Shampoo de Coco', qty: 3 },
      { nameMatch: 'Shampoo de Mandioca', qty: 3 },
      { nameMatch: 'Shampoo de Morango', qty: 3 },
      { nameMatch: 'Mix de Óleos', qty: 3 },
      { nameMatch: 'Café Verde', qty: 3 },
      { nameMatch: 'Babosa e Tutano', qty: 3 },
      { nameMatch: 'Kari', qty: 3 },
      { nameMatch: 'Love Word', qty: 3 },
      { nameMatch: 'Gelatina Modeladora', qty: 5 },
      { nameMatch: 'Óleo Argan', qty: 3 },
      { nameMatch: 'Óleo Rícino', qty: 3 },
      { nameMatch: 'Óleo Coco', qty: 3 },
      { nameMatch: 'Perfume Capilar', qty: 3 },
    ],
  },
  {
    id: 4,
    name: 'Elite',
    price: 5000,
    description: 'Máxima variedade e lucro',
    expectedRevenue: 12500,
    multiplier: '2.5x',
    items: [
      { nameMatch: 'Ativador Morango', qty: 3 },
      { nameMatch: 'Ativador Girassol', qty: 3 },
      { nameMatch: 'Ativador Whey', qty: 3 },
      { nameMatch: 'Ativador de Coco', qty: 3 },
      { nameMatch: 'Ativador de Mandioca', qty: 3 },
      { nameMatch: 'Máscara Mandioca', qty: 3 },
      { nameMatch: 'Máscara de Coco', qty: 3 },
      { nameMatch: 'Máscara de Morango', qty: 3 },
      { nameMatch: 'Shampoo de Coco', qty: 3 },
      { nameMatch: 'Shampoo de Mandioca', qty: 3 },
      { nameMatch: 'Shampoo de Morango', qty: 3 },
      { nameMatch: 'Mix de Óleos', qty: 3 },
      { nameMatch: 'Café Verde', qty: 3 },
      { nameMatch: 'Babosa e Tutano', qty: 3 },
      { nameMatch: 'Kari', qty: 3 },
      { nameMatch: 'Love Word', qty: 3 },
      { nameMatch: 'Macadâmia', qty: 3 },
      { nameMatch: 'Argan', qty: 3 },
      { nameMatch: 'Abacate', qty: 3 },
      { nameMatch: 'Force Nature', qty: 5 },
      { nameMatch: 'Gelatina Modeladora', qty: 10 },
      { nameMatch: 'Óleo Argan', qty: 5 },
      { nameMatch: 'Óleo Rícino', qty: 5 },
      { nameMatch: 'Óleo Coco', qty: 5 },
      { nameMatch: 'Perfume Capilar', qty: 5 },
    ],
  },
]

export interface SelectedPackageProduct {
  product: PublicProduct
  originalName: string
  qty: number
}

// Normalize strings for matching
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

export function selectProductsForPackage(pkg: Package, products: PublicProduct[]): SelectedPackageProduct[] {
  const selected: SelectedPackageProduct[] = []

  for (const item of pkg.items) {
    const target = normalize(item.nameMatch)

    // First try exact match after normalization
    let match = products.find(p => normalize(p.name) === target)

    // Then try partial
    if (!match) {
      match = products.find(p => normalize(p.name).includes(target))
    }

    if (match) {
      selected.push({
        product: match,
        originalName: item.nameMatch,
        qty: item.qty
      })
    } else {
      // Create a dummy product if not found, to indicate what's missing in the details table
      selected.push({
        product: {
          id: 'not_found',
          name: item.nameMatch,
          category_id: '',
          price: 0,
          compare_at_price: null,
          is_professional: false,
          main_image: '',
          is_highlight: false,
          category_type: 'alto_giro' as const,
          description_html: null,
          is_active: true,
          category: null
        },
        originalName: item.nameMatch,
        qty: item.qty
      })
    }
  }

  return selected
}
