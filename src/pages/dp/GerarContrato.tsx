import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSignature, Store as StoreIcon, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { AdminPage, Toolbar, SearchInput, Panel, EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
        <img src={photoUrl} alt="" loading="lazy" decoding="async" width={32} height={32} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold text-muted-foreground">{initials(name)}</span>
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
        .select('id, candidate_id, employment_type, store_id, role_title, current_stage, status, started_at, activated_at, stage_started_at, due_date, onboarding_completed, training_applicable, training_completed, created_at, candidates(id, name, whatsapp, photo_url, assignee_id), stores(name)')
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
      <AdminPage
        title="Contratos"
        description="Geração automática dos contratos de formação e de profissional parceiro"
        actions={
          <Button
            variant="secondary"
            onClick={() => setLojasOpen(true)}
            title="Razão social, CNPJ, endereço, contato e representante legal por unidade"
            aria-label="Dados das lojas"
          >
            <Building2 />
            <span className="hidden sm:inline">Dados das lojas</span>
          </Button>
        }
        toolbar={
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome…" />
            <StyledSelect
              className="w-full sm:w-56"
              icon={<StoreIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
              value={storeId}
              onChange={setStoreId}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              emptyLabel="Todas as unidades"
              placeholder="Todas as unidades"
            />
          </Toolbar>
        }
      >
        {isLoading ? (
          <PageLoading label="Carregando processos…" />
        ) : filtered.length === 0 ? (
          <Panel>
            <EmptyState
              icon={FileSignature}
              title="Nenhum processo encontrado"
              description={
                search.trim()
                  ? 'Nenhum nome bate com a busca. Confira a grafia ou limpe o filtro.'
                  : 'Processos em andamento ou ativos aparecem aqui para gerar o contrato.'
              }
            />
          </Panel>
        ) : (
          <Panel flush className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Cargo</th>
                    <th className="hidden sm:table-cell">Unidade</th>
                    <th className="hidden md:table-cell">Vínculo</th>
                    <th className="hidden lg:table-cell">Contrato sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const suggestedType = resolveAutoContractType(p.employment_type, p.current_stage)
                    return (
                      <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer">
                        <td>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AvatarBubble name={p.candidates?.name || '?'} photoUrl={p.candidates?.photo_url} />
                            <span className="font-medium text-foreground truncate">{p.candidates?.name || 'Candidato removido'}</span>
                          </div>
                        </td>
                        <td className="text-muted-foreground">{p.role_title}</td>
                        <td className="text-muted-foreground hidden sm:table-cell">{p.stores?.name || '—'}</td>
                        <td className="hidden md:table-cell">
                          <Badge variant="neutral">{EMPLOYMENT_TYPE_LABELS[p.employment_type]}</Badge>
                        </td>
                        <td className="text-muted-foreground hidden lg:table-cell">
                          {suggestedType ? CONTRACT_TYPE_LABELS[suggestedType] : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </AdminPage>

      {selected && <GerarContratoModal processo={selected} onClose={() => setSelected(null)} />}
      {lojasOpen && <LojasDadosModal onClose={() => setLojasOpen(false)} />}
    </AdminLayout>
  )
}
