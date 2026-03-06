import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface UpsellOffer {
  id: string
  product_id: string
  title: string
  description: string | null
  discounted_price: number
  is_active: boolean
  product: {
    id: string
    name: string
    price: number
    main_image: string | null
  } | null
}

export function useActiveUpsell() {
  return useQuery({
    queryKey: ['upsell-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upsell_offers')
        .select('id, product_id, title, description, discounted_price, is_active, catalog_products(id, name, price, main_image)')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return {
        ...data,
        product: (data as any).catalog_products ?? null,
        catalog_products: undefined,
      } as UpsellOffer
    },
    staleTime: 5 * 60 * 1000,
  })
}
