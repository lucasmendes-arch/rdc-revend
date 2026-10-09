import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader, CheckCircle2, Briefcase, Info, ArrowLeft, X, Clock, Wallet, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useImageUpload, PHOTO_MAX_DIMENSION } from '@/hooks/useImageUpload'
import { useFileUpload } from '@/hooks/useFileUpload'
import FormFieldRenderer, { CHECKBOX_DELIM, FormFieldConfig, PublicJobOpening } from '@/components/rh/FormFieldRenderer'
import { contractTypeLabel, compensationTypeLabel } from '@/components/rh/JobRoleFieldsForm'
import { useTrackConversion } from '@/lib/hooks/useFacebookConversion'
import logo from '@/assets/logo-rei-dos-cachos.png'
import { Button } from '@/components/ui/button'
import { EmptyState, PageLoading } from '@/components/admin/ui/AdminPage'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

interface PublicFormData {
  store: { id: string; name: string }
  job_openings: PublicJobOpening[]
  fields: FormFieldConfig[]
}

// TODO: número de teste (Lucas) — trocar pelo WhatsApp administrativo real antes de divulgar o link em produção.
const ADMIN_WHATSAPP_NUMBER = '5527996602331'

export default function CandidaturaPublica() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const [searchParams] = useSearchParams()
  // Cada conjunto de anúncios (Meta Ads) pode linkar direto pra uma vaga
  // específica via ?vaga=<job_opening_id> — pré-seleciona a vaga no
  // formulário e mede ViewContent/Lead segmentado por vaga desde a entrada,
  // em vez de só saber a vaga depois que o candidato escolhe manualmente.
  const vagaParam = searchParams.get('vaga')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [viewingJobId, setViewingJobId] = useState<string | null>(null)
  const viewContentFired = useRef(false)

  const { upload: uploadPhoto } = useImageUpload()
  const { upload: uploadResume } = useFileUpload()
  const trackConversion = useTrackConversion()

  const { data, isLoading, error } = useQuery<PublicFormData>({
    queryKey: ['public-application-form', storeSlug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_application_form', { p_store_slug: storeSlug })
      if (error) throw error
      return data as PublicFormData
    },
    enabled: !!storeSlug,
    retry: false,
  })

  const fields = useMemo(() => (data?.fields || []).slice().sort((a, b) => a.sort_order - b.sort_order), [data])

  // Pré-seleciona a vaga vinda do link do anúncio e mede o ViewContent
  // segmentado por vaga uma única vez, assim que o formulário carrega.
  useEffect(() => {
    if (!data || !vagaParam || viewContentFired.current) return
    const job = data.job_openings.find((j) => j.id === vagaParam)
    if (!job) return

    viewContentFired.current = true
    setAnswers((prev) => (prev['vaga_id'] ? prev : { ...prev, vaga_id: job.id }))
    trackConversion({ eventName: 'ViewContent', contentName: job.role_title })
    window.gtag?.('event', 'view_item', { content_name: job.role_title, store: data.store?.name })
  }, [data, vagaParam, trackConversion])

  // Cargo da vaga escolhida — usado pra filtrar perguntas restritas a
  // cargos específicos (visible_for_job_role_ids). Vaga sem cargo vinculado
  // no catálogo (job_role_id null) nunca satisfaz uma restrição de cargo.
  const appliedJob = useMemo(
    () => data?.job_openings.find((j) => j.id === answers['vaga_id']),
    [data, answers]
  )
  const selectedJobRoleId = appliedJob?.job_role_id ?? null

  const isFieldVisible = useMemo(() => (field: FormFieldConfig) => {
    const restriction = field.visible_for_job_role_ids
    if (!restriction || restriction.length === 0) return true
    return selectedJobRoleId != null && restriction.includes(selectedJobRoleId)
  }, [selectedJobRoleId])

  const visibleFields = useMemo(() => fields.filter(isFieldVisible), [fields, isFieldVisible])

  // Etapas do wizard = valores distintos de "step" presentes nos campos
  // visíveis, em ordem crescente. Enquanto o construtor não atribuir etapas
  // diferentes, tudo cai em "1" — formulário se comporta como uma tela só,
  // sem barra de progresso nem botão Voltar.
  const steps = useMemo(() => {
    const unique = Array.from(new Set(visibleFields.map((f) => f.step))).sort((a, b) => a - b)
    return unique.length > 0 ? unique : [1]
  }, [visibleFields])

  const safeStepIdx = Math.min(currentStepIdx, steps.length - 1)
  const currentFields = useMemo(
    () => visibleFields.filter((f) => f.step === steps[safeStepIdx]),
    [visibleFields, steps, safeStepIdx]
  )
  const isLastStep = safeStepIdx === steps.length - 1
  const isMultiStep = steps.length > 1
  const showNav = !isLoading && !error && !!data && !submitted

  const missingRequiredInStep = useMemo(
    () => currentFields.filter((f) => f.required && !answers[f.field_key]?.trim()),
    [currentFields, answers]
  )

  const submit = useMutation({
    mutationFn: async () => {
      const p_answers = visibleFields
        .filter((f) => answers[f.field_key]?.trim())
        .map((f) => ({ field_key: f.field_key, value: answers[f.field_key] }))
      const { error } = await supabase.rpc('submit_candidate_application', {
        p_store_slug: storeSlug,
        p_answers,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setSubmitted(true)

      const jobTitle = appliedJob?.role_title
      const phoneField = visibleFields.find((f) => f.field_type === 'telefone')
      const phone = phoneField ? answers[phoneField.field_key] : undefined

      trackConversion({
        eventName: 'Lead',
        contentName: jobTitle ?? data?.store?.name,
        phone,
      })

      window.gtag?.('event', 'generate_lead', {
        content_name: jobTitle ?? data?.store?.name,
        store: data?.store?.name,
      })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao enviar candidatura'),
  })

  async function handleUpload(field: FormFieldConfig, file: File) {
    setUploadingKey(field.field_key)
    try {
      // Certificado continua em 800px (é documento, precisa ficar legível);
      // só a foto de perfil cai pra PHOTO_MAX_DIMENSION, já que só aparece em
      // thumb nos kanbans de RH/DP.
      const url = field.field_type === 'upload_arquivo'
        ? await uploadResume(file, 'candidates/resumes')
        : field.field_type === 'upload_imagens'
          ? await uploadPhoto(file, 'candidates/certificates')
          : await uploadPhoto(file, 'candidates/photos', { maxDimension: PHOTO_MAX_DIMENSION })
      setAnswers((prev) => {
        if (field.field_type === 'upload_imagens') {
          const existing = prev[field.field_key] ? prev[field.field_key].split(CHECKBOX_DELIM) : []
          return { ...prev, [field.field_key]: [...existing, url].join(CHECKBOX_DELIM) }
        }
        return { ...prev, [field.field_key]: url }
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro no upload do arquivo')
    } finally {
      setUploadingKey(null)
    }
  }

  function handleNext() {
    if (missingRequiredInStep.length > 0) {
      toast.error(`Preencha: ${missingRequiredInStep.map((f) => f.label).join(', ')}`)
      return
    }
    const ageField = currentFields.find((f) => f.field_key === 'idade')
    if (ageField) {
      const age = Number(answers[ageField.field_key])
      if (Number.isFinite(age) && age < 17) {
        toast.error('Não contratamos menores de idade.')
        return
      }
    }
    if (isLastStep) {
      submit.mutate()
    } else {
      setCurrentStepIdx(safeStepIdx + 1)
    }
  }

  function handleBack() {
    setCurrentStepIdx(Math.max(0, safeStepIdx - 1))
  }

  const viewingJob = data?.job_openings.find((j) => j.id === viewingJobId) || null

  const whatsappUrl = useMemo(() => {
    const jobTitle = appliedJob?.role_title
    const storeName = data?.store?.name
    const message = jobTitle
      ? `Olá! Acabei de enviar minha candidatura para a vaga de ${jobTitle}${storeName ? ` (${storeName})` : ''} e queria confirmar o recebimento.`
      : `Olá! Acabei de enviar minha candidatura${storeName ? ` na ${storeName}` : ''} e queria confirmar o recebimento.`
    return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  }, [appliedJob, data?.store?.name])

  const JobFact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[13px] text-foreground mt-0.5">{children}</dd>
    </div>
  )

  return (
    <div className="min-h-screen bg-background bg-ambient flex items-center justify-center p-3 sm:p-6">
      {/* Altura fixa (com teto pra tela pequena): o "popup" mantém sempre o
          mesmo formato entre as etapas — só o miolo rola, cabeçalho e rodapé
          de navegação ficam parados no lugar. */}
      <div className="w-full max-w-lg bg-card rounded-xl border border-border shadow-md flex flex-col h-[680px] max-h-[calc(100dvh-1.5rem)] sm:max-h-[88vh] overflow-hidden">
        <div className="flex flex-col items-center text-center px-5 sm:px-8 pt-6 sm:pt-8 pb-4 shrink-0">
          <img src={logo} alt="Rei dos Cachos" className="h-10 w-auto mb-4" />
          <h1 className="text-[24px] sm:text-[26px] leading-tight text-foreground">Faça parte do nosso time</h1>
          {data?.store && <p className="text-[14px] text-muted-foreground mt-1">{data.store.name}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-8 pb-6 sm:pb-8">
          {isLoading ? (
            <PageLoading label="Carregando formulário…" className="h-full py-0" />
          ) : error || !data ? (
            <EmptyState
              icon={Briefcase}
              title="Unidade não encontrada"
              description="Este link de candidatura não está ativo. Confira o endereço recebido ou peça um novo link à unidade."
              className="h-full py-0"
            />
          ) : submitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-success-subtle border border-success-border flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <h2 className="text-[18px] font-semibold text-foreground tracking-tight">Candidatura enviada</h2>
              <p className="text-[14px] text-muted-foreground mt-2">
                Recebemos suas informações e vamos analisar seu perfil. Se avançarmos, entraremos em contato
                pelo WhatsApp informado.
              </p>
              <div className="flex items-start gap-2 rounded-md bg-info-subtle border border-info-border px-3 py-2.5 mt-5 text-left">
                <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                <p className="text-[12px] text-info leading-relaxed">
                  Aguarde até 72h para que a equipe de recrutamento analise as candidaturas. Devido ao volume de
                  inscrições, <strong className="font-semibold">apenas os candidatos selecionados para entrevista serão contatados</strong>.
                </p>
              </div>
              {/* Verde do WhatsApp: exceção de marca documentada (design-tokens §8). */}
              <Button
                asChild
                size="lg"
                className="w-full mt-5 bg-[#25D366] hover:bg-[#20BE5A] text-white border-transparent"
              >
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    const jobTitle = appliedJob?.role_title
                    trackConversion({ eventName: 'Contact', contentName: jobTitle ?? data?.store?.name })
                    window.gtag?.('event', 'contact', {
                      content_name: jobTitle ?? data?.store?.name,
                      store: data?.store?.name,
                      method: 'whatsapp',
                    })
                  }}
                >
                  <MessageCircle /> Falar com recrutador
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {isMultiStep && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground numeric">
                      Etapa {safeStepIdx + 1} de {steps.length}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={steps.length}
                    aria-valuenow={safeStepIdx + 1}
                  >
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${((safeStepIdx + 1) / steps.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {currentFields.map((field) => (
                  <FormFieldRenderer
                    key={field.id}
                    field={field}
                    value={answers[field.field_key] || ''}
                    onChange={(v) => setAnswers((prev) => ({ ...prev, [field.field_key]: v }))}
                    jobOpenings={data.job_openings}
                    onUploadFile={(file) => handleUpload(field, file)}
                    uploading={uploadingKey === field.field_key}
                    onViewJobDetails={setViewingJobId}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {showNav && (
          <div className="shrink-0 border-t border-border px-5 sm:px-8 py-4 flex items-center gap-2">
            {isMultiStep && safeStepIdx > 0 && (
              <Button variant="secondary" size="lg" onClick={handleBack} disabled={submit.isPending}>
                <ArrowLeft /> Voltar
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1"
              onClick={handleNext}
              disabled={submit.isPending || uploadingKey !== null}
            >
              {submit.isPending ? (
                <><Loader className="animate-spin" /> Enviando…</>
              ) : isLastStep ? 'Enviar candidatura' : 'Próximo'}
            </Button>
          </div>
        )}
      </div>

      {viewingJob && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="job-details-title">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setViewingJobId(null)} />
          <div className="relative bg-popover rounded-t-xl sm:rounded-xl shadow-xl border border-border p-5 sm:p-6 w-full sm:max-w-md max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-[0.98] duration-150">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 id="job-details-title" className="text-[16px] font-semibold text-foreground tracking-tight">{viewingJob.role_title}</h2>
                {data?.store && <p className="text-[12px] text-muted-foreground mt-0.5">{data.store.name}</p>}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setViewingJobId(null)} aria-label="Fechar" className="shrink-0 -mr-1.5 -mt-1">
                <X />
              </Button>
            </div>

            <dl className="space-y-4">
              {(viewingJob.contract_type || viewingJob.compensation_type) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingJob.contract_type && (
                    <JobFact label="Contrato">{contractTypeLabel(viewingJob.contract_type)}</JobFact>
                  )}
                  {viewingJob.compensation_type && (
                    <JobFact label="Remuneração">
                      <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-ink-400" /> {compensationTypeLabel(viewingJob.compensation_type)}</span>
                    </JobFact>
                  )}
                </div>
              )}

              {(viewingJob.fixed_amount != null || viewingJob.variable_percentage != null) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingJob.fixed_amount != null && (
                    <JobFact label="Valor fixo">
                      <span className="numeric">R$ {viewingJob.fixed_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </JobFact>
                  )}
                  {viewingJob.variable_percentage != null && (
                    <JobFact label="Variável">
                      Até {viewingJob.variable_percentage}%{viewingJob.variable_basis ? ` — ${viewingJob.variable_basis}` : ''}
                    </JobFact>
                  )}
                </div>
              )}

              {(viewingJob.work_schedule || viewingJob.workload_hours != null) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingJob.work_schedule && (
                    <JobFact label="Horário">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-ink-400" /> {viewingJob.work_schedule}</span>
                    </JobFact>
                  )}
                  {viewingJob.workload_hours != null && (
                    <JobFact label="Carga horária">{viewingJob.workload_hours}h/semana</JobFact>
                  )}
                </div>
              )}

              {viewingJob.benefits && (
                <JobFact label="Benefícios"><span className="whitespace-pre-line">{viewingJob.benefits}</span></JobFact>
              )}
              {viewingJob.requirements && (
                <JobFact label="Requisitos"><span className="whitespace-pre-line">{viewingJob.requirements}</span></JobFact>
              )}
              {viewingJob.description && (
                <JobFact label="Descrição"><span className="whitespace-pre-line">{viewingJob.description}</span></JobFact>
              )}
            </dl>

            {!viewingJob.description && !viewingJob.contract_type && !viewingJob.compensation_type && !viewingJob.work_schedule && !viewingJob.requirements && !viewingJob.benefits && (
              <p className="text-[13px] text-muted-foreground text-center py-4">Sem detalhes adicionais cadastrados para esta vaga.</p>
            )}

            <Button variant="secondary" className="w-full mt-5" onClick={() => setViewingJobId(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
