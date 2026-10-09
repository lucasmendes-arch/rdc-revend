import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, FileSignature } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { DateField } from '@/components/ui/date-field'
import StyledSelect from '@/components/ui/styled-select'
import NacionalidadeField from '@/components/dp/NacionalidadeField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
      <label className="field-label">
        {CONTRACT_DATA_FIELD_LABELS[field]}
        {optional ? null : <span className="text-danger"> *</span>}
      </label>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dp-contratar-title">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-in fade-in-0" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-popover p-5 shadow-xl animate-in fade-in-0 zoom-in-[0.98] duration-150">
        <div className="pr-8">
          <h2 id="dp-contratar-title" className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
            Contratar {processo.candidates?.name}
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Confirme os dados e o modelo base. O contrato de profissional parceiro é gerado ao confirmar, e o processo vai para Contratação.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={busy} aria-label="Fechar" className="absolute right-3 top-3">
          <X />
        </Button>

        <div className="mt-5 rounded-lg border border-border bg-surface p-4 space-y-4">
          <div>
            <label className="field-label">Modelo base do contrato</label>
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
              Os modelos são os documentos da pasta de contratos no Drive. Para adicionar outro, basta colocá-lo lá.
            </p>
          </div>

          <div>
            <label className="field-label">
              Data de assinatura <span className="text-danger">*</span>
            </label>
            <DateField value={termStart || null} onChange={(v) => setTermStart(v ?? '')} placeholder="Selecionar" />
            <p className="text-[12px] text-muted-foreground mt-1.5">
              {termStart ? (
                <>
                  Vigência até <span className="font-medium text-foreground tabular-nums">{formatDateBR(partnerTermEndISO(termStart))}</span>
                  {' '}({PARCERIA_TERM_MONTHS} meses, cláusula 4.1 do contrato).
                </>
              ) : (
                <>Vigência de {PARCERIA_TERM_MONTHS} meses a partir desta data.</>
              )}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-muted-foreground">Retenção do salão / comissão de produtos</span>
              {missingPercentages ? (
                <span className="text-warning font-medium text-right shrink-0">Não definidos no cargo</span>
              ) : (
                <span className="font-medium text-foreground tabular-nums shrink-0">
                  {percentuais!.retention}% / {percentuais!.product}%
                </span>
              )}
            </div>
            {missingPercentages && (
              <p className="text-[12px] text-warning mt-1">
                Preencha em /admin/rh/cargos (ou na vaga) antes de gerar — eles vão impressos no contrato.
              </p>
            )}
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
          <div className="sm:col-span-2">
            {label('address')}
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rua, número, bairro, cidade" />
          </div>
          <div className="sm:col-span-2">
            {label('email')}
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
            onClick={() => moverSemGerar.mutate()}
            disabled={busy}
            title="Move para Contratação sem gerar o contrato"
          >
            Só mover
          </Button>
          <Button
            onClick={() => confirmar.mutate()}
            disabled={busy || missingFields.length > 0 || missingPercentages || !termStart || !templateId}
            title={missingFields.length > 0 ? 'Preencha os dados obrigatórios' : undefined}
          >
            <FileSignature />
            {confirmar.isPending ? 'Gerando contrato…' : 'Contratar e gerar contrato'}
          </Button>
        </div>
      </div>
    </div>
  )
}
