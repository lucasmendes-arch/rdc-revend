import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { Loader, RefreshCw } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

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

export default function AdminEstoque() {
  const queryClient = useQueryClient()
  const [sheetId, setSheetId] = useState(() => localStorage.getItem('rdc_google_sheet_id') || '')

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

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!sheetId) throw new Error('Informe o ID da planilha Google Sheets')

      localStorage.setItem('rdc_google_sheet_id', sheetId)
      return callEdgeFunction('sync-google-sheets', { sheetId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      alert('Estoque sincronizado com sucesso!')
    },
    onError: (err) => {
      alert(`Erro: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    },
  })

  const getStockStatus = (qty: number, min: number) => {
    if (qty === 0) return { label: 'Sem estoque', color: 'bg-red-100 text-red-700' }
    if (qty <= min) return { label: 'Estoque baixo', color: 'bg-yellow-100 text-yellow-700' }
    return { label: 'OK', color: 'bg-green-100 text-green-700' }
  }

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Estoque</h1>
            <p className="text-sm text-muted-foreground mt-1">Controle de estoque sincronizado com Google Sheets</p>
          </div>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg btn-gold text-white text-sm disabled:opacity-70"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8">
        {/* Sheet ID Input */}
        <div className="mb-6 bg-white rounded-xl border border-border p-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            ID da Planilha Google Sheets
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="Cole o ID da planilha (ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms)"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            A planilha deve ter as colunas: nome_produto, sku, quantidade, quantidade_minima
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando estoque...</p>
          </div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Nenhum item no estoque.</p>
            <p className="text-sm text-muted-foreground mt-2">Configure o ID da planilha e clique em Sincronizar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Produto</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">SKU</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Quantidade</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Mínimo</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, index) => {
                    const status = getStockStatus(item.quantity, item.min_quantity)
                    return (
                      <tr key={item.id} className={index % 2 === 0 ? '' : 'bg-surface-alt/50'}>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-3 items-center">
                            {item.catalog_products?.main_image && (
                              <img
                                src={item.catalog_products.main_image}
                                alt={item.catalog_products.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            )}
                            <span className="font-medium text-foreground truncate">
                              {item.catalog_products?.name || 'Produto removido'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{item.sku || '-'}</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-foreground">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-center text-muted-foreground">{item.min_quantity}</td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
