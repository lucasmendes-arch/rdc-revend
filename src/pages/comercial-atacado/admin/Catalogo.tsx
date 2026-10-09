import { useState, useRef } from 'react'
import { Edit2, Trash2, RefreshCw, ChevronLeft, ChevronRight, X, Plus, Upload, ImageIcon, GripVertical, ListOrdered } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminProducts, useUpdateProduct, useDeleteProduct, useCreateProduct, useBulkUpdateSortOrder, CatalogProduct } from '@/hooks/useAdminProducts'
import { useCategories } from '@/hooks/useCategories'
import { useImageUpload } from '@/hooks/useImageUpload'
import AdminLayout from '@/components/admin/AdminLayout'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import StyledSelect from '@/components/ui/styled-select'
import { AdminPage, Toolbar, SearchInput, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

function SortableProductRow({ product }: { product: CatalogProduct }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2.5 shadow-xs"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        aria-label="Arrastar"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {product.main_image ? (
        <img src={product.main_image} alt={product.name} className="w-8 h-8 rounded object-cover border border-border flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded bg-surface-alt border border-border flex-shrink-0" />
      )}
      <span className="text-[13.5px] font-medium text-foreground truncate flex-1">{product.name}</span>
      <span className="text-[12px] text-muted-foreground tabular-nums flex-shrink-0">R$ {product.price.toFixed(2)}</span>
    </div>
  )
}

const CATEGORY_TYPE_OPTIONS = [
  { value: 'alto_giro', label: 'Alto giro' },
  { value: 'maior_margem', label: 'Maior margem' },
  { value: 'recompra_alta', label: 'Recompra alta' },
]

