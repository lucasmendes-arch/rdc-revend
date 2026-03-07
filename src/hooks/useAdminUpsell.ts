import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AdminUpsellOffer {
  id: string
  product_id: string
  title: string
  description: string | null
  discounted_price: number
  quantity: number
  is_active: boolean
  created_at: string
  product: { id: string; name: string; price: number; main_image: string | null } | null
}

export function useAdminUpsells() {
  return useQuery({
    queryKey: ['admin-upsells'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upsell_offers')
        .select('id, product_id, title, description, discounted_price, quantity, is_active, created_at, catalog_products(id, name, price, main_image)')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []).map((d: any) => ({
        ...d,
        product: d.catalog_products ?? null,
        catalog_products: undefined,
      })) as AdminUpsellOffer[]
    },
    staleTime: 1 * 60 * 1000,
  })
}

export function useCreateUpsell() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (offer: { product_id: string; title: string; description?: string; discounted_price: number; quantity: number; is_active: boolean }) => {
      // If activating, deactivate others first
      if (offer.is_active) {
        await supabase.from('upsell_offers').update({ is_active: false }).eq('is_active', true)
      }
      const { data, error } = await supabase
        .from('upsell_offers')
        .insert(offer)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-upsells'] })
      qc.invalidateQueries({ queryKey: ['upsell-active'] })
    },
  })
}

export function useUpdateUpsell() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; description?: string; discounted_price?: number; quantity?: number; is_active?: boolean; product_id?: string }) => {
      // If activating, deactivate others first
      if (updates.is_active) {
        await supabase.from('upsell_offers').update({ is_active: false }).eq('is_active', true)
      }
      const { data, error } = await supabase
        .from('upsell_offers')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-upsells'] })
      qc.invalidateQueries({ queryKey: ['upsell-active'] })
    },
  })
}

export function useDeleteUpsell() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('upsell_offers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-upsells'] })
      qc.invalidateQueries({ queryKey: ['upsell-active'] })
    },
  })
}
