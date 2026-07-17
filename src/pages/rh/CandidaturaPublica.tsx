import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader, CheckCircle2, Briefcase, Info, ArrowLeft, X, Clock, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useFileUpload } from '@/hooks/useFileUpload'
import FormFieldRenderer, { FormFieldConfig, PublicJobOpening } from '@/components/rh/FormFieldRenderer'
import { contractTypeLabel, compensationTypeLabel } from '@/components/rh/JobRoleFieldsForm'
import logo from '@/assets/logo-rei-dos-cachos.png'

interface PublicFormData {
  store: { id: string; name: string }
  job_openings: PublicJobOpening[]
  fields: FormFieldConfig[]
}

export default function CandidaturaPublica() {
  const { storeSlug } = useParams<{ storeSlug: string }>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [viewingJobId, setViewingJobId] = useState<string | null>(null)

  const { upload: uploadPhoto } = useImageUpload()
  const { upload: uploadResume } = useFileUpload()

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

  // Etapas do wizard = valores distintos de "step" presentes nos campos, em
  // ordem crescente. Enquanto o construtor não atribuir etapas diferentes,
  // tudo cai em "1" — formulário se comporta como uma tela só, sem barra de
  // progresso nem botão Voltar.
  const steps = useMemo(() => {
    const unique = Array.from(new Set(fields.map((f) => f.step))).sort((a, b) => a - b)
    return unique.length > 0 ? unique : [1]
  }, [fields])

  const safeStepIdx = Math.min(currentStepIdx, steps.length - 1)
  const currentFields = useMemo(
    () => fields.filter((f) => f.step === steps[safeStepIdx]),
    [fields, steps, safeStepIdx]
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
      const p_answers = fields
        .filter((f) => answers[f.field_key]?.trim())
        .map((f) => ({ field_key: f.field_key, value: answers[f.field_key] }))
      const { error } = await supabase.rpc('submit_candidate_application', {
        p_store_slug: storeSlug,
        p_answers,
      })
      if (error) throw error
    },
    onSuccess: () => setSubmitted(true),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao enviar candidatura'),
  })

  async function handleUpload(field: FormFieldConfig, file: File) {
    setUploadingKey(field.field_key)
    try {
      const url = field.field_type === 'upload_imagem'
        ? await uploadPhoto(file, 'candidates/photos')
        : await uploadResume(file, 'candidates/resumes')
      setAnswers((prev) => ({ ...prev, [field.field_key]: url }))
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

  return (
    <div className="min-h-screen bg-surface-alt flex items-center justify-center p-4">
      {/* Altura fixa (com teto pra tela pequena): o "popup" mantém sempre o
          mesmo formato entre as etapas — só o miolo rola, cabeçalho e rodapé
          de navegação ficam parados no lugar. */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-border shadow-card flex flex-col h-[640px] max-h-[85vh]">
        <div className="flex flex-col items-center text-center px-6 sm:px-8 pt-6 sm:pt-8 pb-4 shrink-0">
          <img src={logo} alt="Rei dos Cachos" className="h-10 w-auto mb-3" />
          <h1 className="text-xl font-bold text-foreground">Faça parte do nosso time!</h1>
          {data?.store && <p className="text-sm text-muted-foreground mt-1">{data.store.name}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-6 sm:pb-8">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Loader className="w-7 h-7 animate-spin text-gold-text mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Carregando formulário...</p>
            </div>
          ) : error || !data ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Briefcase className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-foreground font-medium">Unidade não encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">Confira o link recebido e tente novamente.</p>
            </div>
          ) : submitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
              <p className="text-foreground font-semibold text-lg">Candidatura enviada!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Recebemos suas informações e vamos analisar seu perfil. Se avançarmos, entraremos em contato
                pelo WhatsApp informado.
              </p>
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mt-4 text-left">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Aguarde até 72h para que a equipe de recrutamento analise as candidaturas. Devido ao volume de
                  inscrições, <strong className="font-semibold">apenas os candidatos selecionados para entrevista serão contatados</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {isMultiStep && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Etapa {safeStepIdx + 1} de {steps.length}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full bg-gold rounded-full transition-all duration-300"
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
          <div className="shrink-0 border-t border-border/60 px-6 sm:px-8 py-4 flex items-center gap-3">
            {isMultiStep && safeStepIdx > 0 && (
              <button
                onClick={handleBack}
                disabled={submit.isPending}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors disabled:opacity-60"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={submit.isPending || uploadingKey !== null}
              className="flex-1 px-4 py-2.5 rounded-lg btn-action font-medium disabled:opacity-70 transition-colors"
            >
              {submit.isPending ? 'Enviando...' : isLastStep ? 'Enviar candidatura' : 'Próximo'}
            </button>
          </div>
        )}
      </div>

      {viewingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setViewingJobId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">{viewingJob.role_title}</h2>
                {data?.store && <p className="text-xs text-muted-foreground mt-0.5">{data.store.name}</p>}
              </div>
              <button onClick={() => setViewingJobId(null)} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {(viewingJob.contract_type || viewingJob.compensation_type) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingJob.contract_type && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Contrato</p>
                      <p className="text-foreground">{contractTypeLabel(viewingJob.contract_type)}</p>
                    </div>
                  )}
                  {viewingJob.compensation_type && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Remuneração</p>
                      <p className="text-foreground flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> {compensationTypeLabel(viewingJob.compensation_type)}</p>
                    </div>
                  )}
                </div>
              )}

              {(viewingJob.fixed_amount != null || viewingJob.variable_percentage != null) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingJob.fixed_amount != null && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Valor fixo</p>
                      <p className="text-foreground">R$ {viewingJob.fixed_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  )}
                  {viewingJob.variable_percentage != null && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Variável</p>
                      <p className="text-foreground">{viewingJob.variable_percentage}%{viewingJob.variable_basis ? ` — ${viewingJob.variable_basis}` : ''}</p>
                    </div>
                  )}
                </div>
              )}

              {(viewingJob.work_schedule || viewingJob.workload_hours != null) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingJob.work_schedule && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Horário</p>
                      <p className="text-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {viewingJob.work_schedule}</p>
                    </div>
                  )}
                  {viewingJob.workload_hours != null && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Carga horária</p>
                      <p className="text-foreground">{viewingJob.workload_hours}h/semana</p>
                    </div>
                  )}
                </div>
              )}

              {viewingJob.description && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Descrição</p>
                  <p className="text-foreground whitespace-pre-line">{viewingJob.description}</p>
                </div>
              )}
              {viewingJob.requirements && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Requisitos</p>
                  <p className="text-foreground whitespace-pre-line">{viewingJob.requirements}</p>
                </div>
              )}
              {viewingJob.benefits && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Benefícios</p>
                  <p className="text-foreground whitespace-pre-line">{viewingJob.benefits}</p>
                </div>
              )}

              {!viewingJob.description && !viewingJob.contract_type && !viewingJob.compensation_type && !viewingJob.work_schedule && !viewingJob.requirements && !viewingJob.benefits && (
                <p className="text-muted-foreground text-center py-4">Sem detalhes adicionais cadastrados pra essa vaga.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
