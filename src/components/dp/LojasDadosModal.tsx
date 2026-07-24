import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'

interface StoreLegalData {
  id: string
  name: string
  legal_name: string | null
  cnpj: string | null
  legal_address: string | null
}

function StoreRow({ store }: { store: StoreLegalData }) {
  const queryClient = useQueryClient()
  const [legalName, setLegalName] = useState(store.legal_name ?? '')
  const [cnpj, setCnpj] = useState(store.cnpj ?? '')
  const [address, setAddress] = useState(store.legal_address ?? '')

  useEffect(() => {
    setLegalName(store.legal_name ?? '')
    setCnpj(store.cnpj ?? '')
    setAddress(store.legal_address ?? '')
  }, [store.legal_name, store.cnpj, store.legal_address])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('stores')
        .update({ legal_name: legalName || null, cnpj: cnpj || null, legal_address: address || null })
        .eq('id', store.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-stores-legal-data'] })
      toast.success(`Dados de ${store.name} salvos`)
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <p className="text-sm font-semibold text-foreground">{store.name}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Razão social</label>
          <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">CNPJ</label>
          <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-muted-foreground mb-1">Endereço</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-alt disabled:opacity-70"
      >
        {save.isPending ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  )
}

// Razão social/CNPJ/endereço por loja — placeholders {{razao_social}}/
// {{cnpj}}/{{endereco}} nos contratos gerados automaticamente (DP). Muda
// por unidade (confirmado com o usuário), sem tela de admin dedicada até
// agora — só usado aqui, na página de geração de contrato.
export default function LojasDadosModal({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose)

  const { data: stores = [], isLoading } = useQuery<StoreLegalData[]>({
    queryKey: ['dp-stores-legal-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, legal_name, cnpj, legal_address')
        .order('name')
      if (error) throw error
      return (data || []) as StoreLegalData[]
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Dados das lojas</h2>
            <p className="text-xs text-muted-foreground">Razão social, CNPJ e endereço — usados nos contratos gerados automaticamente.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : (
          <div className="space-y-3">
            {stores.map((s) => <StoreRow key={s.id} store={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}
