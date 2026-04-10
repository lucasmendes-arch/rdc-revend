import { useMemo } from 'react'
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
 * @param fetchPriceList Se true, busca get_my_price_list_items() e sobrepõe partner_price
 *   com o preço da tabela de preço do parceiro logado.
 */
export function useCatalogProducts(opts?: {
  includePartnerPrice?: boolean
  fetchPriceList?: boolean
}) {
  const includePartnerPrice = opts?.includePartnerPrice ?? false
  const fetchPriceList = opts?.fetchPriceList ?? false

  const productsQuery = useQuery({
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

      if (error) throw error
      return (data || []).map((p: any) => ({
        ...p,
        partner_price: p.partner_price ?? null,
        category: p.categories ?? null,
        categories: undefined,
      })) as PublicProduct[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const priceListQuery = useQuery({
    queryKey: ['my-price-list-items'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_price_list_items')
      if (error) throw error
      return (data ?? []) as { product_id: string; price: number }[]
    },
    enabled: fetchPriceList,
    staleTime: 2 * 60 * 1000,
  })

  // Merge: price list price overrides partner_price for matching products
  const data = useMemo(() => {
    const base = productsQuery.data ?? []
    if (!priceListQuery.data?.length) return base
    const priceMap = new Map(priceListQuery.data.map(i => [i.product_id, Number(i.price)]))
    return base.map(p =>
      priceMap.has(p.id)
        ? { ...p, partner_price: priceMap.get(p.id)! }
        : p
    )
  }, [productsQuery.data, priceListQuery.data])

  return {
    ...productsQuery,
    data,
    isLoading: productsQuery.isLoading || (fetchPriceList && priceListQuery.isLoading),
  }
}
