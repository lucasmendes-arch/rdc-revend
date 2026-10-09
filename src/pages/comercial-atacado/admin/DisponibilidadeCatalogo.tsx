import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, Minus, Plus, Package, Boxes, LayoutGrid, Warehouse, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, AdminSection, PageTabs, Toolbar, SearchInput, Panel, StatCard, StatGrid, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import StockPivotTable from '@/components/estoque/StockPivotTable'
import { useMyStore } from '@/hooks/useMyStore'

interface InventoryItem {
  id: string
  product_id: string
  sku: string | null
  quantity: number
  min_quantity: number
  last_synced_at: string
  catalog_products: {
    name: string
    main_image: string | null
  }
}

interface ProductWithoutStock {
  id: string
  name: string
  main_image: string | null
}

function QuantityCell({ item, onSave }: { item: InventoryItem; onSave: (id: string, qty: number) => void }) {
  const [qty, setQty] = useState(item.quantity)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setQty(item.quantity)
    setDirty(false)
  }, [item.quantity])

  const save = useCallback((newQty: number) => {
    const val = Math.max(0, newQty)
    setQty(val)
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSave(item.id, val)
      setDirty(false)
    }, 800)
  }, [item.id, onSave])

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => save(qty - 1)}
        disabled={qty === 0}
        aria-label="Diminuir"
        className="w-8 h-8 rounded-md border border-border bg-card text-ink-600 hover:bg-danger-subtle hover:border-danger-border hover:text-danger flex items-center justify-center disabled:opacity-30 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => save(parseInt(e.target.value) || 0)}
        className={`w-16 h-8 rounded-md border text-center font-semibold text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${dirty ? 'border-warning-border bg-warning-subtle' : 'border-border bg-card'}`}
      />
      <button
        onClick={() => save(qty + 1)}
        aria-label="Aumentar"
        className="w-8 h-8 rounded-md border border-border bg-card text-ink-600 hover:bg-success-subtle hover:border-success-border hover:text-success flex items-center justify-center transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {dirty && (
        <div className="w-4 h-4 ml-0.5">
          <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function EditableCell({ value, onSave, type = 'text', placeholder = '', className = '' }: {
  value: string | number
  onSave: (val: string | number) => void
  type?: 'text' | 'number'
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setLocalVal(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    const final = type === 'number' ? Math.max(0, parseInt(String(localVal)) || 0) : localVal
    if (final !== value) onSave(final)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`px-2 py-1 rounded-sm hover:bg-muted transition-colors cursor-text ${className}`}
        title="Clique para editar"
      >
        {value || <span className="text-muted-foreground">{placeholder || '-'}</span>}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={localVal}
      onChange={(e) => setLocalVal(type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalVal(value); setEditing(false) } }}
      className="w-20 h-8 px-2 rounded-md border border-brand bg-card text-[13px] text-center font-medium focus:outline-none focus:ring-2 focus:ring-ring"
      min={type === 'number' ? 0 : undefined}
    />
  )
}

type Tab = 'checkout' | 'linhares' | 'todas'

