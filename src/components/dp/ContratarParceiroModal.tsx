import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, FileSignature } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { DateField } from '@/components/ui/date-field'
import StyledSelect from '@/components/ui/styled-select'
import NacionalidadeField from '@/components/dp/NacionalidadeField'
import {
  REQUIRED_CONTRACT_DATA_FIELDS, CONTRACT_DATA_FIELD_LABELS, MARITAL_STATUS_OPTIONS,
  toSelectOptions, meiLegalName, partnerTermEndISO, PARCERIA_TERM_MONTHS,
  type ContractDataField,
} from '@/lib/dpConstants'
import type { Processo, ContractPersonalData } from '@/lib/dpTypes'

interface TemplateOption { id: string; name: string }

const REQUIRED = REQUIRED_CONTRACT_DATA_FIELDS.prestacao_servico

function formatDateBR(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

interface ContratarParceiroModalProps {
  processo: Processo
  // Efetiva a mudança de etapa pra 'contratacao'. Roda ANTES da geração: a
  // edge function resolve o tipo de contrato pelo current_stage, então gerar
  // com o processo ainda em "Decisão (Formação)" produziria o contrato de
  // formação em vez do de parceria.
  onConfirmStage: () => Promise<void> | void
  onClose: () => void
}

// Popup de contratação do profissional parceiro — espelha o "Contratar" do
// RH (que gera o contrato de formação na confirmação): junta os dados
// obrigatórios, deixa escolher o modelo base e gera o contrato ao confirmar.
export default function ContratarParceiroModal({ processo, onConfirmStage, onClose }: ContratarParceiroModalProps) {
  useEscapeToClose(onClose)
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    cpf: '', cnpj: '', legal_name: '', nationality: '', marital_status: '', address: '', email: '',
  })
  const [termStart, setTermStart] = useState(new Date().toISOString().slice(0, 10))
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
        nationality: personalData.nationality ?? '',
        marital_status: personalData.marital_status ?? '',
        address: personalData.address ?? '',
        email: personalData.email ?? '',
      })
    }
  }, [personalData])

  // Percentuais da parceria: a vaga é a autoridade (snapshot da negociação
  // daquela unidade) e o cargo é o fallback — mesma precedência da edge
  // function. Só leitura aqui: mudam em /admin/rh/cargos ou na vaga.
  const { data: percentuais } = useQuery({
    queryKey: ['dp-partner-percentages', processo.candidate_id],
    queryFn: async () => {
      const { data: candidate } = await supabase
        .from('candidates')
        .select('job_opening_id')
        .eq('id', processo.candidate_id)
        .maybeSingle()
      if (!candidate?.job_opening_id) return { retention: null, product: null }
      const { data: job } = await supabase
        .from('job_openings')
        .select('partner_retention_percentage, product_commission_percentage, job_roles(partner_retention_percentage, product_commission_percentage)')
        .eq('id', candidate.job_opening_id)
        .maybeSingle()
      // O client tipa o embed como array (a FK é 1:1, mas o PostgREST não
      // promete isso pro TS) — normaliza antes de usar.
      const embedded = job?.job_roles as unknown
      const role = (Array.isArray(embedded) ? embedded[0] : embedded) as
        { partner_retention_percentage: number | null; product_commission_percentage: number | null } | null | undefined
      return {
        retention: job?.partner_retention_percentage ?? role?.partner_retention_percentage ?? null,
        product: job?.product_commission_percentage ?? role?.product_commission_percentage ?? null,
      }
    },
  })

  // Modelos base = Google Docs da pasta de templates no Drive. Adicionar um
  // modelo é jogar um doc lá; não há cadastro no sistema.
  const { data: templates, isLoading: loadingTemplates, error: templatesError } = useQuery<{ templates: TemplateOption[]; default_id: string }>({
    queryKey: ['contract-templates', 'prestacao_servico'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-contract-templates', {
        body: { contract_type: 'prestacao_servico' },
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
  const missingPercentages = !percentuais || percentuais.retention === null || percentuais.product === null

  const confirmar = useMutation({
    mutationFn: async () => {
      const { error: saveErr } = await supabase.from('employee_contract_data').upsert({
        process_id: processo.id,
        cpf: form.cpf || null,
        cnpj: form.cnpj || null,
        legal_name: form.legal_name || null,
        nationality: form.nationality || 'brasileiro(a)',
        marital_status: form.marital_status || null,
        address: form.address || null,
        email: form.email || null,
      })
      if (saveErr) throw saveErr

      // Etapa antes da geração — ver comentário em onConfirmStage.
      await onConfirmStage()

      const { data, error } = await supabase.functions.invoke('generate-contract', {
        body: { process_id: processo.id, term_start: termStart, template_doc_id: templateId || null },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as { google_doc_url: string | null }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dp-contracts', processo.id] })
      queryClient.invalidateQueries({ queryKey: ['dp-contract-data', processo.id] })
      toast.success('Contrato de parceria gerado', {
        action: data.google_doc_url
          ? { label: 'Abrir', onClick: () => window.open(data.google_doc_url!, '_blank', 'noopener') }
          : undefined,
      })
      onClose()
    },
    // A etapa já mudou quando a geração falha (é o passo anterior) — a pessoa
    // continua em Contratação e pode tentar de novo em /admin/dp/contratos.
    onError: (err) => toast.error(`Erro ao gerar contrato: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const moverSemGerar = useMutation({
    mutationFn: async () => { await onConfirmStage() },
    onSuccess: () => {
      toast.success('Movido para Contratação — contrato não gerado')
      onClose()
    },
    onError: (err) => toast.error(`Erro ao mover: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  const busy = confirmar.isPending || moverSemGerar.isPending

  function label(field: ContractDataField, optional?: boolean) {
    return (
      <label className="block text-[11px] text-muted-foreground mb-1">
        {CONTRACT_DATA_FIELD_LABELS[field]}
        {optional ? null : <span className="text-danger"> *</span>}
      </label>
    )
  }

  const inputClass = 'w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-bold text-foreground">Contratar {processo.candidates?.name}</h2>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Confirme os dados e o modelo base — o Contrato de Profissional Parceiro é gerado ao confirmar, e o processo vai para Contratação.
        </p>

        <div className="rounded-xl border border-border bg-surface-alt p-3 space-y-3 mb-4">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Modelo base do contrato</label>
            {templatesError ? (
              <p className="text-[11px] text-danger">
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
              Os modelos são os documentos da pasta de contratos no Drive — para adicionar outro, basta colocá-lo lá.
            </p>
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Data de assinatura <span className="text-danger">*</span>
            </label>
            <DateField value={termStart || null} onChange={(v) => setTermStart(v ?? '')} placeholder="Selecionar" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {termStart ? (
                <>
                  Vigência até <span className="font-medium text-foreground">{formatDateBR(partnerTermEndISO(termStart))}</span>
                  {' '}({PARCERIA_TERM_MONTHS} meses, cláusula 4.1 do contrato).
                </>
              ) : (
                <>Vigência de {PARCERIA_TERM_MONTHS} meses a partir desta data.</>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">Retenção do salão / comissão de produtos</span>
            {missingPercentages ? (
              <span className="text-warning font-medium text-right">
                não definidos no cargo
              </span>
            ) : (
              <span className="font-medium text-foreground">
                {percentuais!.retention}% / {percentuais!.product}%
              </span>
            )}
          </div>
          {missingPercentages && (
            <p className="text-[10px] text-warning -mt-2">
              Preencha em /admin/rh/cargos (ou na vaga) antes de gerar — eles vão impressos no contrato.
            </p>
          )}
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
          <div>
            {label('nationality')}
            <NacionalidadeField value={form.nationality} onChange={(v) => setForm({ ...form, nationality: v })} />
          </div>
          <div>
            {label('marital_status')}
            <StyledSelect
              value={form.marital_status}
              onChange={(v) => setForm({ ...form, marital_status: v })}
              options={toSelectOptions(MARITAL_STATUS_OPTIONS)}
              placeholder="Selecionar"
            />
          </div>
          <div className="col-span-2">
            {label('address')}
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rua, número, bairro, cidade" className={inputClass} />
          </div>
          <div className="col-span-2">
            {label('email')}
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          </div>
        </div>

        {missingFields.length > 0 && (
          <p className="text-[11px] text-warning mb-3">
            Faltam: {missingFields.map((f) => CONTRACT_DATA_FIELD_LABELS[f]).join(', ')}.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => confirmar.mutate()}
            disabled={busy || missingFields.length > 0 || missingPercentages || !termStart || !templateId}
            title={missingFields.length > 0 ? 'Preencha os dados obrigatórios' : undefined}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-50 transition-colors"
          >
            <FileSignature className="w-4 h-4" />
            {confirmar.isPending ? 'Gerando contrato...' : 'Contratar e gerar contrato'}
          </button>
          <button
            onClick={() => moverSemGerar.mutate()}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Só mover
          </button>
        </div>
      </div>
    </div>
  )
}