export default function AdminCatalogo() {
  const { data: products = [], isLoading, error } = useAdminProducts()
  const updateMutation = useUpdateProduct()
  const deleteMutation = useDeleteProduct()
  const createMutation = useCreateProduct()
  const { data: categories = [] } = useCategories()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<CatalogProduct>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    price: 0,
    partner_price: 0,
    compare_at_price: null as number | null,
    main_image: '',
    is_active: true,
    category_type: null as string | null,
    is_professional: false,
    is_highlight: false,
    is_new_arrival: false,
    category_id: null as string | null,
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const { upload, uploading } = useImageUpload()
  const createFileRef = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)

  // Reorder state
  const [showReorderPicker, setShowReorderPicker] = useState(false)
  const [showReorder, setShowReorder] = useState(false)
  const [reorderCategoryId, setReorderCategoryId] = useState('')
  const [reorderItems, setReorderItems] = useState<CatalogProduct[]>([])
  const [reorderSaved, setReorderSaved] = useState(false)
  const bulkUpdateSortOrder = useBulkUpdateSortOrder()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const openReorder = (categoryId: string) => {
    const items = products
      .filter(p => p.category_id === categoryId && p.is_active)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    setReorderItems(items)
    setReorderCategoryId(categoryId)
    setReorderSaved(false)
    setShowReorder(true)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setReorderItems(prev => {
      const oldIndex = prev.findIndex(p => p.id === active.id)
      const newIndex = prev.findIndex(p => p.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
    setReorderSaved(false)
  }

  const handleSaveOrder = async () => {
    const updates = reorderItems.map((p, i) => ({ id: p.id, sort_order: i }))
    try {
      await bulkUpdateSortOrder.mutateAsync(updates)
      setReorderSaved(true)
    } catch (err) {
      toast.error(`Erro ao salvar ordem: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const itemsPerPage = 20
  const filteredProducts = products
    .filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (filterCategory && p.category_id !== filterCategory) return false
      if (filterStatus === 'active' && !p.is_active) return false
      if (filterStatus === 'paused' && p.is_active) return false
      return true
    })
    .sort((a, b) => {
      // Active products first, paused last
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const activeCount = products.filter(p => p.is_active).length
  const pausedCount = products.filter(p => !p.is_active).length
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const handleEdit = (product: CatalogProduct) => {
    setEditingId(product.id)
    setEditForm(product)
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        name: editForm.name,
        price: editForm.price,
        partner_price: editForm.partner_price,
        compare_at_price: editForm.compare_at_price,
        main_image: editForm.main_image,
        is_active: editForm.is_active,
        category_type: editForm.category_type,
        is_professional: editForm.is_professional,
        is_highlight: editForm.is_highlight,
        is_new_arrival: editForm.is_new_arrival,
        category_id: editForm.category_id,
      })
      setEditingId(null)
      setEditForm({})
    } catch (err) {
      toast.error(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleToggleActive = async (product: CatalogProduct) => {
    try {
      await updateMutation.mutateAsync({
        id: product.id,
        is_active: !product.is_active,
      })
    } catch (err) {
      toast.error(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleUpdateCategory = async (productId: string, newCategoryId: string) => {
    try {
      await updateMutation.mutateAsync({
        id: productId,
        category_id: newCategoryId || null,
      })
    } catch (err) {
      toast.error(`Erro ao atualizar categoria: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      setDeleteId(null)
    } catch (err) {
      toast.error(`Erro ao deletar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleCreate = async () => {
    if (!createForm.name || createForm.price <= 0) {
      toast.error('Nome e preço são obrigatórios')
      return
    }
    try {
      await createMutation.mutateAsync({
        name: createForm.name,
        price: createForm.price,
        partner_price: createForm.partner_price || 0,
        compare_at_price: createForm.compare_at_price,
        main_image: createForm.main_image || null,
        is_active: createForm.is_active,
        category_type: createForm.category_type as CatalogProduct['category_type'],
        is_professional: createForm.is_professional,
        is_highlight: createForm.is_highlight,
        is_new_arrival: createForm.is_new_arrival,
        category_id: createForm.category_id,
      })
      setCreating(false)
      setCreateForm({ name: '', price: 0, partner_price: 0, compare_at_price: null, main_image: '', is_active: true, category_type: null, is_professional: false, is_highlight: false, is_new_arrival: false, category_id: null })
    } catch (err) {
      toast.error(`Erro ao criar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const statusPills: { key: 'all' | 'active' | 'paused'; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: products.length },
    { key: 'active', label: 'Ativos', count: activeCount },
    { key: 'paused', label: 'Pausados', count: pausedCount },
  ]
  const hasFilters = !!(filterCategory || filterStatus !== 'all' || searchTerm)

  const closeEdit = () => { setEditingId(null); setEditForm({}) }

  return (
    <AdminLayout>
      <AdminPage
        title="Produtos"
        description="Catálogo de produtos do atacado"
        actions={
          <>
            <DropdownMenu open={showReorderPicker} onOpenChange={setShowReorderPicker}>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" aria-label="Reordenar produtos">
                  <ListOrdered />
                  <span className="hidden sm:inline">Reordenar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px] max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">Escolha a categoria</DropdownMenuLabel>
                {categories.map(c => (
                  <DropdownMenuItem key={c.id} onSelect={() => openReorder(c.id)}>
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setCreating(true)} aria-label="Novo produto">
              <Plus />
              <span className="hidden sm:inline">Novo produto</span>
            </Button>
          </>
        }
        toolbar={
          <Toolbar>
            <SearchInput
              value={searchTerm}
              onChange={(v) => { setSearchTerm(v); setCurrentPage(1) }}
              placeholder="Buscar produtos…"
            />
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {statusPills.map(p => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={filterStatus === p.key}
                  onClick={() => { setFilterStatus(p.key); setCurrentPage(1) }}
                  className={cn(
                    'h-8 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap transition-colors shrink-0',
                    filterStatus === p.key
                      ? 'bg-brand-subtle border-brand-border text-brand-strong'
                      : 'bg-card border-border text-ink-600 hover:border-ink-300 hover:text-foreground',
                  )}
                >
                  {p.label} <span className="tabular-nums opacity-70">{p.count}</span>
                </button>
              ))}
            </div>
            <StyledSelect
              variant="inline"
              value={filterCategory}
              onChange={(v) => { setFilterCategory(v); setCurrentPage(1) }}
              options={categories.map(c => ({ value: c.id, label: c.name }))}
              emptyLabel="Todas as categorias"
              placeholder="Todas as categorias"
              className="bg-card text-[13px]"
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchTerm(''); setFilterCategory(''); setFilterStatus('all'); setCurrentPage(1) }}
              >
                Limpar filtros
              </Button>
            )}
            <span className="text-[12px] text-muted-foreground tabular-nums sm:ml-auto">
              {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
            </span>
          </Toolbar>
        }
      >
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger">
            <p className="text-[13.5px] font-medium">Erro ao carregar produtos</p>
            <p className="text-[13px]">{error instanceof Error ? error.message : 'Desconhecido'}</p>
          </div>
        )}

        {isLoading ? (
          <PageLoading label="Carregando produtos…" />
        ) : filteredProducts.length === 0 ? (
          <Panel>
            <EmptyState
              icon={ImageIcon}
              title="Nenhum produto encontrado"
              description={hasFilters ? 'Ajuste a busca ou limpe os filtros.' : 'Cadastre o primeiro produto do catálogo.'}
              action={!hasFilters ? (
                <Button onClick={() => setCreating(true)}><Plus />Novo produto</Button>
              ) : undefined}
            />
          </Panel>
        ) : (
          <>
            <Panel flush className="overflow-hidden">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.main_image ? (
                            <img
                              src={product.main_image}
                              alt={product.name}
                              className="w-12 h-12 rounded-md object-cover border border-border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-surface border border-border flex items-center justify-center flex-shrink-0">
                              <ImageIcon className="w-4 h-4 text-ink-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-[13.5px] leading-snug">{product.name}</p>
                            {(product.source === 'manual' || product.nuvemshop_product_id) && (
                              <p className="text-[12px] text-muted-foreground">
                                {product.source === 'manual' ? 'Manual' : `NS: ${product.nuvemshop_product_id}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold text-foreground">R$ {product.price.toFixed(2)}</span>
                          {product.partner_price != null && product.partner_price > 0 && (
                            <span className="text-[12px] font-medium text-brand-strong">
                              Parceiro R$ {product.partner_price.toFixed(2)}
                            </span>
                          )}
                          {product.compare_at_price && (
                            <span className="text-[12px] text-muted-foreground line-through">
                              De R$ {product.compare_at_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StyledSelect
                          variant="xs"
                          value={product.category_id || ''}
                          onChange={(v) => handleUpdateCategory(product.id, v)}
                          options={categories.map(c => ({ value: c.id, label: c.name }))}
                          emptyLabel="Sem categoria"
                          placeholder="Sem categoria"
                          className="h-8 rounded-md text-[12.5px] max-w-[180px]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(product)}
                            title={product.is_active ? 'Clique para pausar' : 'Clique para ativar'}
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Badge variant={product.is_active ? 'success' : 'neutral'} dot className="cursor-pointer">
                              {product.is_active ? 'Ativo' : 'Pausado'}
                            </Badge>
                          </button>
                          {product.is_highlight && <Badge variant="brand">Destaque</Badge>}
                          {product.is_new_arrival && <Badge variant="info">Lançamento</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(product)} aria-label="Editar produto">
                            <Edit2 />
                            <span className="hidden sm:inline">Editar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(product.id)}
                            aria-label="Excluir produto"
                            className="text-danger hover:text-danger hover:bg-danger-subtle"
                          >
                            <Trash2 />
                            <span className="hidden sm:inline">Excluir</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Página anterior"
                >
                  <ChevronLeft />
                </Button>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Próxima página"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </>
        )}
      </AdminPage>

      {/* Reorder Modal */}
      <Dialog open={showReorder} onOpenChange={setShowReorder}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 py-4 border-b border-border text-left">
            <DialogTitle className="text-[16px]">Reordenar produtos</DialogTitle>
            <DialogDescription>
              {categories.find(c => c.id === reorderCategoryId)?.name} · Arraste para reorganizar
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {reorderItems.length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-8">Nenhum produto ativo nesta categoria.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={reorderItems.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {reorderItems.map(product => (
                      <SortableProductRow key={product.id} product={product} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            {reorderSaved && (
              <span className="text-[12px] text-success font-medium">Ordem salva</span>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => setShowReorder(false)}>Fechar</Button>
              <Button
                onClick={handleSaveOrder}
                disabled={bulkUpdateSortOrder.isPending || reorderItems.length === 0}
              >
                {bulkUpdateSortOrder.isPending ? 'Salvando…' : 'Salvar ordem'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Product Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Novo produto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="field-label">Nome *</label>
              <Input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Nome do produto"
              />
            </div>

            <div>
              <span className="field-label">Preços *</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-muted-foreground mb-1">Catálogo (atacado)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={createForm.price || ''}
                    onChange={(e) => setCreateForm({ ...createForm, price: parseFloat(e.target.value) || 0 })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-brand-strong mb-1">Parceiro</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={createForm.partner_price || ''}
                    onChange={(e) => setCreateForm({ ...createForm, partner_price: parseFloat(e.target.value) || 0 })}
                    className="tabular-nums border-brand-border bg-brand-subtle"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="field-label">Preço de comparação (opcional)</label>
              <Input
                type="number"
                step="0.01"
                value={createForm.compare_at_price || ''}
                onChange={(e) => setCreateForm({ ...createForm, compare_at_price: e.target.value ? parseFloat(e.target.value) : null })}
                className="tabular-nums"
              />
            </div>

            <div>
              <span className="field-label">Imagem principal</span>
              <div className="space-y-2">
                {createForm.main_image && (
                  <div className="relative w-24 h-24">
                    <img src={createForm.main_image} alt="Preview" className="w-24 h-24 rounded-xl object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, main_image: '' })}
                      aria-label="Remover imagem"
                      className="absolute -top-2 -right-2 w-5 h-5 bg-danger-solid text-white rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <input
                  ref={createFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      const url = await upload(file)
                      setCreateForm({ ...createForm, main_image: url })
                    } catch (err) {
                      toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'Desconhecido'}`)
                    }
                    e.target.value = ''
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => createFileRef.current?.click()} disabled={uploading}>
                  {uploading ? <><RefreshCw className="animate-spin" /> Enviando…</> : <><Upload /> Enviar imagem</>}
                </Button>
              </div>
            </div>

            <div className="space-y-2.5">
              {([
                ['is_active', 'Ativo'],
                ['is_professional', 'Uso profissional (lavatório)'],
                ['is_highlight', 'Destaque (Você precisa conhecer)'],
                ['is_new_arrival', 'Lançamento'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm[key]}
                    onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-[13.5px] text-foreground">{label}</span>
                </label>
              ))}
            </div>

            <div>
              <span className="field-label">Categoria</span>
              <StyledSelect
                value={createForm.category_id || ''}
                onChange={(v) => setCreateForm({ ...createForm, category_id: v || null })}
                options={categories.map(c => ({ value: c.id, label: c.name }))}
                emptyLabel="Sem categoria"
                placeholder="Sem categoria"
              />
            </div>

            <div>
              <span className="field-label">Classificação de destaque</span>
              <StyledSelect
                value={createForm.category_type || ''}
                onChange={(v) => setCreateForm({ ...createForm, category_type: v || null })}
                options={CATEGORY_TYPE_OPTIONS}
                emptyLabel="Sem classificação"
                placeholder="Sem classificação"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando…' : 'Criar produto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) closeEdit() }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Editar produto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="field-label">Nome</label>
              <Input
                type="text"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div>
              <span className="field-label">Preços</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-muted-foreground mb-1">Catálogo (atacado)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.price ?? 0}
                    onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-brand-strong mb-1">Parceiro</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.partner_price ?? 0}
                    onChange={(e) => setEditForm({ ...editForm, partner_price: parseFloat(e.target.value) })}
                    className="tabular-nums border-brand-border bg-brand-subtle"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="field-label">Preço de comparação (opcional)</label>
              <Input
                type="number"
                step="0.01"
                value={editForm.compare_at_price || ''}
                onChange={(e) => setEditForm({ ...editForm, compare_at_price: e.target.value ? parseFloat(e.target.value) : null })}
                className="tabular-nums"
              />
            </div>

            <div>
              <span className="field-label">Imagem principal</span>
              <div className="space-y-2">
                {editForm.main_image && (
                  <div className="relative w-24 h-24">
                    <img src={editForm.main_image} alt="Preview" className="w-24 h-24 rounded-xl object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, main_image: '' })}
                      aria-label="Remover imagem"
                      className="absolute -top-2 -right-2 w-5 h-5 bg-danger-solid text-white rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <input
                  ref={editFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      const url = await upload(file)
                      setEditForm({ ...editForm, main_image: url })
                    } catch (err) {
                      toast.error(`Erro no upload: ${err instanceof Error ? err.message : 'Desconhecido'}`)
                    }
                    e.target.value = ''
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => editFileRef.current?.click()} disabled={uploading}>
                  {uploading ? <><RefreshCw className="animate-spin" /> Enviando…</> : <><Upload /> Enviar imagem</>}
                </Button>
              </div>
            </div>

            <div className="space-y-2.5">
              {([
                ['is_active', 'Ativo'],
                ['is_professional', 'Uso profissional (lavatório)'],
                ['is_highlight', 'Destaque (Você precisa conhecer)'],
                ['is_new_arrival', 'Lançamento'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm[key] || false}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-[13.5px] text-foreground">{label}</span>
                </label>
              ))}
            </div>

            <div>
              <span className="field-label">Categoria</span>
              <StyledSelect
                value={editForm.category_id || ''}
                onChange={(v) => setEditForm({ ...editForm, category_id: v || null })}
                options={categories.map(c => ({ value: c.id, label: c.name }))}
                emptyLabel="Sem categoria"
                placeholder="Sem categoria"
              />
            </div>

            <div>
              <span className="field-label">Classificação de destaque</span>
              <StyledSelect
                value={editForm.category_type || ''}
                onChange={(v) => setEditForm({ ...editForm, category_type: (v || null) as CatalogProduct['category_type'] })}
                options={CATEGORY_TYPE_OPTIONS}
                emptyLabel="Sem classificação"
                placeholder="Sem classificação"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={closeEdit}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Excluir produto?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
