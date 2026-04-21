import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import {
  BadgeDollarSign, Plus, X, Loader, Package, Edit2,
  Check, Trash2, Search, Users, Tag, Power, ArrowRight, Layers,
  Archive, ArchiveRestore, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PriceList {
  id: string
  name: string
  description: string | null
  is_active: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

interface PriceListItemDB {
  id: string
  product_id: string
  price: number
  catalog_products:
    | { id: string; name: string; price: number; main_image: string | null }
    | { id: string; name: string; price: number; main_image: string | null }[]
    | null
}

interface SimpleProduct {
  id: string
  name: string
  price: number
  main_image: string | null
  is_active: boolean
}

interface LinkedPartner {
  id: string
  full_name: string | null
  phone: string | null
  customer_segment: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getItemProduct(item: PriceListItemDB) {
  if (!item.catalog_products) return null
  if (Array.isArray(item.catalog_products)) return item.catalog_products[0] ?? null
  return item.catalog_products
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── PriceListCard ─────────────────────────────────────────────────────────────

function PriceListCard({
  list,
  onOpen,
  onToggle,
  isToggling,
}: {
  list: PriceList
  onOpen: () => void
  onToggle: () => void
  isToggling: boolean
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground text-base truncate">{list.name}</h3>
            {list.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{list.description}</p>
            )}
          </div>
          <span
            className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${
              list.is_active
                ? 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40'
                : 'bg-muted text-muted-foreground ring-border'
            }`}
          >
            {list.is_active ? 'Ativa' : 'Inativa'}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground mb-4">
          Criada em {new Date(list.created_at).toLocaleDateString('pt-BR')}
        </p>

        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <button
            onClick={onToggle}
            disabled={isToggling}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              list.is_active
                ? 'text-muted-foreground border-border hover:bg-accent'
                : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-700/50 dark:hover:bg-emerald-900/20'
            }`}
          >
            {isToggling ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            {list.is_active ? 'Desativar' : 'Ativar'}
          </button>
          <button
            onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg btn-action text-xs font-medium transition-colors"
          >
            Abrir
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminTabelasPreco() {
  const queryClient = useQueryClient()

  // Panel / modal state
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [creatingList, setCreatingList] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '' })
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Panel edit state
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState({ name: '', description: '' })

  // Add item state
  const [addProductId, setAddProductId] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [productSearch, setProductSearch] = useState('')

  // Edit item state
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemPrice, setEditItemPrice] = useState('')

  // Remove item confirm
  const [removeItemId, setRemoveItemId] = useState<string | null>(null)

  // Archive / delete state
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Apply-by-category state
  const [applyCatId, setApplyCatId] = useState('')
  const [applyCatPrice, setApplyCatPrice] = useState('')

  // ── Queries ─────────────────────────────────────────────────────────

  const { data: priceLists = [], isLoading, error } = useQuery({
    queryKey: ['admin-price-lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_lists')
        .select('*')
        .order('name')
      if (error) throw error
      return data as PriceList[]
    },
    staleTime: 30 * 1000,
  })

  // Derived: selected list always reflects fresh data
  const currentList = selectedListId
    ? (priceLists.find(l => l.id === selectedListId) ?? null)
    : null

  const { data: priceListItems = [] } = useQuery({
    queryKey: ['admin-price-list-items', selectedListId],
    enabled: !!selectedListId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_list_items')
        .select('id, product_id, price, catalog_products(id, name, price, main_image)')
        .eq('price_list_id', selectedListId!)
      if (error) throw error
      return (data ?? []) as PriceListItemDB[]
    },
    staleTime: 30 * 1000,
  })

  const { data: linkedPartners = [] } = useQuery({
    queryKey: ['admin-price-list-partners', selectedListId],
    enabled: !!selectedListId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_profiles')
      if (error) throw error
      return ((data as any[]) ?? [])
        .filter(p => p.price_list_id === selectedListId)
        .map(p => ({
          id: p.id,
          full_name: p.full_name as string | null,
          phone: p.phone as string | null,
          customer_segment: p.customer_segment as string | null,
        })) as LinkedPartner[]
    },
    staleTime: 30 * 1000,
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ['admin-products-for-price-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('id, name, price, main_image, is_active')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as SimpleProduct[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories-for-price-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Derived ─────────────────────────────────────────────────────────

  const addedProductIds = useMemo(
    () => new Set(priceListItems.map(i => i.product_id)),
    [priceListItems],
  )

  const availableProducts = useMemo(
    () => allProducts.filter(p => !addedProductIds.has(p.id)),
    [allProducts, addedProductIds],
  )

  const filteredAvailableProducts = useMemo(() => {
    if (!productSearch) return availableProducts
    const q = productSearch.toLowerCase()
    return availableProducts.filter(p => p.name.toLowerCase().includes(q))
  }, [availableProducts, productSearch])

  const activeCount = priceLists.filter(l => l.is_active).length
  const activeLists = priceLists.filter(l => !l.archived_at)
  const archivedLists = priceLists.filter(l => !!l.archived_at)

  // ── Mutations ────────────────────────────────────────────────────────

  const createListMutation = useMutation({
    mutationFn: async (form: { name: string; description: string }) => {
      const { error } = await supabase.from('price_lists').insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tabela criada')
      queryClient.invalidateQueries({ queryKey: ['admin-price-lists'] })
      setCreatingList(false)
      setCreateForm({ name: '', description: '' })
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao criar tabela'),
  })

  const updateListMutation = useMutation({
    mutationFn: async (updates: Partial<PriceList> & { id: string }) => {
      const { id, ...rest } = updates
      const { error } = await supabase
        .from('price_lists')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-price-lists'] })
      setEditingInfo(false)
      setTogglingId(null)
    },
    onError: (err: any) => {
      setTogglingId(null)
      toast.error(err.message || 'Erro ao atualizar')
    },
  })

  const upsertItemMutation = useMutation({
    mutationFn: async ({
      productId,
      price,
      priceListId,
    }: {
      productId: string
      price: number
      priceListId: string
    }) => {
      const { error } = await supabase.from('price_list_items').upsert(
        {
          price_list_id: priceListId,
          product_id: productId,
          price,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'price_list_id,product_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Preço salvo')
      queryClient.invalidateQueries({ queryKey: ['admin-price-list-items', selectedListId] })
      setAddProductId('')
      setAddPrice('')
      setProductSearch('')
      setEditingItemId(null)
      setEditItemPrice('')
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao salvar preço'),
  })

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('price_list_items')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Item removido')
      queryClient.invalidateQueries({ queryKey: ['admin-price-list-items', selectedListId] })
      setRemoveItemId(null)
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao remover'),
  })

  const applyCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, price, priceListId }: { categoryId: string; price: number; priceListId: string }) => {
      // Fetch all active products in the selected category
      const { data: products, error: fetchError } = await supabase
        .from('catalog_products')
        .select('id')
        .eq('category_id', categoryId)
        .eq('is_active', true)
      if (fetchError) throw fetchError
      if (!products || products.length === 0) throw new Error('Nenhum produto ativo nessa categoria.')

      // Batch upsert
      const rows = products.map(p => ({
        price_list_id: priceListId,
        product_id: p.id,
        price,
        updated_at: new Date().toISOString(),
      }))
      const { error: upsertError } = await supabase
        .from('price_list_items')
        .upsert(rows, { onConflict: 'price_list_id,product_id' })
      if (upsertError) throw upsertError
      return products.length
    },
    onSuccess: (count) => {
      toast.success(`Preço aplicado em ${count} produto${count !== 1 ? 's' : ''}`)
      queryClient.invalidateQueries({ queryKey: ['admin-price-list-items', selectedListId] })
      setApplyCatId('')
      setApplyCatPrice('')
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao aplicar por categoria'),
  })

  const archiveListMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('price_lists')
        .update({ archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tabela arquivada')
      queryClient.invalidateQueries({ queryKey: ['admin-price-lists'] })
      setArchiveConfirmId(null)
      closePanel()
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao arquivar'),
  })

  const restoreListMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('price_lists')
        .update({ archived_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tabela restaurada')
      queryClient.invalidateQueries({ queryKey: ['admin-price-lists'] })
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao restaurar'),
  })

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('price_lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tabela excluída permanentemente')
      queryClient.invalidateQueries({ queryKey: ['admin-price-lists'] })
      setDeleteConfirmId(null)
      closePanel()
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao excluir'),
  })

  // ── Handlers ──────────────────────────────────────────────���──────────

  function handleApplyCategory() {
    if (!currentList || !applyCatId) return
    const price = parseFloat(applyCatPrice.replace(',', '.'))
    if (isNaN(price) || price < 0) { toast.error('Preço inválido'); return }
    applyCategoryMutation.mutate({ categoryId: applyCatId, price, priceListId: currentList.id })
  }

  function openPanel(list: PriceList) {
    setSelectedListId(list.id)
    setEditingInfo(false)
    setAddProductId('')
    setAddPrice('')
    setProductSearch('')
    setEditingItemId(null)
    setRemoveItemId(null)
    setApplyCatId('')
    setApplyCatPrice('')
  }

  function closePanel() {
    setSelectedListId(null)
    setEditingInfo(false)
  }

  function startEditInfo(list: PriceList) {
    setInfoForm({ name: list.name, description: list.description ?? '' })
    setEditingInfo(true)
  }

  function handleSaveInfo() {
    if (!currentList || !infoForm.name.trim()) return
    updateListMutation.mutate({
      id: currentList.id,
      name: infoForm.name.trim(),
      description: infoForm.description.trim() || null,
    })
    toast.success('Tabela atualizada')
  }

  function handleToggleActive(list: PriceList) {
    setTogglingId(list.id)
    updateListMutation.mutate({ id: list.id, is_active: !list.is_active })
  }

  function handleAddItem() {
    if (!currentList || !addProductId) return
    const price = parseFloat(addPrice.replace(',', '.'))
    if (isNaN(price) || price < 0) { toast.error('Preço inválido'); return }
    upsertItemMutation.mutate({ productId: addProductId, price, priceListId: currentList.id })
  }

  function handleSaveEditItem(item: PriceListItemDB) {
    if (!currentList) return
    const price = parseFloat(editItemPrice.replace(',', '.'))
    if (isNaN(price) || price < 0) { toast.error('Preço inválido'); return }
    upsertItemMutation.mutate({ productId: item.product_id, price, priceListId: currentList.id })
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/* ── Header ── */}
      <div className="bg-card border-b border-border sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Tabelas de Preço</h1>
            {!isLoading && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {activeCount} {activeCount === 1 ? 'tabela ativa' : 'tabelas ativas'} ·{' '}
                {priceLists.length} no total
              </p>
            )}
          </div>
          <button
            onClick={() => setCreatingList(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Tabela</span>
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
            <p className="font-semibold text-sm">Erro ao carregar tabelas</p>
            <p className="text-xs mt-0.5">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground font-medium">Carregando tabelas...</p>
          </div>
        ) : priceLists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-card rounded-2xl border border-dashed border-border">
            <BadgeDollarSign className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-bold text-foreground">Nenhuma tabela de preço</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-6 text-center max-w-xs">
              Crie uma tabela para atribuir preços especiais a parceiros.
            </p>
            <button
              onClick={() => setCreatingList(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg btn-action text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Tabela
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Ativas */}
            {activeLists.length === 0 && archivedLists.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-card rounded-2xl border border-dashed border-border">
                <BadgeDollarSign className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhuma tabela ativa.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeLists.map(list => (
                  <PriceListCard
                    key={list.id}
                    list={list}
                    onOpen={() => openPanel(list)}
                    onToggle={() => handleToggleActive(list)}
                    isToggling={togglingId === list.id && updateListMutation.isPending}
                  />
                ))}
              </div>
            )}

            {/* Arquivadas */}
            {archivedLists.length > 0 && (
              <div>
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  {showArchived ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Archive className="w-3.5 h-3.5" />
                  Arquivadas ({archivedLists.length})
                </button>
                {showArchived && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                    {archivedLists.map(list => (
                      <div key={list.id} className="relative">
                        <PriceListCard
                          list={list}
                          onOpen={() => openPanel(list)}
                          onToggle={() => {}}
                          isToggling={false}
                        />
                        <div className="absolute top-2 right-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                            Arquivada
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Panel ── */}
      {currentList && (
        <>
          <div
            className="fixed inset-0 bg-zinc-900/40 z-40 backdrop-blur-sm transition-opacity"
            onClick={closePanel}
          />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-card z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Panel Header */}
            <div className="border-b border-border px-5 py-4 flex items-start gap-3.5 flex-shrink-0">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <BadgeDollarSign className="w-6 h-6 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-foreground truncate">{currentList.name}</h2>
                  <span
                    className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset ${
                      currentList.is_active
                        ? 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40'
                        : 'bg-muted text-muted-foreground ring-border'
                    }`}
                  >
                    {currentList.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                {currentList.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{currentList.description}</p>
                )}
              </div>
              <button
                onClick={closePanel}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel Body (scrollable) */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Section: Configuração ── */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Configuração
                  </h3>
                  <div className="flex items-center gap-2">
                    {!editingInfo ? (
                      <button
                        onClick={() => startEditInfo(currentList)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-foreground/70 hover:bg-accent border border-border transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditingInfo(false)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancelar
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(currentList)}
                      disabled={updateListMutation.isPending}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        currentList.is_active
                          ? 'text-red-600 border-red-200 hover:bg-red-50 dark:border-red-700/40 dark:hover:bg-red-900/20'
                          : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-700/50 dark:hover:bg-emerald-900/20'
                      }`}
                    >
                      {updateListMutation.isPending && togglingId === currentList.id ? (
                        <Loader className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Power className="w-3.5 h-3.5" />
                      )}
                      {currentList.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>

                {editingInfo ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">Nome *</label>
                      <input
                        type="text"
                        value={infoForm.name}
                        onChange={e => setInfoForm(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">Descrição</label>
                      <input
                        type="text"
                        value={infoForm.description}
                        onChange={e => setInfoForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <button
                      onClick={handleSaveInfo}
                      disabled={!infoForm.name.trim() || updateListMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Salvar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-foreground">{currentList.name}</span>
                    </div>
                    {currentList.description && (
                      <p className="text-[11px] text-muted-foreground pl-5">{currentList.description}</p>
                    )}
                    {!currentList.is_active && (
                      <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-200 dark:ring-amber-700/30 rounded-lg px-3 py-2">
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Lista inativa — parceiros vinculados recebem preço padrão do catálogo.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section: Itens de Preço ── */}
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5">
                  Itens de Preço ({priceListItems.length})
                </h3>

                {priceListItems.length === 0 ? (
                  <div className="bg-muted rounded-xl border border-dashed border-border p-5 text-center mb-4">
                    <Package className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">Nenhum preço especial configurado.</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Todos os produtos usam preço padrão do catálogo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 mb-4">
                    {priceListItems.map(item => {
                      const product = getItemProduct(item)
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2.5 bg-background rounded-xl border border-border p-2.5 group"
                        >
                          {product?.main_image ? (
                            <img
                              src={product.main_image}
                              alt=""
                              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-foreground truncate">
                              {product?.name ?? '—'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Padrão: R$ {fmt(product?.price ?? 0)}
                            </p>
                          </div>

                          {editingItemId === item.id ? (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <input
                                type="text"
                                value={editItemPrice}
                                onChange={e => setEditItemPrice(e.target.value)}
                                className="w-24 px-2 py-1 text-sm text-right border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                                placeholder="0,00"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveEditItem(item)
                                  if (e.key === 'Escape') { setEditingItemId(null); setEditItemPrice('') }
                                }}
                              />
                              <button
                                onClick={() => handleSaveEditItem(item)}
                                disabled={upsertItemMutation.isPending}
                                className="p-1.5 rounded-lg btn-action transition-colors"
                              >
                                {upsertItemMutation.isPending ? (
                                  <Loader className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => { setEditingItemId(null); setEditItemPrice('') }}
                                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-sm font-bold text-foreground font-mono">
                                R$ {fmt(item.price)}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingItemId(item.id)
                                  setEditItemPrice(String(item.price).replace('.', ','))
                                }}
                                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                                title="Editar preço"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setRemoveItemId(item.id)}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                                title="Remover"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add Item Form */}
                <div className="bg-muted rounded-xl border border-border p-3.5">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                    Adicionar produto
                  </p>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Filtrar produtos..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <select
                    value={addProductId}
                    onChange={e => {
                      setAddProductId(e.target.value)
                      const prod = allProducts.find(p => p.id === e.target.value)
                      if (prod) setAddPrice(String(prod.price).replace('.', ','))
                      else setAddPrice('')
                    }}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                  >
                    <option value="">Selecionar produto...</option>
                    {filteredAvailableProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — R$ {fmt(p.price)}
                      </option>
                    ))}
                  </select>

                  {availableProducts.length === 0 && allProducts.length > 0 && (
                    <p className="text-[11px] text-muted-foreground text-center mb-2">
                      Todos os produtos ativos já estão nesta lista.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        R$
                      </span>
                      <input
                        type="text"
                        value={addPrice}
                        onChange={e => setAddPrice(e.target.value)}
                        placeholder="0,00"
                        onKeyDown={e => { if (e.key === 'Enter') handleAddItem() }}
                        className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                      />
                    </div>
                    <button
                      onClick={handleAddItem}
                      disabled={!addProductId || !addPrice || upsertItemMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg btn-action text-sm font-medium disabled:opacity-40 transition-colors"
                    >
                      {upsertItemMutation.isPending ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Adicionar
                    </button>
                  </div>
                </div>

                {/* Apply by category */}
                <div className="bg-muted rounded-xl border border-border p-3.5 mt-3">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      Aplicar por categoria
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Define o mesmo preço para todos os produtos ativos de uma categoria de uma vez.
                  </p>
                  <select
                    value={applyCatId}
                    onChange={e => setApplyCatId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                  >
                    <option value="">Selecionar categoria...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        R$
                      </span>
                      <input
                        type="text"
                        value={applyCatPrice}
                        onChange={e => setApplyCatPrice(e.target.value)}
                        placeholder="0,00"
                        onKeyDown={e => { if (e.key === 'Enter') handleApplyCategory() }}
                        className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                      />
                    </div>
                    <button
                      onClick={handleApplyCategory}
                      disabled={!applyCatId || !applyCatPrice || applyCategoryMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg btn-action text-sm font-medium disabled:opacity-40 transition-colors"
                    >
                      {applyCategoryMutation.isPending ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Section: Parceiros Vinculados ── */}
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5">
                  Parceiros vinculados ({linkedPartners.length})
                </h3>

                {linkedPartners.length === 0 ? (
                  <div className="bg-muted rounded-xl border border-dashed border-border p-5 text-center">
                    <Users className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">Nenhum parceiro usa esta tabela.</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      Para vincular, acesse{' '}
                      <a href="/admin/clientes" className="text-foreground underline underline-offset-2">
                        Clientes
                      </a>{' '}
                      e selecione a tabela na ficha do parceiro.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkedPartners.map(partner => (
                      <div
                        key={partner.id}
                        className="flex items-center gap-3 bg-muted rounded-xl border border-border px-3.5 py-2.5"
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted-foreground/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-foreground">
                          {(partner.full_name ?? 'A').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">
                            {partner.full_name ?? '—'}
                          </p>
                          {partner.phone && (
                            <p className="text-[11px] text-muted-foreground">{partner.phone}</p>
                          )}
                        </div>
                        {partner.customer_segment && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset flex-shrink-0 ${
                              partner.customer_segment === 'network_partner'
                                ? 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-700/40'
                                : 'bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:ring-teal-700/40'
                            }`}
                          >
                            {partner.customer_segment === 'network_partner' ? 'Parceiro' : 'Atacado'}
                          </span>
                        )}
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                      Vincule mais parceiros em{' '}
                      <a href="/admin/clientes" className="text-foreground underline underline-offset-2">
                        Clientes
                      </a>
                      .
                    </p>
                  </div>
                )}
              </div>
              {/* ── Section: Ações ── */}
              <div className="px-5 py-4">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  Ações
                </h3>
                <div className="space-y-2">
                  {currentList.archived_at ? (
                    <button
                      onClick={() => restoreListMutation.mutate(currentList.id)}
                      disabled={restoreListMutation.isPending}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-60"
                    >
                      {restoreListMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
                      Restaurar tabela
                    </button>
                  ) : (
                    <button
                      onClick={() => setArchiveConfirmId(currentList.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors"
                    >
                      <Archive className="w-4 h-4" />
                      Arquivar tabela
                    </button>
                  )}
                  {linkedPartners.length === 0 && (
                    <button
                      onClick={() => setDeleteConfirmId(currentList.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir permanentemente
                    </button>
                  )}
                  {linkedPartners.length > 0 && (
                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                      Desvincule os {linkedPartners.length} parceiro{linkedPartners.length > 1 ? 's' : ''} para habilitar a exclusão permanente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Create Modal ── */}
      {creatingList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => { setCreatingList(false); setCreateForm({ name: '', description: '' }) }}
          />
          <div className="relative bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md border border-border">
            <h2 className="text-xl font-bold text-foreground mb-4">Nova Tabela de Preço</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: Atacado Nível 1"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && createForm.name.trim()) createListMutation.mutate(createForm)
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Descrição</label>
                <input
                  type="text"
                  value={createForm.description}
                  onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => createListMutation.mutate(createForm)}
                disabled={!createForm.name.trim() || createListMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-50 transition-colors"
              >
                {createListMutation.isPending ? 'Criando...' : 'Criar Tabela'}
              </button>
              <button
                onClick={() => { setCreatingList(false); setCreateForm({ name: '', description: '' }) }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Item Confirmation ── */}
      {removeItemId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setRemoveItemId(null)}
          />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-2">Remover preço especial?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              O produto voltará a usar o preço padrão do catálogo para parceiros desta tabela.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => removeItemMutation.mutate(removeItemId)}
                disabled={removeItemMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-70 transition-colors"
              >
                {removeItemMutation.isPending ? 'Removendo...' : 'Remover'}
              </button>
              <button
                onClick={() => setRemoveItemId(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Confirmation ── */}
      {archiveConfirmId && (() => {
        const list = priceLists.find(l => l.id === archiveConfirmId)
        const partners = list && selectedListId === archiveConfirmId ? linkedPartners : []
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setArchiveConfirmId(null)} />
            <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                <Archive className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2 text-center">Arquivar tabela?</h2>
              {partners.length > 0 ? (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2.5 mb-5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    <strong>{partners.length} parceiro{partners.length > 1 ? 's' : ''}</strong> perderão os preços especiais e passarão a ver o preço de catálogo.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-5 text-center">
                  A tabela ficará inativa e invisível. Você pode restaurá-la a qualquer momento.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => archiveListMutation.mutate(archiveConfirmId)}
                  disabled={archiveListMutation.isPending}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-70 transition-colors"
                >
                  {archiveListMutation.isPending ? 'Arquivando...' : 'Arquivar'}
                </button>
                <button
                  onClick={() => setArchiveConfirmId(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Delete Confirmation ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2 text-center">Excluir permanentemente?</h2>
            <p className="text-sm text-muted-foreground mb-5 text-center">
              Todos os preços configurados serão apagados. Esta ação <strong>não pode ser desfeita</strong>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteListMutation.mutate(deleteConfirmId)}
                disabled={deleteListMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-70 transition-colors"
              >
                {deleteListMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
