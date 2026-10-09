import { useState, useEffect } from 'react'
import { X, FileText, MapPin, CheckCircle2, Loader } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DocumentType, ProfileData, BR_STATES, applyDocMask } from '@/utils/profile'
import StyledSelect from '@/components/ui/styled-select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PageLoading, Segmented } from '@/components/admin/ui/AdminPage'

interface Props {
  userId: string
  onClose: () => void
  onComplete: () => void
}

export function ProfileCompletionModal({ userId, onClose, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<ProfileData | null>(null)

  useEffect(() => {
    document.body.setAttribute('data-modal-open', 'true');
    return () => document.body.removeAttribute('data-modal-open');
  }, []);

  const [docType, setDocType] = useState<DocumentType>('CPF')
  const [formData, setFormData] = useState({
    document: '',
    address_city: '',
    address_state: '',
  })

  useEffect(() => {
    setLoading(true)
    supabase
      .from('profiles')
      .select('document, document_type, address_city, address_state')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data as ProfileData)
          setDocType((data.document_type as DocumentType) || 'CPF')
          setFormData({
            document: data.document || '',
            address_city: data.address_city || '',
            address_state: data.address_state || '',
          })
        }
        setLoading(false)
      })
  }, [userId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name === 'document') {
      setFormData(prev => ({ ...prev, document: applyDocMask(value, docType) }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleDocTypeToggle = (type: DocumentType) => {
    setDocType(type)
    setFormData(prev => ({ ...prev, document: '' }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          document: formData.document || null,
          document_type: docType,
          address_city: formData.address_city || null,
          address_state: formData.address_state || null,
        })
        .eq('id', userId)

      if (updateError) throw updateError
      onComplete()
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Fields that are still missing (not yet filled in the profile)
  const needsDocument = !profile?.document
  const needsLocation = !profile?.address_city || !profile?.address_state
  const hasAnythingToFill = needsDocument || needsLocation

  // Perfil já completo: avisa o pai fora do render (chamar setState do pai
  // durante o render gerava o aviso "Cannot update a component while rendering").
  const alreadyComplete = !hasAnythingToFill && !loading
  useEffect(() => {
    if (alreadyComplete) onComplete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyComplete])

  if (alreadyComplete) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="profile-completion-title">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative bg-popover border border-border w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-[0.98] duration-150">
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="brand" className="mb-2">Perfil incompleto</Badge>
              <h2 id="profile-completion-title" className="text-[16px] font-semibold text-foreground tracking-tight leading-tight">
                Falta pouco para finalizar seu cadastro
              </h2>
              <p className="text-[13px] text-muted-foreground mt-1">
                Com essas informações, nossa equipe atende você mais rápido no WhatsApp.
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar" className="shrink-0 -mr-1.5 -mt-1">
              <X />
            </Button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <PageLoading label="Carregando…" className="py-6" />
          ) : (
            <>
              {error && (
                <p role="alert" className="text-[13px] text-danger bg-danger-subtle border border-danger-border px-3 py-2 rounded-md">{error}</p>
              )}

              {needsDocument && (
                <div>
                  <label htmlFor="pc-document" className="field-label flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-ink-400" />
                    CPF ou CNPJ
                  </label>
                  <Segmented<DocumentType>
                    className="w-full mb-2 [&>button]:flex-1 [&>button]:justify-center"
                    value={docType}
                    onChange={handleDocTypeToggle}
                    items={[
                      { key: 'CPF', label: 'CPF (pessoa física)' },
                      { key: 'CNPJ', label: 'CNPJ (empresa)' },
                    ]}
                  />
                  <Input
                    id="pc-document"
                    type="text"
                    name="document"
                    inputMode="numeric"
                    value={formData.document}
                    onChange={handleChange}
                    maxLength={docType === 'CPF' ? 14 : 18}
                    placeholder={docType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    className="mono"
                  />
                </div>
              )}

              {needsLocation && (
                <div>
                  <label htmlFor="pc-city" className="field-label flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-ink-400" />
                    Cidade e estado
                  </label>
                  <div className="grid grid-cols-[1fr_96px] gap-2">
                    <Input
                      id="pc-city"
                      type="text"
                      name="address_city"
                      value={formData.address_city}
                      onChange={handleChange}
                      placeholder="Sua cidade"
                    />
                    <StyledSelect
                      value={formData.address_state}
                      onChange={(v) => setFormData(prev => ({ ...prev, address_state: v }))}
                      options={BR_STATES.map(s => ({ value: s, label: s }))}
                      emptyLabel="UF"
                      placeholder="UF"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" className="sm:flex-1" onClick={onClose}>
            Completar depois
          </Button>
          <Button className="sm:flex-1" onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader className="animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                <CheckCircle2 />
                Completar perfil
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
