import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface UpsellOffer {
  id: string
  product_id: string
  title: string
  description: string | null
  discounted_price: number
  quantity: number
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
        .select('id, product_id, title, description, discounted_price, quantity, is_active, catalog_products(id, name, price, main_image)')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      // Supabase FK join may return an object or an array depending on relation type
      const raw = (data as any).catalog_products;
      const product = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;

      return {
        ...data,
        product,
        catalog_products: undefined,
      } as UpsellOffer
    },
    staleTime: 5 * 60 * 1000,
  })
}
