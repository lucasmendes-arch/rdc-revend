export interface JobRoleFieldsValue {
  description: string
  contract_type: string
  compensation_type: string
  fixed_amount: string
  variable_percentage: string
  variable_basis: string
  work_schedule: string
  workload_hours: string
  requirements: string
  benefits: string
}

export const EMPTY_JOB_ROLE_FIELDS: JobRoleFieldsValue = {
  description: '',
  contract_type: '',
  compensation_type: '',
  fixed_amount: '',
  variable_percentage: '',
  variable_basis: '',
  work_schedule: '',
  workload_hours: '',
  requirements: '',
  benefits: '',
}

// campos descritivos crus como vêm do banco (numeric = number, tudo nullable)
export interface JobRoleDescriptiveRow {
  description: string | null
  contract_type: string | null
  compensation_type: string | null
  fixed_amount: number | null
  variable_percentage: number | null
  variable_basis: string | null
  work_schedule: string | null
  workload_hours: number | null
  requirements: string | null
  benefits: string | null
}

export const JOB_ROLE_DESCRIPTIVE_FIELDS_SELECT =
  'description, contract_type, compensation_type, fixed_amount, variable_percentage, variable_basis, work_schedule, workload_hours, requirements, benefits'

export function descriptiveRowToFormValue(row: JobRoleDescriptiveRow | null | undefined): JobRoleFieldsValue {
  if (!row) return EMPTY_JOB_ROLE_FIELDS
  return {
    description: row.description || '',
    contract_type: row.contract_type || '',
    compensation_type: row.compensation_type || '',
    fixed_amount: row.fixed_amount != null ? String(row.fixed_amount) : '',
    variable_percentage: row.variable_percentage != null ? String(row.variable_percentage) : '',
    variable_basis: row.variable_basis || '',
    work_schedule: row.work_schedule || '',
    workload_hours: row.workload_hours != null ? String(row.workload_hours) : '',
    requirements: row.requirements || '',
    benefits: row.benefits || '',
  }
}

export function descriptiveFormValueToPayload(value: JobRoleFieldsValue) {
  return {
    description: value.description.trim() || null,
    contract_type: value.contract_type || null,
    compensation_type: value.compensation_type || null,
    fixed_amount: value.fixed_amount ? Number(value.fixed_amount) : null,
    variable_percentage: value.variable_percentage ? Number(value.variable_percentage) : null,
    variable_basis: value.variable_basis.trim() || null,
    work_schedule: value.work_schedule.trim() || null,
    workload_hours: value.workload_hours ? Number(value.workload_hours) : null,
    requirements: value.requirements.trim() || null,
    benefits: value.benefits.trim() || null,
  }
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  clt: 'CLT',
  mei: 'MEI',
  pj: 'PJ',
  estagio: 'Estágio',
}

const COMPENSATION_TYPE_LABELS: Record<string, string> = {
  fixa: 'Fixa',
  variavel: 'Variável',
  mista: 'Fixa + Variável',
}

export function contractTypeLabel(value: string | null | undefined) {
  return value ? CONTRACT_TYPE_LABELS[value] ?? value : '—'
}

export function compensationTypeLabel(value: string | null | undefined) {
  return value ? COMPENSATION_TYPE_LABELS[value] ?? value : '—'
}

interface JobRoleFieldsFormProps {
  value: JobRoleFieldsValue
  onChange: (patch: Partial<JobRoleFieldsValue>) => void
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const labelClass = 'block text-sm font-medium text-foreground mb-1'

export function JobRoleFieldsForm({ value, onChange }: JobRoleFieldsFormProps) {
  const showFixed = value.compensation_type === 'fixa' || value.compensation_type === 'mista'
  const showVariable = value.compensation_type === 'variavel' || value.compensation_type === 'mista'

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Descrição do cargo</label>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={inputClass}
          rows={3}
          placeholder="O que essa pessoa vai fazer no dia a dia"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tipo de contrato</label>
          <select
            value={value.contract_type}
            onChange={(e) => onChange({ contract_type: e.target.value })}
            className={inputClass}
          >
            <option value="">Selecione</option>
            {Object.entries(CONTRACT_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Tipo de remuneração</label>
          <select
            value={value.compensation_type}
            onChange={(e) => {
              const compensation_type = e.target.value
              const nextShowFixed = compensation_type === 'fixa' || compensation_type === 'mista'
              const nextShowVariable = compensation_type === 'variavel' || compensation_type === 'mista'
              onChange({
                compensation_type,
                ...(nextShowFixed ? {} : { fixed_amount: '' }),
                ...(nextShowVariable ? {} : { variable_percentage: '', variable_basis: '' }),
              })
            }}
            className={inputClass}
          >
            <option value="">Selecione</option>
            {Object.entries(COMPENSATION_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {(showFixed || showVariable) && (
        <div className="grid grid-cols-2 gap-4">
          {showFixed && (
            <div>
              <label className={labelClass}>Valor fixo (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={value.fixed_amount}
                onChange={(e) => onChange({ fixed_amount: e.target.value })}
                className={inputClass}
                placeholder="Ex: 1800.00"
              />
            </div>
          )}
          {showVariable && (
            <div>
              <label className={labelClass}>Percentual variável (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={value.variable_percentage}
                onChange={(e) => onChange({ variable_percentage: e.target.value })}
                className={inputClass}
                placeholder="Ex: 3.5"
              />
            </div>
          )}
        </div>
      )}

      {showVariable && (
        <div>
          <label className={labelClass}>Base de cálculo da variável</label>
          <input
            type="text"
            value={value.variable_basis}
            onChange={(e) => onChange({ variable_basis: e.target.value })}
            className={inputClass}
            placeholder="Ex: % sobre vendas líquidas do mês"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Horário de trabalho</label>
          <input
            type="text"
            value={value.work_schedule}
            onChange={(e) => onChange({ work_schedule: e.target.value })}
            className={inputClass}
            placeholder="Ex: Seg-Sex 08h-18h, sáb 08h-12h"
          />
        </div>
        <div>
          <label className={labelClass}>Carga horária semanal (h)</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={value.workload_hours}
            onChange={(e) => onChange({ workload_hours: e.target.value })}
            className={inputClass}
            placeholder="Ex: 44"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Requisitos</label>
        <textarea
          value={value.requirements}
          onChange={(e) => onChange({ requirements: e.target.value })}
          className={inputClass}
          rows={2}
          placeholder="Pré-requisitos para a vaga/cargo"
        />
      </div>

      <div>
        <label className={labelClass}>Benefícios</label>
        <textarea
          value={value.benefits}
          onChange={(e) => onChange({ benefits: e.target.value })}
          className={inputClass}
          rows={2}
          placeholder="Ex: VT, VR, plano de saúde"
        />
      </div>
    </div>
  )
}
