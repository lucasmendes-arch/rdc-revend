import { useRef } from 'react'
import { Image as ImageIcon, FileText, Loader, X, FileSearch } from 'lucide-react'
import { formatPhone } from '@/lib/phone'
import StyledSelect from '@/components/ui/styled-select'
import type { JobRoleDescriptiveRow } from './JobRoleFieldsForm'

export type FieldType = 'texto' | 'texto_longo' | 'numero' | 'telefone' | 'select' | 'checkbox' | 'data' | 'upload_imagem' | 'upload_imagens' | 'upload_arquivo'

// Resposta de checkbox (múltipla escolha) grava as opções marcadas juntas
// numa string só, já que candidate_answers.value é sempre texto simples.
// Reaproveitado por upload_imagens (múltiplas imagens) pelo mesmo motivo.
export const CHECKBOX_DELIM = '; '

// upload_imagens: limite de imagens por pergunta (perguntas de certificados
// costumam ter mais de um documento, mas sem limite viraria um upload
// ilimitado dentro de um campo pensado pra poucos arquivos).
export const MAX_MULTI_UPLOAD = 5

export interface FormFieldConfig {
  id: string
  field_key: string
  label: string
  question_text: string | null
  help_text: string | null
  placeholder: string | null
  field_type: FieldType
  required: boolean
  sort_order: number
  step: number
  options: string[] | null
  is_system_field: boolean
  visible_for_job_role_ids?: string[] | null
}

export interface PublicJobOpening extends JobRoleDescriptiveRow {
  id: string
  role_title: string
  status: string
  job_role_id: string | null
}

interface FormFieldRendererProps {
  field: FormFieldConfig
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  jobOpenings?: PublicJobOpening[]
  onUploadFile?: (file: File) => void
  uploading?: boolean
  onViewJobDetails?: (jobOpeningId: string) => void
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

export default function FormFieldRenderer({
  field, value, onChange, readOnly, jobOpenings = [], onUploadFile, uploading, onViewJobDetails,
}: FormFieldRendererProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const labelNode = (
    <div className="mb-2">
      <label className="block text-sm font-medium text-foreground leading-snug">
        {field.question_text || field.label}{field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.help_text && <p className="text-xs text-muted-foreground mt-1 leading-snug">{field.help_text}</p>}
    </div>
  )

  if (field.field_key === 'vaga_id') {
    return (
      <div>
        {labelNode}
        <StyledSelect
          value={value}
          onChange={onChange}
          disabled={readOnly}
          placeholder={field.placeholder || 'Selecione a vaga'}
          options={jobOpenings.map((j) => ({
            value: j.id,
            label: `${j.role_title}${j.status === 'fechada' ? ' (banco de currículos)' : ''}`,
          }))}
        />
        {value && onViewJobDetails && (
          <button
            type="button"
            onClick={() => onViewJobDetails(value)}
            className="flex items-center gap-1.5 text-xs font-medium text-gold-text hover:underline mt-1.5"
          >
            <FileSearch className="w-3.5 h-3.5" /> Ver descrição completa da vaga
          </button>
        )}
      </div>
    )
  }

  if (field.field_type === 'select') {
    return (
      <div>
        {labelNode}
        <StyledSelect
          value={value}
          onChange={onChange}
          disabled={readOnly}
          placeholder={field.placeholder || 'Selecione'}
          options={(field.options || []).map((opt) => ({ value: opt, label: opt }))}
        />
      </div>
    )
  }

  if (field.field_type === 'checkbox') {
    const selected = value ? value.split(CHECKBOX_DELIM) : []
    function toggle(opt: string) {
      const next = selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]
      onChange(next.join(CHECKBOX_DELIM))
    }
    return (
      <div>
        {labelNode}
        <div className="space-y-1.5">
          {(field.options || []).map((opt) => (
            <label key={opt} className={`flex items-center gap-2 ${readOnly ? '' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                disabled={readOnly}
                onChange={() => toggle(opt)}
                className="w-4 h-4 rounded border-border accent-emerald-600 disabled:opacity-60"
              />
              <span className="text-sm text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (field.field_type === 'upload_imagens') {
    const urls = value ? value.split(CHECKBOX_DELIM) : []
    const atLimit = urls.length >= MAX_MULTI_UPLOAD

    function removeAt(index: number) {
      onChange(urls.filter((_, i) => i !== index).join(CHECKBOX_DELIM))
    }

    return (
      <div>
        {labelNode}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={readOnly}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && onUploadFile) onUploadFile(file)
            e.target.value = ''
          }}
        />
        {urls.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {urls.map((url, i) => (
              <div key={url + i} className="relative rounded-lg border border-border overflow-hidden group">
                <a href={url} target="_blank" rel="noopener noreferrer" className="block h-16 w-full bg-surface-alt">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
                    title="Remover imagem"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!readOnly && !atLimit && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt disabled:opacity-60"
          >
            {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {uploading ? 'Enviando...' : `Adicionar imagem (${urls.length}/${MAX_MULTI_UPLOAD})`}
          </button>
        )}
        {readOnly && urls.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma imagem enviada</p>
        )}
      </div>
    )
  }

  if (field.field_type === 'upload_imagem' || field.field_type === 'upload_arquivo') {
    const isImage = field.field_type === 'upload_imagem'
    return (
      <div>
        {labelNode}
        <input
          ref={fileInputRef}
          type="file"
          accept={isImage ? 'image/*' : '.pdf,.doc,.docx'}
          className="hidden"
          disabled={readOnly}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && onUploadFile) onUploadFile(file)
          }}
        />
        {value ? (
          <div className="flex items-center gap-2">
            <a href={value} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-surface-alt min-w-0">
              {isImage ? <ImageIcon className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
              <span className="truncate">{isImage ? 'Ver foto enviada' : 'Ver arquivo enviado'}</span>
            </a>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                title={isImage ? 'Remover foto e escolher outra' : 'Remover arquivo e escolher outro'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={readOnly || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-surface-alt disabled:opacity-60"
          >
            {uploading ? <Loader className="w-4 h-4 animate-spin" /> : isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {uploading ? 'Enviando...' : 'Selecionar arquivo'}
          </button>
        )}
      </div>
    )
  }

  if (field.field_type === 'texto_longo') {
    return (
      <div>
        {labelNode}
        <textarea
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={field.placeholder}
          className={`${inputClass} resize-none`}
        />
      </div>
    )
  }

  return (
    <div>
      {labelNode}
      <input
        type={field.field_type === 'numero' ? 'number' : field.field_type === 'data' ? 'date' : field.field_type === 'telefone' ? 'tel' : 'text'}
        inputMode={field.field_type === 'telefone' ? 'numeric' : undefined}
        maxLength={field.field_type === 'telefone' ? 15 : undefined}
        min={field.field_key === 'idade' ? 17 : undefined}
        max={field.field_key === 'idade' ? 99 : undefined}
        value={value}
        onChange={(e) => onChange(
          field.field_type === 'telefone' ? formatPhone(e.target.value)
          : field.field_key === 'idade' ? formatAge(e.target.value)
          : e.target.value
        )}
        disabled={readOnly}
        placeholder={field.placeholder || (field.field_type === 'telefone' ? '(27) 99999-9999' : undefined)}
        className={inputClass}
      />
    </div>
  )
}

function formatAge(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 2)
}
