import { useState, useMemo } from 'react'
import { formatBRL } from '@/lib/format'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
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

// ── PriceListCard ─────────────────────────────────────────────────────────────

function PriceListCard({
  list,
  onOpen,
  onToggle,
  isToggling,
  archived,
}: {
  list: PriceList
  onOpen: () => void
  onToggle: () => void
  isToggling: boolean
  archived?: boolean
}) {
  return (
    <div className="bg-card rounded-lg border border-border shadow-xs hover:border-ink-300 transition-colors flex flex-col">
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight truncate">{list.name}</h3>
            {list.description && (
              <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">{list.description}</p>
            )}
          </div>
          <Badge variant={archived ? 'neutral' : list.is_active ? 'success' : 'neutral'} className="shrink-0">
            {archived ? 'Arquivada' : list.is_active ? 'Ativa' : 'Inativa'}
          </Badge>
        </div>

        <p className="text-[12px] text-muted-foreground mb-4">
          Criada em {new Date(list.created_at).toLocaleDateString('pt-BR')}
        </p>

        <div className="flex items-center gap-2 pt-3 mt-auto border-t border-border">
          {!archived && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onToggle}
              disabled={isToggling}
              className={list.is_active ? '' : 'text-success hover:text-success'}
            >
              {isToggling ? <Loader className="animate-spin" /> : <Power />}
              {list.is_active ? 'Desativar' : 'Ativar'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onOpen} className="flex-1">
            Abrir
            <ArrowRight />
          </Button>
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
    }, {
      // Só depois do retorno: antes o toast saía mesmo quando a gravação falhava.
      onSuccess: () => toast.success('Tabela atualizada'),
    })
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

  const sectionTitle = 'text-[14px] font-semibold text-foreground tracking-tight'
  const moneyInput = 'pl-9 font-mono tabular-nums'

  return (
    <AdminLayout>
      <AdminPage
        title="Tabelas de preço"
        description={
          isLoading
            ? 'Preços especiais por parceiro'
            : `${activeCount} ${activeCount === 1 ? 'tabela ativa' : 'tabelas ativas'} · ${priceLists.length} no total`
        }
        actions={
          <Button onClick={() => setCreatingList(true)} aria-label="Nova tabela">
            <Plus />
            <span className="hidden sm:inline">Nova tabela</span>
          </Button>
        }
      >
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger">
            <p className="font-semibold text-[14px]">Não foi possível carregar as tabelas</p>
            <p className="text-[13px] mt-0.5">{error instanceof Error ? error.message : 'Erro desconhecido'}. Recarregue a página para tentar de novo.</p>
          </div>
        )}

        {isLoading ? (
          <PageLoading label="Carregando tabelas…" />
        ) : priceLists.length === 0 ? (
          <Panel>
            <EmptyState
              icon={BadgeDollarSign}
              title="Nenhuma tabela de preço"
              description="Crie uma tabela para atribuir preços especiais a parceiros."
              action={
                <Button onClick={() => setCreatingList(true)}>
                  <Plus />
                  Nova tabela
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="space-y-6">
            {/* Ativas */}
            {activeLists.length === 0 && archivedLists.length > 0 ? (
              <Panel>
                <EmptyState
                  icon={BadgeDollarSign}
                  title="Nenhuma tabela ativa"
                  description="Todas as tabelas estão arquivadas. Restaure uma ou crie uma nova."
                  className="py-10"
                />
              </Panel>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArchived(v => !v)}
                  aria-expanded={showArchived}
                  className="-ml-2 mb-2 text-muted-foreground"
                >
                  {showArchived ? <ChevronDown /> : <ChevronRight />}
                  <Archive />
                  Arquivadas ({archivedLists.length})
                </Button>
                {showArchived && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 opacity-70">
                    {archivedLists.map(list => (
                      <PriceListCard
                        key={list.id}
                        list={list}
                        archived
                        onOpen={() => openPanel(list)}
                        onToggle={() => {}}
                        isToggling={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </AdminPage>

      {/* ── Detalhe da tabela ── */}
      <Sheet open={!!currentList} onOpenChange={(open) => { if (!open) closePanel() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 flex flex-col">
          {currentList && (
            <>
              {/* Cabeçalho */}
              <SheetHeader className="border-b border-border px-5 pr-12 py-4 shrink-0 space-y-1 text-left">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <SheetTitle className="truncate">{currentList.name}</SheetTitle>
                  <Badge variant={currentList.is_active ? 'success' : 'neutral'}>
                    {currentList.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>
                {currentList.description ? (
                  <SheetDescription className="truncate">{currentList.description}</SheetDescription>
                ) : (
                  <SheetDescription className="sr-only">Detalhes da tabela de preço</SheetDescription>
                )}
              </SheetHeader>

              {/* Corpo (rolável) */}
              <div className="flex-1 overflow-y-auto">

                {/* ── Configuração ── */}
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className={sectionTitle}>Configuração</h3>
                    <div className="flex items-center gap-1.5">
                      {!editingInfo ? (
                        <Button variant="secondary" size="xs" onClick={() => startEditInfo(currentList)}>
                          <Edit2 />
                          Editar
                        </Button>
                      ) : (
                        <Button variant="ghost" size="xs" onClick={() => setEditingInfo(false)}>
                          Cancelar
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => handleToggleActive(currentList)}
                        disabled={updateListMutation.isPending}
                        className={currentList.is_active ? 'text-danger hover:text-danger' : 'text-success hover:text-success'}
                      >
                        {updateListMutation.isPending && togglingId === currentList.id ? (
                          <Loader className="animate-spin" />
                        ) : (
                          <Power />
                        )}
                        {currentList.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </div>

                  {editingInfo ? (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="pl-name" className="field-label">Nome *</Label>
                        <Input
                          id="pl-name"
                          type="text"
                          value={infoForm.name}
                          onChange={e => setInfoForm(p => ({ ...p, name: e.target.value }))}
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label htmlFor="pl-desc" className="field-label">Descrição</Label>
                        <Input
                          id="pl-desc"
                          type="text"
                          value={infoForm.description}
                          onChange={e => setInfoForm(p => ({ ...p, description: e.target.value }))}
                          placeholder="Opcional"
                        />
                      </div>
                      <Button
                        onClick={handleSaveInfo}
                        disabled={!infoForm.name.trim() || updateListMutation.isPending}
                      >
                        <Check />
                        Salvar alterações
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[13.5px] font-medium text-foreground">{currentList.name}</span>
                      </div>
                      {currentList.description && (
                        <p className="text-[12px] text-muted-foreground pl-5">{currentList.description}</p>
                      )}
                      {!currentList.is_active && (
                        <div className="mt-2 bg-surface border border-border rounded-md px-3 py-2">
                          <p className="text-[12px] text-muted-foreground">
                            Tabela inativa: parceiros vinculados recebem o preço padrão do catálogo.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Itens de preço ── */}
                <div className="px-5 py-4 border-b border-border">
                  <h3 className={`${sectionTitle} mb-3`}>
                    Itens de preço <span className="text-muted-foreground font-normal tabular-nums">({priceListItems.length})</span>
                  </h3>

                  {priceListItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border mb-4">
                      <EmptyState
                        icon={Package}
                        title="Nenhum preço especial"
                        description="Todos os produtos usam o preço padrão do catálogo."
                        className="py-6"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border mb-4">
                      {priceListItems.map(item => {
                        const product = getItemProduct(item)
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2.5 p-2.5 group"
                          >
                            {product?.main_image ? (
                              <img
                                src={product.main_image}
                                alt=""
                                className="w-9 h-9 rounded-md object-cover shrink-0 border border-border"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-foreground truncate">
                                {product?.name ?? '—'}
                              </p>
                              <p className="text-[12px] text-muted-foreground tabular-nums">
                                Padrão: {formatBRL(product?.price ?? 0)}
                              </p>
                            </div>

                            {editingItemId === item.id ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={editItemPrice}
                                  onChange={e => setEditItemPrice(e.target.value)}
                                  className="w-24 h-8 text-right font-mono tabular-nums"
                                  placeholder="0,00"
                                  autoFocus
                                  aria-label="Novo preço"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEditItem(item)
                                    if (e.key === 'Escape') { setEditingItemId(null); setEditItemPrice('') }
                                  }}
                                />
                                <Button
                                  size="icon-sm"
                                  onClick={() => handleSaveEditItem(item)}
                                  disabled={upsertItemMutation.isPending}
                                  aria-label="Salvar preço"
                                >
                                  {upsertItemMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => { setEditingItemId(null); setEditItemPrice('') }}
                                  aria-label="Cancelar edição"
                                >
                                  <X />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <span className="text-[13.5px] font-semibold text-foreground tabular-nums mr-1">
                                  {formatBRL(item.price)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setEditingItemId(item.id)
                                    setEditItemPrice(String(item.price).replace('.', ','))
                                  }}
                                  className="lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100"
                                  title="Editar preço"
                                  aria-label="Editar preço"
                                >
                                  <Edit2 />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setRemoveItemId(item.id)}
                                  className="hover:text-danger hover:bg-danger-subtle lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100"
                                  title="Remover"
                                  aria-label="Remover preço especial"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Adicionar produto */}
                  <div className="bg-surface rounded-lg border border-border p-3.5 space-y-2">
                    <p className="text-[13px] font-medium text-foreground">Adicionar produto</p>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                      <Input
                        type="text"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        placeholder="Filtrar produtos…"
                        className="pl-8 bg-card"
                      />
                    </div>
                    <StyledSelect
                      value={addProductId}
                      onChange={(v) => {
                        setAddProductId(v)
                        const prod = allProducts.find(p => p.id === v)
                        if (prod) setAddPrice(String(prod.price).replace('.', ','))
                        else setAddPrice('')
                      }}
                      options={filteredAvailableProducts.map(p => ({ value: p.id, label: `${p.name} — ${formatBRL(p.price)}` }))}
                      emptyLabel="Selecionar produto…"
                      placeholder="Selecionar produto…"
                    />

                    {availableProducts.length === 0 && allProducts.length > 0 && (
                      <p className="text-[12px] text-muted-foreground text-center">
                        Todos os produtos ativos já estão nesta tabela.
                      </p>
                    )}

                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground pointer-events-none">
                          R$
                        </span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={addPrice}
                          onChange={e => setAddPrice(e.target.value)}
                          placeholder="0,00"
                          aria-label="Preço especial"
                          onKeyDown={e => { if (e.key === 'Enter') handleAddItem() }}
                          className={`${moneyInput} bg-card`}
                        />
                      </div>
                      <Button
                        onClick={handleAddItem}
                        disabled={!addProductId || !addPrice || upsertItemMutation.isPending}
                      >
                        {upsertItemMutation.isPending ? <Loader className="animate-spin" /> : <Plus />}
                        Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* Aplicar por categoria */}
                  <div className="bg-surface rounded-lg border border-border p-3.5 mt-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-[13px] font-medium text-foreground">Aplicar por categoria</p>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      Define o mesmo preço para todos os produtos ativos de uma categoria de uma vez.
                    </p>
                    <StyledSelect
                      value={applyCatId}
                      onChange={setApplyCatId}
                      options={categories.map(c => ({ value: c.id, label: c.name }))}
                      emptyLabel="Selecionar categoria…"
                      placeholder="Selecionar categoria…"
                    />
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground pointer-events-none">
                          R$
                        </span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={applyCatPrice}
                          onChange={e => setApplyCatPrice(e.target.value)}
                          placeholder="0,00"
                          aria-label="Preço para a categoria"
                          onKeyDown={e => { if (e.key === 'Enter') handleApplyCategory() }}
                          className={`${moneyInput} bg-card`}
                        />
                      </div>
                      <Button
                        variant="secondary"
                        onClick={handleApplyCategory}
                        disabled={!applyCatId || !applyCatPrice || applyCategoryMutation.isPending}
                      >
                        {applyCategoryMutation.isPending ? <Loader className="animate-spin" /> : <Check />}
                        Aplicar
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ── Parceiros vinculados ── */}
                <div className="px-5 py-4 border-b border-border">
                  <h3 className={`${sectionTitle} mb-3`}>
                    Parceiros vinculados <span className="text-muted-foreground font-normal tabular-nums">({linkedPartners.length})</span>
                  </h3>

                  {linkedPartners.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border">
                      <EmptyState
                        icon={Users}
                        title="Nenhum parceiro usa esta tabela"
                        description={
                          <>
                            Para vincular, acesse{' '}
                            <a href="/admin/clientes" className="text-foreground underline underline-offset-2">Clientes</a>{' '}
                            e selecione a tabela na ficha do parceiro.
                          </>
                        }
                        className="py-6"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-border divide-y divide-border">
                        {linkedPartners.map(partner => (
                          <div
                            key={partner.id}
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-[12px] font-semibold text-ink-600">
                              {(partner.full_name ?? 'A').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-foreground truncate">
                                {partner.full_name ?? '—'}
                              </p>
                              {partner.phone && (
                                <p className="text-[12px] text-muted-foreground">{partner.phone}</p>
                              )}
                            </div>
                            {partner.customer_segment && (
                              partner.customer_segment === 'network_partner' ? (
                                <Badge variant="brand" className="shrink-0">Parceiro</Badge>
                              ) : (
                                <Badge className="shrink-0 border-teal-200 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700/40">
                                  Atacado
                                </Badge>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[12px] text-muted-foreground text-center pt-1">
                        Vincule mais parceiros em{' '}
                        <a href="/admin/clientes" className="text-foreground underline underline-offset-2">
                          Clientes
                        </a>
                        .
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Ações ── */}
                <div className="px-5 py-4">
                  <h3 className={`${sectionTitle} mb-3`}>Ações</h3>
                  <div className="space-y-2">
                    {currentList.archived_at ? (
                      <Button
                        variant="secondary"
                        onClick={() => restoreListMutation.mutate(currentList.id)}
                        disabled={restoreListMutation.isPending}
                        className="w-full"
                      >
                        {restoreListMutation.isPending ? <Loader className="animate-spin" /> : <ArchiveRestore />}
                        Restaurar tabela
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setArchiveConfirmId(currentList.id)}
                        className="w-full"
                      >
                        <Archive />
                        Arquivar tabela
                      </Button>
                    )}
                    {linkedPartners.length === 0 && (
                      <Button
                        variant="secondary"
                        onClick={() => setDeleteConfirmId(currentList.id)}
                        className="w-full text-danger hover:text-danger hover:bg-danger-subtle"
                      >
                        <Trash2 />
                        Excluir permanentemente
                      </Button>
                    )}
                    {linkedPartners.length > 0 && (
                      <p className="text-[12px] text-muted-foreground text-center pt-1">
                        Desvincule os {linkedPartners.length} parceiro{linkedPartners.length > 1 ? 's' : ''} para habilitar a exclusão permanente.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Nova tabela ── */}
      <Dialog
        open={creatingList}
        onOpenChange={(open) => { if (!open) { setCreatingList(false); setCreateForm({ name: '', description: '' }) } }}
      >
        <DialogContent className="max-w-md w-[calc(100%-2rem)]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Nova tabela de preço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-pl-name" className="field-label">Nome *</Label>
              <Input
                id="new-pl-name"
                type="text"
                value={createForm.name}
                onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Atacado Nível 1"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && createForm.name.trim()) createListMutation.mutate(createForm)
                }}
              />
            </div>
            <div>
              <Label htmlFor="new-pl-desc" className="field-label">Descrição</Label>
              <Input
                id="new-pl-desc"
                type="text"
                value={createForm.description}
                onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => { setCreatingList(false); setCreateForm({ name: '', description: '' }) }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => createListMutation.mutate(createForm)}
              disabled={!createForm.name.trim() || createListMutation.isPending}
            >
              {createListMutation.isPending ? 'Criando…' : 'Criar tabela'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remover item ── */}
      <Dialog open={!!removeItemId} onOpenChange={(open) => { if (!open) setRemoveItemId(null) }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Remover preço especial?</DialogTitle>
            <DialogDescription>
              O produto volta a usar o preço padrão do catálogo para os parceiros desta tabela.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setRemoveItemId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeItemId && removeItemMutation.mutate(removeItemId)}
              disabled={removeItemMutation.isPending}
            >
              {removeItemMutation.isPending ? 'Removendo…' : 'Remover preço'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Arquivar ── */}
      <Dialog open={!!archiveConfirmId} onOpenChange={(open) => { if (!open) setArchiveConfirmId(null) }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          {archiveConfirmId && (() => {
            const list = priceLists.find(l => l.id === archiveConfirmId)
            const partners = list && selectedListId === archiveConfirmId ? linkedPartners : []
            return (
              <>
                <DialogHeader className="text-left">
                  <DialogTitle className="text-[16px]">Arquivar tabela?</DialogTitle>
                  {partners.length === 0 && (
                    <DialogDescription>
                      A tabela fica inativa e some da lista. Você pode restaurá-la a qualquer momento.
                    </DialogDescription>
                  )}
                </DialogHeader>
                {partners.length > 0 && (
                  <div className="flex items-start gap-2 bg-warning-subtle border border-warning-border rounded-md px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-[13px] text-warning">
                      <strong className="font-semibold">{partners.length} parceiro{partners.length > 1 ? 's' : ''}</strong> perderão os preços especiais e passarão a ver o preço de catálogo.
                    </p>
                  </div>
                )}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="secondary" onClick={() => setArchiveConfirmId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => archiveListMutation.mutate(archiveConfirmId)}
                    disabled={archiveListMutation.isPending}
                  >
                    {archiveListMutation.isPending ? 'Arquivando…' : 'Arquivar tabela'}
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Excluir ── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Excluir permanentemente?</DialogTitle>
            <DialogDescription>
              Todos os preços configurados serão apagados. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteListMutation.mutate(deleteConfirmId)}
              disabled={deleteListMutation.isPending}
            >
              {deleteListMutation.isPending ? 'Excluindo…' : 'Excluir tabela'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
