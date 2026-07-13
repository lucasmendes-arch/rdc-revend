import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CatalogProduct {
  id: string
  nuvemshop_product_id?: number | null
  name: string
  description_html?: string | null
  price: number
  partner_price?: number | null
  compare_at_price?: number | null
  images?: string[] | null
  main_image?: string | null
  is_active: boolean
  source?: string | null
  updated_from_source_at?: string | null
  created_at?: string
  updated_at?: string
  category_type?: 'alto_giro' | 'maior_margem' | 'recompra_alta' | null
  is_professional?: boolean
  is_highlight?: boolean
  is_new_arrival?: boolean
  category_id?: string | null
  category?: { id: string; name: string } | null
  sort_order?: number
}

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, nuvemshop_product_id, name, description_html, price, partner_price, compare_at_price, main_image, is_active, source, created_at, updated_at, category_type, is_professional, is_highlight, is_new_arrival, category_id, sort_order, categories(id, name)')
        .order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data || []).map((p: any) => ({
        ...p,
        category: p.categories ?? null,
        categories: undefined,
      })) as CatalogProduct[]
    },
    staleTime: 1 * 60 * 1000, // 1 minuto
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string;[key: string]: any }) => {
      const { data, error } = await supabase
        .from('catalog_products')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()

      if (error) throw error
      return (data?.[0] || {}) as CatalogProduct
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    },
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: {
      name: string
      price: number
      partner_price?: number | null
      compare_at_price?: number | null
      main_image?: string | null
      is_active: boolean
      category_type?: 'alto_giro' | 'maior_margem' | 'recompra_alta' | null
      is_professional?: boolean
      is_highlight?: boolean
      is_new_arrival?: boolean
      category_id?: string | null
    }) => {
      const { data, error } = await supabase
        .from('catalog_products')
        .insert({
          ...product,
          source: 'manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()

      if (error) throw error
      return (data?.[0] || {}) as CatalogProduct
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('catalog_products')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    },
  })
}

export function useBulkUpdateSortOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const { error } = await supabase.rpc('admin_update_product_sort_orders', {
        updates: updates,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    },
  })
}