export default function AdminEstoque() {
  const queryClient = useQueryClient()
  const { allStores } = useMyStore()
  const [tab, setTab] = useState<Tab>('checkout')
  const [searchTerm, setSearchTerm] = useState('')

  const linhares = allStores.find((s) => s.type === 'central')

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, catalog_products(name, main_image)')
        .order('quantity', { ascending: true })

      if (error) throw error
      return (data || []) as InventoryItem[]
    },
    staleTime: 60 * 1000,
  })

  const { data: productsWithoutStock = [] } = useQuery({
    queryKey: ['products-without-stock'],
    queryFn: async () => {
      const { data: allProducts, error: pErr } = await supabase
        .from('catalog_products')
        .select('id, name, main_image')
        .eq('is_active', true)
        .order('name')

      if (pErr) throw pErr

      const { data: inv } = await supabase
        .from('inventory')
        .select('product_id')

      const withStock = new Set((inv || []).map((i: { product_id: string }) => i.product_id))
      return (allProducts || []).filter((p: ProductWithoutStock) => !withStock.has(p.id)) as ProductWithoutStock[]
    },
    staleTime: 60 * 1000,
  })

  const updateField = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | number }) => {
      const { error } = await supabase
        .from('inventory')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const createMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('inventory')
        .insert({
          product_id: productId,
          quantity: 0,
          min_quantity: 5,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['products-without-stock'] })
    },
    onError: (err) => {
      toast.error(`Erro ao criar estoque: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const handleQuantitySave = useCallback((id: string, qty: number) => {
    updateField.mutate({ id, field: 'quantity', value: qty })
  }, [updateField])

  const getStockStatus = (qty: number, min: number) => {
    if (qty === 0) return { label: 'Sem estoque', tone: 'danger' as const }
    if (qty <= min) return { label: 'Baixo', tone: 'warning' as const }
    return { label: 'OK', tone: 'success' as const }
  }

  const filteredInventory = inventory.filter((item) =>
    !searchTerm || item.catalog_products?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredProductsWithoutStock = productsWithoutStock.filter((p) =>
    !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const lowStockCount = inventory.filter(i => i.quantity > 0 && i.quantity <= i.min_quantity).length
  const outOfStockCount = inventory.filter(i => i.quantity === 0).length

  const tabDescription =
    tab === 'checkout'
      ? 'Estoque usado no checkout — vem da contagem física confirmada de Linhares (CD)'
      : tab === 'linhares'
      ? 'Tudo que foi contado em Linhares, incluindo itens que não são vendidos no B2B (ex.: material de limpeza)'
      : 'Consulta operacional — soma o estoque de todas as unidades, não é o número usado no checkout'

  return (
    <AdminLayout>
      <AdminPage
        title="Disponibilidade"
        description={tabDescription}
        tabs={
          <PageTabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'checkout', label: 'Checkout', icon: Package },
              { key: 'linhares', label: 'Linhares (CD)', icon: Warehouse },
              { key: 'todas', label: 'Todas as unidades', icon: LayoutGrid },
            ]}
          />
        }
        toolbar={tab === 'checkout' ? (
          <Toolbar>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Buscar por nome ou SKU…"
            />
          </Toolbar>
        ) : undefined}
      >
        {tab === 'todas' ? (
          <StockPivotTable />
        ) : tab === 'linhares' ? (
          linhares ? (
            <StockPivotTable storeId={linhares.id} />
          ) : (
            <PageLoading label="Carregando loja central…" />
          )
        ) : (
          <div className="space-y-6">
            <div className="bg-info-subtle rounded-lg border border-info-border px-4 py-3 flex items-start gap-2.5">
              <Boxes className="w-4 h-4 text-info mt-0.5 shrink-0" />
              <p className="text-[13px] text-info">
                Quantidade atualizada automaticamente sempre que uma contagem de Linhares é confirmada em <strong className="font-semibold">/estoque/contagem</strong>. Editar aqui é um ajuste pontual (ex.: avaria) — a próxima contagem confirmada sobrescreve o valor.
              </p>
            </div>

            <StatGrid className="grid-cols-3 lg:grid-cols-3">
              <StatCard label="Itens" value={inventory.length} />
              <StatCard label="Estoque baixo" value={lowStockCount} icon={AlertTriangle} tone="warning" />
              <StatCard label="Sem estoque" value={outOfStockCount} icon={XCircle} tone="danger" />
            </StatGrid>

            {isLoading ? (
              <PageLoading label="Carregando estoque…" />
            ) : (
              <>
                {filteredInventory.length > 0 && (
                  <Panel flush className="overflow-hidden">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-center">SKU</TableHead>
                          <TableHead className="text-center">Quantidade</TableHead>
                          <TableHead className="text-center">Mínimo</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.map((item) => {
                          const status = getStockStatus(item.quantity, item.min_quantity)
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="flex gap-3 items-center">
                                  {item.catalog_products?.main_image ? (
                                    <img
                                      src={item.catalog_products.main_image}
                                      alt={item.catalog_products.name}
                                      className="w-10 h-10 rounded-md object-cover border border-border flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-md bg-surface border border-border flex items-center justify-center flex-shrink-0">
                                      <Package className="w-4 h-4 text-ink-400" />
                                    </div>
                                  )}
                                  <span className="font-medium text-foreground truncate max-w-[240px]">
                                    {item.catalog_products?.name || 'Produto removido'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <EditableCell
                                  value={item.sku || ''}
                                  placeholder="—"
                                  onSave={(val) => updateField.mutate({ id: item.id, field: 'sku', value: val })}
                                  className="text-muted-foreground font-mono text-[12px]"
                                />
                              </TableCell>
                              <TableCell>
                                <QuantityCell item={item} onSave={handleQuantitySave} />
                              </TableCell>
                              <TableCell className="text-center">
                                <EditableCell
                                  value={item.min_quantity}
                                  type="number"
                                  onSave={(val) => updateField.mutate({ id: item.id, field: 'min_quantity', value: val })}
                                  className="text-muted-foreground tabular-nums"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={status.tone} dot>{status.label}</Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </Panel>
                )}

                {filteredProductsWithoutStock.length > 0 && (
                  <AdminSection title="Produtos sem estoque cadastrado">
                    <Panel flush className="overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProductsWithoutStock.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell>
                                <div className="flex gap-3 items-center min-w-0">
                                  {product.main_image ? (
                                    <img
                                      src={product.main_image}
                                      alt={product.name}
                                      className="w-10 h-10 rounded-md object-cover border border-border flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-md bg-surface border border-border flex items-center justify-center flex-shrink-0">
                                      <Package className="w-4 h-4 text-ink-400" />
                                    </div>
                                  )}
                                  <span className="font-medium text-foreground">{product.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => createMutation.mutate(product.id)}
                                  disabled={createMutation.isPending}
                                >
                                  <Plus />
                                  Cadastrar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Panel>
                  </AdminSection>
                )}

                {filteredInventory.length === 0 && filteredProductsWithoutStock.length === 0 && (
                  <Panel>
                    <EmptyState
                      icon={Package}
                      title="Nenhum item encontrado"
                      description={searchTerm ? 'Tente outro nome ou SKU.' : undefined}
                    />
                  </Panel>
                )}
              </>
            )}
          </div>
        )}
      </AdminPage>
    </AdminLayout>
  )
}
