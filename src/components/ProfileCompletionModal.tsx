import { useState, useEffect } from 'react'
import { X, FileText, MapPin, CheckCircle2, Loader } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DocumentType, ProfileData, BR_STATES, applyDocMask } from '@/utils/profile'

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

  if (!hasAnythingToFill && !loading) {
    // Profile already complete — don't show
    onComplete()
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mb-2">
                Perfil incompleto
              </span>
              <h2 className="text-lg font-black text-foreground leading-tight">
                Falta pouco para finalizar seu cadastro
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Com essas informações, nossa equipe pode te atender mais rápido no WhatsApp.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-surface-alt flex items-center justify-center text-muted-foreground transition-colors mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              {/* Document */}
              {needsDocument && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <label className="text-sm font-semibold text-foreground">CPF ou CNPJ</label>
                  </div>
                  {/* Type toggle */}
                  <div className="flex p-1 bg-surface rounded-xl border border-border mb-2">
                    <button
                      type="button"
                      onClick={() => handleDocTypeToggle('CPF')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${docType === 'CPF' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-300' : 'text-muted-foreground'}`}
                    >
                      CPF (Pessoa Física)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDocTypeToggle('CNPJ')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${docType === 'CNPJ' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-300' : 'text-muted-foreground'}`}
                    >
                      CNPJ (Empresa)
                    </button>
                  </div>
                  <input
                    type="text"
                    name="document"
                    value={formData.document}
                    onChange={handleChange}
                    maxLength={docType === 'CPF' ? 14 : 18}
                    placeholder={docType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm font-mono"
                  />
                </div>
              )}

              {/* Location */}
              {needsLocation && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <label className="text-sm font-semibold text-foreground">Cidade e Estado</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      name="address_city"
                      value={formData.address_city}
                      onChange={handleChange}
                      placeholder="Sua cidade"
                      className="w-full px-3 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                    />
                    <select
                      name="address_state"
                      value={formData.address_state}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 rounded-xl border border-input bg-surface focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all text-sm"
                    >
                      <option value="">UF</option>
                      {BR_STATES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold btn-gold text-white disabled:opacity-70 transition-all"
          >
            {saving ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Completar perfil
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Completar depois
          </button>
        </div>
      </div>
    </div>
  )
}
