import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PublicProduct {
  id: string
  name: string
  main_image: string | null
  price: number
  partner_price: number | null
  compare_at_price: number | null
  description_html: string | null
  is_active: boolean
  is_professional: boolean
  category_type: 'alto_giro' | 'maior_margem' | 'recompra_alta' | null
  is_highlight: boolean
  category_id: string | null
  category: { id: string; name: string; slug: string; sort_order: number } | null
}

/**
 * Hook para buscar produtos do catálogo público.
 *
 * @param includePartnerPrice Se true, inclui partner_price na query (requer authenticated).
 *   Quando false (default), a coluna não é solicitada — anon não tem SELECT nela.
 */
export function useCatalogProducts(opts?: { includePartnerPrice?: boolean }) {
  const includePartnerPrice = opts?.includePartnerPrice ?? false

  return useQuery({
    queryKey: ['catalog-products', includePartnerPrice],
    queryFn: async () => {
      const baseCols = 'id, name, main_image, price, compare_at_price, description_html, is_active, category_type, is_professional, is_highlight, category_id, categories(id, name, slug, sort_order)'
      const selectCols = includePartnerPrice
        ? `${baseCols}, partner_price`
        : baseCols

      const { data, error } = await supabase
        .from('catalog_products')
        .select(selectCols)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (error) {
        throw error
      }
      return (data || []).map((p: any) => ({
        ...p,
        partner_price: p.partner_price ?? null,
        category: p.categories ?? null,
        categories: undefined,
      })) as PublicProduct[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
