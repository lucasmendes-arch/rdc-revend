import type { PublicProduct } from '@/hooks/useCatalogProducts'

export interface PackageItem {
  nameMatch: string
  qty: number
  expectedPrice: number
}

export interface Package {
  id: number
  name: string
  price: number
  description: string
  expectedRevenue: number
  multiplier: string
  highlight?: boolean
  displayProductCount: number
  items: PackageItem[]
}

export const PACKAGES: Package[] = [
  {
    id: 1,
    name: 'Cachinhos',
    price: 500,
    description: 'Ideal para começar a revenda',
    expectedRevenue: 900,
    multiplier: '1.8x',
    displayProductCount: 15,
    items: [
      { nameMatch: 'Ativador de Cachos Morango', qty: 2, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Óleo de Girassol', qty: 2, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos 3em1 Whey', qty: 2, expectedPrice: 37.99 },
      { nameMatch: 'Kit Mix de Óleos', qty: 1, expectedPrice: 97.99 },
      { nameMatch: 'Kit Café Verde', qty: 1, expectedPrice: 97.99 },
      { nameMatch: 'Kit Gelatina', qty: 1, expectedPrice: 97.99 },
    ],
  },
  {
    id: 2,
    name: 'Cachos em Alta',
    price: 1500,
    description: 'Para quem já tem clientela',
    expectedRevenue: 3000,
    multiplier: '2x',
    displayProductCount: 45,
    items: [
      { nameMatch: 'Ativador de Cachos Morango', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Óleo de Girassol', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos 3em1 Whey', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Kit Mix de Óleos', qty: 2, expectedPrice: 97.99 },
      { nameMatch: 'Kit Café Verde', qty: 2, expectedPrice: 97.99 },
      { nameMatch: 'Kit Babosa e Tutano', qty: 2, expectedPrice: 97.99 },
      { nameMatch: 'Kit Karitê', qty: 2, expectedPrice: 97.99 },
      { nameMatch: 'Kit Love Word', qty: 2, expectedPrice: 97.99 },
      { nameMatch: 'Gelatina Modeladora', qty: 3, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Argan', qty: 1, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Rícino', qty: 1, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Coco', qty: 1, expectedPrice: 29.99 },
    ],
  },
  {
    id: 3,
    name: 'Profissional dos Cachos',
    price: 3000,
    description: 'Estoque completo para salões',
    expectedRevenue: 6750,
    multiplier: '2.25x',
    highlight: true,
    displayProductCount: 95,
    items: [
      { nameMatch: 'Ativador de Cachos Morango', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Óleo de Girassol', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos 3em1 Whey', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Coco', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Mandioca', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Máscara 2em1 Mandioca', qty: 3, expectedPrice: 34.99 },
      { nameMatch: 'Máscara 2em1 Coco', qty: 3, expectedPrice: 34.99 },
      { nameMatch: 'Máscara 2em1 Morango', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Shampoo Coco', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Shampoo Mandioca', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Shampoo Morango', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Kit Mix de Óleos', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Café Verde', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Babosa e Tutano', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Karitê', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Love Word', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Gelatina Modeladora', qty: 5, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Argan', qty: 3, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Rícino', qty: 3, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Coco', qty: 3, expectedPrice: 29.99 },
      { nameMatch: 'Perfume Capilar', qty: 3, expectedPrice: 29.99 },
    ],
  },
  {
    id: 4,
    name: 'Império dos Cachos',
    price: 5000,
    description: 'Máxima variedade e lucro',
    expectedRevenue: 12500,
    multiplier: '2.5x',
    displayProductCount: 150,
    items: [
      { nameMatch: 'Ativador de Cachos Morango', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Óleo de Girassol', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos 3em1 Whey', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Coco', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Ativador de Cachos Mandioca', qty: 3, expectedPrice: 37.99 },
      { nameMatch: 'Máscara 2em1 Mandioca', qty: 3, expectedPrice: 34.99 },
      { nameMatch: 'Máscara 2em1 Coco', qty: 3, expectedPrice: 34.99 },
      { nameMatch: 'Máscara 2em1 Morango', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Shampoo Coco', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Shampoo Mandioca', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Shampoo Morango', qty: 3, expectedPrice: 24.99 },
      { nameMatch: 'Kit Mix de Óleos', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Café Verde', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Babosa e Tutano', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Karitê', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Love Word', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Macadâmia', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Argan Teen', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Abacate', qty: 3, expectedPrice: 97.99 },
      { nameMatch: 'Kit Force Nature', qty: 5, expectedPrice: 149.99 },
      { nameMatch: 'Gelatina Modeladora', qty: 10, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Argan', qty: 5, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Rícino', qty: 5, expectedPrice: 29.99 },
      { nameMatch: 'Óleo de Coco', qty: 5, expectedPrice: 29.99 },
      { nameMatch: 'Perfume Capilar', qty: 5, expectedPrice: 29.99 },
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

    // Then try partial (target contained in product name)
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
      selected.push({
        product: {
          id: 'not_found',
          name: item.nameMatch,
          category_id: '',
          price: item.expectedPrice,
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
