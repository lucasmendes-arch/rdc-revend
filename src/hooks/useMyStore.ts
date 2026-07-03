import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface StoreInfo {
  id: string
  slug: string
  name: string
  type: 'central' | 'satellite'
}

const ADMIN_STORE_KEY = 'rdc_estoque_admin_store_slug'

export function useMyStore() {
  const { storeId, role } = useAuth()
  const isAdmin = role === 'admin'

  // Admin não tem store_id (não é colaborador de nenhuma loja) — para poder
  // supervisionar/testar o módulo, escolhe manualmente uma loja "de teste".
  const [adminSlug, setAdminSlugState] = useState<string | null>(() => {
    if (!isAdmin) return null
    try { return localStorage.getItem(ADMIN_STORE_KEY) } catch { return null }
  })

  const { data: allStores = [], isLoading: allStoresLoading } = useQuery<StoreInfo[]>({
    queryKey: ['stores-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, slug, name, type').order('name')
      if (error) throw error
      return (data || []) as StoreInfo[]
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  })

  const { data: myStoreRow, isLoading: myStoreLoading } = useQuery<StoreInfo | null>({
    queryKey: ['my-store', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, slug, name, type')
        .eq('id', storeId as string)
        .maybeSingle()
      if (error) throw error
      return data as StoreInfo | null
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  })

  const setAdminStore = useCallback((slug: string) => {
    setAdminSlugState(slug)
    try { localStorage.setItem(ADMIN_STORE_KEY, slug) } catch { /* ignore */ }
  }, [])

  const store: StoreInfo | null = isAdmin
    ? allStores.find((s) => s.slug === adminSlug) ?? null
    : myStoreRow ?? null

  return {
    store,
    isLoading: isAdmin ? allStoresLoading : (!!storeId && myStoreLoading),
    isCentral: store?.type === 'central',
    isAdmin,
    allStores,
    adminStoreSlug: adminSlug,
    setAdminStore,
    // true quando o admin ainda não escolheu nenhuma loja de teste — nesse
    // caso as telas devem mostrar um prompt em vez de girar o spinner pra sempre.
    needsStoreSelection: isAdmin && !allStoresLoading && !store,
  }
}
