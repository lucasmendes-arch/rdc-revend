import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PublicProduct {
  id: string
  name: string
  main_image: string | null
  price: number
  compare_at_price: number | null
  description_html: string | null
  is_active: boolean
  is_professional: boolean
  category_type: 'alto_giro' | 'maior_margem' | 'recompra_alta' | null
  is_highlight: boolean
  category_id: string | null
  category: { id: string; name: string; slug: string; sort_order: number } | null
}

export function useCatalogProducts() {
  return useQuery({
    queryKey: ['catalog-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, name, main_image, price, compare_at_price, description_html, is_active, category_type, is_professional, is_highlight, category_id, categories(id, name, slug, sort_order)')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (error) {
        throw error
      }
      // Supabase returns the join as `categories` (table name), remap to `category`
      return (data || []).map((p: any) => ({
        ...p,
        category: p.categories ?? null,
        categories: undefined,
      })) as PublicProduct[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
