import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, FileSignature } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { DateField } from '@/components/ui/date-field'
import StyledSelect from '@/components/ui/styled-select'
import {
  REQUIRED_CONTRACT_DATA_FIELDS, CONTRACT_DATA_FIELD_LABELS, meiLegalName,
  type ContractDataField,
} from '@/lib/dpConstants'
import type { Processo, ContractPersonalData } from '@/lib/dpTypes'

interface TemplateOption { id: string; name: string }

const REQUIRED = REQUIRED_CONTRACT_DATA_FIELDS.distrato

const todayISO = () => new Date().toISOString().slice(0, 10)

interface DistratarParceiroModalProps {
  processo: Processo
  // Move o processo pra 'encerrado'. Roda DEPOIS da geração, ao contrário do
  // ContratarParceiroModal: processo encerrado sai de /admin/dp/contratos, que
  // é o caminho de retry — gerar antes mantém o retry disponível se algo falhar.
  onConfirmEncerrar: () => Promise<void> | void
  onClose: () => void
}

// Popup de encerramento do profissional parceiro (MEI) — espelha o
// ContratarParceiroModal: confirma os dados que vão no documento, deixa
// escolher o modelo base e gera o Distrato do Contrato de Parceria antes de
// tirar a pessoa da lista de parceiros ativos.
export default function DistratarParceiroModal({ processo, onConfirmEncerrar, onClose }: DistratarParceiroModalProps) {
  useEscapeToClose(onClose)
  const queryClient = useQueryClient()

  const [form, setForm] = useState({ cpf: '', cnpj: '', legal_name: '', address: '' })
  const [termStart, setTermStart] = useState(todayISO())
  const [contractDate, setContractDate] = useState('')
  const [templateId, setTemplateId] = useState('')

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

  useEffect(() => {
    if (personalData) {
      setForm({
        cpf: personalData.cpf ?? '',
        cnpj: personalData.cnpj ?? '',
        legal_name: personalData.legal_name ?? '',
        address: personalData.address ?? '',
      })
    }
  }, [personalData])

  // Data do contrato que está sendo desfeito ({{data_contrato}}, cláusula
  // 1.1): a assinatura do contrato de parceria gerado aqui, ou a data de
  // efetivação quando o parceiro foi cadastrado de forma retroativa. Mesma
  // precedência da edge function — aqui só pra mostrar (e deixar corrigir).
  const { data: parceria } = useQuery<string | null>({
    queryKey: ['dp-parceria-term-start', processo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contracts')
        .select('term_start')
        .eq('process_id', processo.id)
        .eq('contract_type', 'prestacao_servico')
        .maybeSingle()
      if (error) throw error
      return (data?.term_start as string | undefined) ?? null
    },
  })

  // Só o preenchimento inicial — limpar o campo pra digitar outra data não
  // pode fazer a sugestão voltar por cima.
  const [dateFilled, setDateFilled] = useState(false)
  useEffect(() => {
    if (dateFilled || parceria === undefined) return
    const fallback = processo.activated_at ? processo.activated_at.slice(0, 10) : ''
    setContractDate(parceria ?? fallback)
    setDateFilled(true)
  }, [parceria, processo.activated_at, dateFilled])

  // Modelos base = Google Docs da pasta de distratos no Drive. Adicionar um
  // modelo é jogar um doc lá; não há cadastro no sistema.
  const { data: templates, isLoading: loadingTemplates, error: templatesError } = useQuery<{ templates: TemplateOption[]; default_id: string }>({
    queryKey: ['contract-templates', 'distrato'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-contract-templates', {
        body: { contract_type: 'distrato' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (templates?.default_id && !templateId) setTemplateId(templates.default_id)
  }, [templates, templateId])

  const missingFields = REQUIRED.filter((f) => !form[f as keyof typeof form]?.trim())

  const confirmar = useMutation({
    mutationFn: async () => {
      const { error: saveErr } = await supabase.from('employee_contract_data').upsert({
        process_id: processo.id,
        cpf: form.cpf || null,
        cnpj: form.cnpj || null,
        legal_name: form.legal_name || null,
        address: form.address || null,
      })
      if (saveErr) throw saveErr

      const { data, error } = await supabase.functions.invoke('generate-contract', {
        body: {
          process_id: processo.id,
          contract_type: 'distrato',
          term_start: termStart,
          original_contract_date: contractDate || null,
          template_doc_id: templateId || null,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      // Encerra só depois que o documento existe — ver onConfirmEncerrar.
      await onConfirmEncerrar()
      return data as { google_doc_url: string | null }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dp-contracts', processo.id] })
      queryClient.invalidateQueries({ queryKey: ['dp-contract-data', processo.id] })
      toast.success('Distrato gerado e vínculo encerrado', {
        action: data.google_doc_url
          ? { label: 'Abrir', onClick: () => window.open(data.google_doc_url!, '_blank', 'noopener') }
          : undefined,
      })
      onClose()
    },
    // Falha na geração = nada foi encerrado (a mudança de etapa é o último
    // passo). A pessoa continua ativa e dá pra tentar de novo ou usar
    // "Só encerrar".
    onError: (err) => toast.error(`Erro ao gerar distrato: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const encerrarSemGerar = useMutation({
    mutationFn: async () => { await onConfirmEncerrar() },
    onSuccess: () => {
      toast.success('Vínculo encerrado — distrato não gerado')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao encerrar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const busy = confirmar.isPending || encerrarSemGerar.isPending

  function label(field: ContractDataField, optional?: boolean) {
    return (
      <label className="block text-[11px] text-muted-foreground mb-1">
        {CONTRACT_DATA_FIELD_LABELS[field]}
        {optional ? null : <span className="text-red-500"> *</span>}
      </label>
    )
  }

  const inputClass = 'w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-bold text-foreground">Encerrar vínculo de {processo.candidates?.name}</h2>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          O distrato do contrato de parceria é gerado ao confirmar, e o parceiro sai da lista de ativos. O registro é mantido, não é apagado.
        </p>

        <div className="rounded-xl border border-border bg-surface-alt p-3 space-y-3 mb-4">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Modelo base do distrato</label>
            {templatesError ? (
              <p className="text-[11px] text-red-500">
                Não foi possível carregar os modelos: {templatesError instanceof Error ? templatesError.message : 'erro desconhecido'}
              </p>
            ) : (
              <StyledSelect
                value={templateId}
                onChange={setTemplateId}
                options={(templates?.templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
                placeholder={loadingTemplates ? 'Carregando modelos...' : 'Selecionar'}
                disabled={loadingTemplates || busy}
              />
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Os modelos são os documentos da pasta de distratos no Drive — para adicionar outro, basta colocá-lo lá.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Data do distrato <span className="text-red-500">*</span>
              </label>
              <DateField value={termStart || null} onChange={(v) => setTermStart(v ?? '')} placeholder="Selecionar" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Data do contrato de parceria <span className="text-red-500">*</span>
              </label>
              <DateField value={contractDate || null} onChange={(v) => setContractDate(v ?? '')} placeholder="Selecionar" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            {!dateFilled
              ? 'Buscando a data do contrato de parceria...'
              : parceria
                ? 'A data do contrato veio do contrato de parceria gerado aqui — corrija se o assinado for outro.'
                : 'Sem contrato de parceria gerado no sistema: a data sugerida é a da efetivação. Confira antes de gerar.'}
          </p>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Dados do parceiro</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            {label('cpf')}
            <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) })}
              inputMode="numeric" placeholder="Somente números" className={inputClass} />
          </div>
          <div>
            {label('cnpj')}
            <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })}
              inputMode="numeric" placeholder="Somente números" className={inputClass} />
          </div>
          <div className="col-span-2">
            {label('legal_name', true)}
            <input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              placeholder={meiLegalName(form.cnpj, processo.candidates?.name ?? '')} className={inputClass} />
          </div>
          <div className="col-span-2">
            {label('address')}
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rua, número, bairro, cidade" className={inputClass} />
          </div>
        </div>

        {missingFields.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">
            Faltam: {missingFields.map((f) => CONTRACT_DATA_FIELD_LABELS[f]).join(', ')}.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => confirmar.mutate()}
            disabled={busy || missingFields.length > 0 || !termStart || !contractDate || !templateId}
            title={missingFields.length > 0 ? 'Preencha os dados obrigatórios' : undefined}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <FileSignature className="w-4 h-4" />
            {confirmar.isPending ? 'Gerando distrato...' : 'Encerrar e gerar distrato'}
          </button>
          <button
            onClick={() => encerrarSemGerar.mutate()}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Só encerrar
          </button>
        </div>
      </div>
    </div>
  )
}
