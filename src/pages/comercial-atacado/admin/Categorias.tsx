import { useState } from 'react'
import { Edit2, Trash2, Plus, ArrowUp, ArrowDown, FolderTree } from 'lucide-react'
import { toast } from 'sonner'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, Category } from '@/hooks/useCategories'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function AdminCategorias() {
  const { data: categories = [], isLoading, error } = useCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', slug: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', slug: '' })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const generateSlug = (name: string) =>
    name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const handleCreate = async () => {
    if (!createForm.name.trim()) return
    const slug = createForm.slug.trim() || generateSlug(createForm.name)
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0
    try {
      await createMutation.mutateAsync({ name: createForm.name.trim(), slug, sort_order: maxOrder + 1 })
      setCreating(false)
      setCreateForm({ name: '', slug: '' })
    } catch (err) {
      toast.error(`Erro ao criar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    }
  }

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditForm({ name: cat.name, slug: cat.slug })
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.name.trim()) return
    const slug = editForm.slug.trim() || generateSlug(editForm.name)
    try {
      await updateMutation.mutateAsync({ id: editingId, name: editForm.name.trim(), slug })
      setEditingId(null)
    } catch (err) {
      toast.error(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
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

  const handleReorder = async (cat: Category, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(c => c.id === cat.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const other = sorted[swapIdx]
    try {
      await updateMutation.mutateAsync({ id: cat.id, sort_order: other.sort_order })
      await updateMutation.mutateAsync({ id: other.id, sort_order: cat.sort_order })
    } catch (err) {
      console.error('Reorder error:', err)
      toast.error('Não foi possível reordenar. Tente de novo.')
    }
  }

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <AdminLayout>
      <AdminPage
        title="Categorias"
        description="Ordem e nomes das categorias do catálogo"
        width="default"
        actions={
          <Button onClick={() => setCreating(true)} aria-label="Nova categoria">
            <Plus />
            <span className="hidden sm:inline">Nova categoria</span>
          </Button>
        }
      >
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger">
            <p className="text-[13.5px] font-medium">Erro ao carregar categorias</p>
            <p className="text-[13px]">{error instanceof Error ? error.message : 'Desconhecido'}</p>
          </div>
        )}

        {isLoading ? (
          <PageLoading label="Carregando categorias…" />
        ) : categories.length === 0 ? (
          <Panel>
            <EmptyState
              icon={FolderTree}
              title="Nenhuma categoria cadastrada"
              description="Crie categorias para organizar os produtos do catálogo."
              action={<Button onClick={() => setCreating(true)}><Plus />Nova categoria</Button>}
            />
          </Panel>
        ) : (
          <Panel flush className="overflow-hidden">
            <Table className="min-w-[480px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28">Ordem</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((cat, index) => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="w-6 font-mono text-[12px] text-muted-foreground tabular-nums">{cat.sort_order}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() => handleReorder(cat, 'up')}
                          disabled={index === 0}
                          aria-label="Mover para cima"
                        >
                          <ArrowUp className="!size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() => handleReorder(cat, 'down')}
                          disabled={index === sorted.length - 1}
                          aria-label="Mover para baixo"
                        >
                          <ArrowDown className="!size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{cat.name}</TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{cat.slug}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)} aria-label="Editar categoria">
                          <Edit2 />
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(cat.id)}
                          aria-label="Excluir categoria"
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
        )}
      </AdminPage>

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Nova categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="field-label">Nome *</label>
              <Input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ name: e.target.value, slug: generateSlug(e.target.value) })}
                placeholder="Ex.: Condicionador"
              />
            </div>
            <div>
              <label className="field-label">Slug</label>
              <Input
                type="text"
                value={createForm.slug}
                onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                className="font-mono md:text-[13px]"
                placeholder="gerado-automaticamente"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando…' : 'Criar categoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) setEditingId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Editar categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="field-label">Nome</label>
              <Input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ name: e.target.value, slug: generateSlug(e.target.value) })}
              />
            </div>
            <div>
              <label className="field-label">Slug</label>
              <Input
                type="text"
                value={editForm.slug}
                onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                className="font-mono md:text-[13px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[16px]">Excluir categoria?</DialogTitle>
            <DialogDescription>
              Os produtos desta categoria ficarão sem categoria. Esta ação não pode ser desfeita.
            </DialogDescription>
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
