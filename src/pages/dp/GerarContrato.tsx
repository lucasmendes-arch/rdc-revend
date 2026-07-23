import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader, Search, FileSignature, Store as StoreIcon, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import StyledSelect from '@/components/ui/styled-select'
import GerarContratoModal from '@/components/dp/GerarContratoModal'
import LojasDadosModal from '@/components/dp/LojasDadosModal'
import { EMPLOYMENT_TYPE_LABELS, resolveAutoContractType, CONTRACT_TYPE_LABELS } from '@/lib/dpConstants'
import type { Processo } from '@/lib/dpTypes'

interface Store { id: string; name: string }

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function AvatarBubble({ name, photoUrl }: { name: string; photoUrl: string | null | undefined }) {
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-surface-alt border border-border flex items-center justify-center">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground">{initials(name)}</span>
      )}
    </div>
  )
}

// Página dedicada de geração automática de contratos — reaproveita a API do
// Google Docs/Drive (mesmo template usado hoje na automação externa do Make),
// preenchendo com os dados já existentes do processo + os dados pessoais
// cadastrados na aba "Dados para contrato" do modal.
export default function DpGerarContrato() {
  const [search, setSearch] = useState('')
  const [storeId, setStoreId] = useState('')
  const [selected, setSelected] = useState<Processo | null>(null)
  const [lojasOpen, setLojasOpen] = useState(false)

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['dp-stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as Store[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: processos = [], isLoading } = useQuery<Processo[]>({
    queryKey: ['dp-contratos-processos', storeId],
    queryFn: async () => {
      let query = supabase
        .from('employee_processes')
        .select('id, candidate_id, employment_type, store_id, role_title, current_stage, status, started_at, activated_at, onboarding_completed, training_applicable, training_completed, created_at, candidates(id, name, whatsapp, photo_url, assignee_id), stores(name)')
        .in('status', ['em_andamento', 'ativo'])
        .order('started_at', { ascending: false })
      if (storeId) query = query.eq('store_id', storeId)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Processo[]
    },
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return processos
    return processos.filter((p) => p.candidates?.name?.toLowerCase().includes(term))
  }, [processos, search])

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Gerar Contrato</h1>
            <p className="text-sm text-muted-foreground mt-1">Geração automática dos contratos de formação e prestação de serviço</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setLojasOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt transition-colors"
              title="Razão social, CNPJ e endereço por unidade"
            >
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Dados das lojas</span>
            </button>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome..."
                className="pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <StyledSelect
              variant="inline"
              icon={<StoreIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
              value={storeId}
              onChange={setStoreId}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              emptyLabel="Todas as unidades"
              placeholder="Todas as unidades"
            />
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando processos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileSignature className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhum processo encontrado.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Cargo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden sm:table-cell">Unidade</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden md:table-cell">Vínculo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground hidden lg:table-cell">Contrato sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, index) => {
                    const suggestedType = resolveAutoContractType(p.employment_type, p.current_stage)
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={`border-b border-border/40 last:border-0 cursor-pointer hover:bg-surface-alt transition-colors ${index % 2 === 0 ? '' : 'bg-muted/30'}`}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          <div className="flex items-center gap-2.5">
                            <AvatarBubble name={p.candidates?.name || '?'} photoUrl={p.candidates?.photo_url} />
                            {p.candidates?.name || 'Candidato removido'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.role_title}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{p.stores?.name || '—'}</td>
                        <td className="px-4 py-3 text-sm hidden md:table-cell">
                          <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 text-xs font-medium">
                            {EMPLOYMENT_TYPE_LABELS[p.employment_type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                          {suggestedType ? CONTRACT_TYPE_LABELS[suggestedType] : '—'}
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

      {selected && <GerarContratoModal processo={selected} onClose={() => setSelected(null)} />}
      {lojasOpen && <LojasDadosModal onClose={() => setLojasOpen(false)} />}
    </AdminLayout>
  )
}
