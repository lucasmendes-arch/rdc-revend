import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, FileSignature } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { DateField } from '@/components/ui/date-field'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
      <label className="field-label">
        {CONTRACT_DATA_FIELD_LABELS[field]}
        {optional ? null : <span className="text-danger"> *</span>}
      </label>
    )
  }

  // z-50 (não z-[60]): os dropdowns/calendários do StyledSelect e do
  // DateField são portados pro <body> com z-50 — num modal z-[60] eles
  // abriam POR TRÁS do modal. Abre por cima do card de detalhe (também z-50)
  // por vir depois no DOM.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dp-distrato-title">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-in fade-in-0" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-popover p-5 shadow-xl animate-in fade-in-0 zoom-in-[0.98] duration-150">
        <div className="pr-8">
          <h2 id="dp-distrato-title" className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
            Encerrar vínculo de {processo.candidates?.name}
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            O distrato do contrato de parceria é gerado ao confirmar, e o parceiro sai da lista de ativos. O registro é mantido, não é apagado.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={busy} aria-label="Fechar" className="absolute right-3 top-3">
          <X />
        </Button>

        <div className="mt-5 rounded-lg border border-border bg-surface p-4 space-y-4">
          <div>
            <label className="field-label">Modelo base do distrato</label>
            {templatesError ? (
              <p className="text-[12px] text-danger">
                Não foi possível carregar os modelos: {templatesError instanceof Error ? templatesError.message : 'erro desconhecido'}
              </p>
            ) : (
              <StyledSelect
                value={templateId}
                onChange={setTemplateId}
                options={(templates?.templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
                placeholder={loadingTemplates ? 'Carregando modelos…' : 'Selecionar'}
                disabled={loadingTemplates || busy}
              />
            )}
            <p className="text-[12px] text-muted-foreground mt-1.5">
              Os modelos são os documentos da pasta de distratos no Drive. Para adicionar outro, basta colocá-lo lá.
            </p>
          </div>

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">
                  Data do distrato <span className="text-danger">*</span>
                </label>
                <DateField value={termStart || null} onChange={(v) => setTermStart(v ?? '')} placeholder="Selecionar" />
              </div>
              <div>
                <label className="field-label">
                  Data do contrato de parceria <span className="text-danger">*</span>
                </label>
                <DateField value={contractDate || null} onChange={(v) => setContractDate(v ?? '')} placeholder="Selecionar" />
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground mt-1.5">
              {!dateFilled
                ? 'Buscando a data do contrato de parceria…'
                : parceria
                  ? 'A data do contrato veio do contrato de parceria gerado aqui. Corrija se o assinado for outro.'
                  : 'Sem contrato de parceria gerado no sistema: a data sugerida é a da efetivação. Confira antes de gerar.'}
            </p>
          </div>
        </div>

        <h3 className="mt-5 mb-3 text-[14px] font-semibold text-foreground">Dados do parceiro</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            {label('cpf')}
            <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) })}
              inputMode="numeric" placeholder="Somente números" />
          </div>
          <div>
            {label('cnpj')}
            <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })}
              inputMode="numeric" placeholder="Somente números" />
          </div>
          <div className="sm:col-span-2">
            {label('legal_name', true)}
            <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              placeholder={meiLegalName(form.cnpj, processo.candidates?.name ?? '')} />
          </div>
          <div className="sm:col-span-2">
            {label('address')}
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rua, número, bairro, cidade" />
          </div>
        </div>

        {missingFields.length > 0 && (
          <p className="mt-3 text-[12px] text-warning">
            Faltam: {missingFields.map((f) => CONTRACT_DATA_FIELD_LABELS[f]).join(', ')}.
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => encerrarSemGerar.mutate()}
            disabled={busy}
            title="Encerra o vínculo sem gerar o distrato"
          >
            Só encerrar
          </Button>
          <Button
            variant="destructive"
            onClick={() => confirmar.mutate()}
            disabled={busy || missingFields.length > 0 || !termStart || !contractDate || !templateId}
            title={missingFields.length > 0 ? 'Preencha os dados obrigatórios' : undefined}
          >
            <FileSignature />
            {confirmar.isPending ? 'Gerando distrato…' : 'Encerrar e gerar distrato'}
          </Button>
        </div>
      </div>
    </div>
  )
}
