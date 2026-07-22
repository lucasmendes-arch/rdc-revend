import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  CONTRACT_TYPE_LABELS, resolveAutoContractType, REQUIRED_CONTRACT_DATA_FIELDS,
  CONTRACT_DATA_FIELD_LABELS, type ContractDataField,
} from '@/lib/dpConstants'
import type { Processo, ContractRow, ContractPersonalData } from '@/lib/dpTypes'

const EMPTY_DATA_FORM = {
  cpf: '', rg: '', birth_date: '', marital_status: '', nationality: 'brasileira',
  address: '', email: '', bank_name: '', bank_agency: '', bank_account: '', pix_key: '',
}

function formatDateBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

interface GerarContratoModalProps {
  processo: Processo
  onClose: () => void
}

export default function GerarContratoModal({ processo, onClose }: GerarContratoModalProps) {
  const queryClient = useQueryClient()
  const [dataForm, setDataForm] = useState(EMPTY_DATA_FORM)
  const [termStart, setTermStart] = useState('')
  const [termEnd, setTermEnd] = useState('')

  const contractType = resolveAutoContractType(processo.employment_type, processo.current_stage)
  const requiredFields = contractType ? REQUIRED_CONTRACT_DATA_FIELDS[contractType] : []
  const isRequired = (field: ContractDataField) => requiredFields.includes(field)
  function fieldLabel(field: ContractDataField) {
    return (
      <label className="block text-[11px] text-muted-foreground mb-1">
        {CONTRACT_DATA_FIELD_LABELS[field]}{isRequired(field) && <span className="text-red-500"> *</span>}
      </label>
    )
  }

  const { data: personalData } = useQuery<ContractPersonalData | null>({
    queryKey: ['dp-contract-data', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contract_data')
        .select('*')
        .eq('process_id', processo.id)
        .maybeSingle()
      if (error) throw error
      return data as ContractPersonalData | null
    },
  })

  // Checa contra o que já está salvo (personalData), não contra o rascunho —
  // "Gerar Contrato" usa o que está no banco, não o que ainda não foi salvo.
  const missingFields = requiredFields.filter((f) => !personalData?.[f])

  useEffect(() => {
    if (personalData) {
      setDataForm({
        cpf: personalData.cpf ?? '',
        rg: personalData.rg ?? '',
        birth_date: personalData.birth_date ?? '',
        marital_status: personalData.marital_status ?? '',
        nationality: personalData.nationality ?? 'brasileira',
        address: personalData.address ?? '',
        email: personalData.email ?? '',
        bank_name: personalData.bank_name ?? '',
        bank_agency: personalData.bank_agency ?? '',
        bank_account: personalData.bank_account ?? '',
        pix_key: personalData.pix_key ?? '',
      })
    }
  }, [personalData])

  const { data: contractRows = [] } = useQuery<ContractRow[]>({
    queryKey: ['dp-contracts', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contracts')
        .select('id, contract_type, signature_date, term_start, term_end, file_url')
        .eq('process_id', processo.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ContractRow[]
    },
  })

  const saveData = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('employee_contract_data').upsert({
        process_id: processo.id,
        cpf: dataForm.cpf || null,
        rg: dataForm.rg || null,
        birth_date: dataForm.birth_date || null,
        marital_status: dataForm.marital_status || null,
        nationality: dataForm.nationality || 'brasileira',
        address: dataForm.address || null,
        email: dataForm.email || null,
        bank_name: dataForm.bank_name || null,
        bank_agency: dataForm.bank_agency || null,
        bank_account: dataForm.bank_account || null,
        pix_key: dataForm.pix_key || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-contract-data', processo.id] })
      toast.success('Dados salvos')
    },
    onError: (err) => toast.error(`Erro ao salvar dados: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const generateContract = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-contract', {
        body: { process_id: processo.id, term_start: termStart || null, term_end: termEnd || null },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-contracts', processo.id] })
      toast.success('Contrato gerado com sucesso')
    },
    onError: (err) => toast.error(`Erro ao gerar contrato: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{processo.candidates?.name}</h2>
            <p className="text-xs text-muted-foreground truncate">{processo.role_title} · {processo.stores?.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {contractRows.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Contratos gerados</p>
            {contractRows.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm bg-surface-alt rounded-lg p-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{CONTRACT_TYPE_LABELS[c.contract_type]}</p>
                  <p className="text-[11px] text-muted-foreground">Vigência: {formatDateBR(c.term_start)} — {formatDateBR(c.term_end)}</p>
                </div>
                {c.file_url && (
                  <a
                    href={c.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-accent hover:underline shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5" /> Abrir contrato
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Dados para contrato</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {fieldLabel('cpf')}
              <input type="text" value={dataForm.cpf} onChange={(e) => setDataForm({ ...dataForm, cpf: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('rg')}
              <input type="text" value={dataForm.rg} onChange={(e) => setDataForm({ ...dataForm, rg: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('birth_date')}
              <input type="date" value={dataForm.birth_date} onChange={(e) => setDataForm({ ...dataForm, birth_date: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('marital_status')}
              <input type="text" value={dataForm.marital_status} onChange={(e) => setDataForm({ ...dataForm, marital_status: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('nationality')}
              <input type="text" value={dataForm.nationality} onChange={(e) => setDataForm({ ...dataForm, nationality: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="col-span-2">
              {fieldLabel('address')}
              <input type="text" value={dataForm.address} onChange={(e) => setDataForm({ ...dataForm, address: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="col-span-2">
              {fieldLabel('email')}
              <input type="email" value={dataForm.email} onChange={(e) => setDataForm({ ...dataForm, email: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('bank_name')}
              <input type="text" value={dataForm.bank_name} onChange={(e) => setDataForm({ ...dataForm, bank_name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('bank_agency')}
              <input type="text" value={dataForm.bank_agency} onChange={(e) => setDataForm({ ...dataForm, bank_agency: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('bank_account')}
              <input type="text" value={dataForm.bank_account} onChange={(e) => setDataForm({ ...dataForm, bank_account: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              {fieldLabel('pix_key')}
              <input type="text" value={dataForm.pix_key} onChange={(e) => setDataForm({ ...dataForm, pix_key: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <button
            onClick={() => saveData.mutate()}
            disabled={saveData.isPending}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt disabled:opacity-70"
          >
            {saveData.isPending ? 'Salvando...' : 'Salvar dados'}
          </button>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Gerar contrato</p>
          {contractType ? (
            <p className="text-sm text-foreground">
              Tipo: <span className="font-medium">{CONTRACT_TYPE_LABELS[contractType]}</span>
            </p>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Este vínculo (CLT) ainda não tem template de contrato configurado — geração automática indisponível.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Início vigência</label>
              <input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Fim vigência</label>
              <input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          {contractType && missingFields.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Faltam dados obrigatórios pra este tipo de contrato: {missingFields.map((f) => CONTRACT_DATA_FIELD_LABELS[f]).join(', ')}.
            </p>
          )}
          <button
            onClick={() => generateContract.mutate()}
            disabled={!contractType || missingFields.length > 0 || generateContract.isPending}
            title={missingFields.length > 0 ? 'Preencha e salve os dados obrigatórios antes de gerar' : undefined}
            className="w-full px-3 py-2 rounded-lg btn-action text-sm font-medium disabled:opacity-50"
          >
            {generateContract.isPending ? 'Gerando...' : 'Gerar Contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}
