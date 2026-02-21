import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PublicProduct {
  id: string
  name: string
  main_image: string | null
  price: number
  compare_at_price: number | null
  description_html: string | null
}

export function useCatalogProducts() {
  return useQuery({
    queryKey: ['catalog-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, name, main_image, price, compare_at_price, description_html')
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Catalog Products Query Error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        throw error
      }
      return (data || []) as PublicProduct[]
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}
