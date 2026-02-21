import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CatalogProduct {
  id: string
  nuvemshop_product_id?: number | null
  name: string
  description_html?: string | null
  price: number
  compare_at_price?: number | null
  images?: string[] | null
  main_image?: string | null
  is_active: boolean
  source?: string | null
  updated_from_source_at?: string | null
  created_at?: string
  updated_at?: string
}

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, nuvemshop_product_id, name, description_html, price, compare_at_price, main_image, is_active, source, created_at, updated_at')
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data || []) as CatalogProduct[]
    },
    staleTime: 1 * 60 * 1000, // 1 minuto
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('catalog_products')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as CatalogProduct
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

export interface SyncResult {
  success: boolean
  syncRunId: string
  result: {
    imported: number
    updated: number
    total: number
    errors: number
    errorMessages: string[]
  }
}

export function useNuvemshopSync() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-nuvemshop`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.error || data.message || JSON.stringify(data)
        console.error('Sync error:', errorMsg)
        throw new Error(errorMsg)
      }

      return data as SyncResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    },
  })
}
