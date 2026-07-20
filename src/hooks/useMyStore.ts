import { useCallback, useSyncExternalStore } from 'react'
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

// Estado compartilhado entre TODAS as instâncias do hook — o seletor de loja
// fica no EstoqueLayout e o conteúdo nas páginas; com useState local, trocar a
// loja só re-renderizava o header e a página ficava com a loja antiga até F5.
let adminSlugValue: string | null = null
let adminSlugInitialized = false
const adminSlugListeners = new Set<() => void>()

function readAdminSlug(): string | null {
  if (!adminSlugInitialized) {
    adminSlugInitialized = true
    try { adminSlugValue = localStorage.getItem(ADMIN_STORE_KEY) } catch { adminSlugValue = null }
  }
  return adminSlugValue
}

function subscribeAdminSlug(listener: () => void) {
  adminSlugListeners.add(listener)
  return () => { adminSlugListeners.delete(listener) }
}

function writeAdminSlug(slug: string) {
  adminSlugValue = slug
  try { localStorage.setItem(ADMIN_STORE_KEY, slug) } catch { /* ignore */ }
  adminSlugListeners.forEach((l) => l())
}

export function useMyStore() {
  const { storeId, role } = useAuth()
  // administrativo tem o mesmo acesso irrestrito de estoque que o admin
  // (sem loja fixa, escolhe qualquer loja) — ver has_full_stock_access() no backend.
  const isAdmin = role === 'admin' || role === 'administrativo'

  // Admin (e administrativo) não tem store_id (não é colaborador de nenhuma
  // loja) — para poder supervisionar/testar o módulo, escolhe manualmente
  // uma loja "de teste".
  const sharedAdminSlug = useSyncExternalStore(subscribeAdminSlug, readAdminSlug)
  const adminSlug = isAdmin ? sharedAdminSlug : null

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
    writeAdminSlug(slug)
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
