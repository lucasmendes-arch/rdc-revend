import StyledSelect from '@/components/ui/styled-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export interface JobRoleFieldsValue {
  description: string
  contract_type: string
  compensation_type: string
  fixed_amount: string
  variable_percentage: string
  variable_basis: string
  partner_retention_percentage: string
  product_commission_percentage: string
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
  partner_retention_percentage: '',
  product_commission_percentage: '',
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
  partner_retention_percentage: number | null
  product_commission_percentage: number | null
  work_schedule: string | null
  workload_hours: number | null
  requirements: string | null
  benefits: string | null
}

export const JOB_ROLE_DESCRIPTIVE_FIELDS_SELECT =
  'description, contract_type, compensation_type, fixed_amount, variable_percentage, variable_basis, partner_retention_percentage, product_commission_percentage, work_schedule, workload_hours, requirements, benefits'

export function descriptiveRowToFormValue(row: JobRoleDescriptiveRow | null | undefined): JobRoleFieldsValue {
  if (!row) return EMPTY_JOB_ROLE_FIELDS
  return {
    description: row.description || '',
    contract_type: row.contract_type || '',
    compensation_type: row.compensation_type || '',
    fixed_amount: row.fixed_amount != null ? String(row.fixed_amount) : '',
    variable_percentage: row.variable_percentage != null ? String(row.variable_percentage) : '',
    variable_basis: row.variable_basis || '',
    partner_retention_percentage: row.partner_retention_percentage != null ? String(row.partner_retention_percentage) : '',
    product_commission_percentage: row.product_commission_percentage != null ? String(row.product_commission_percentage) : '',
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
    partner_retention_percentage: value.partner_retention_percentage ? Number(value.partner_retention_percentage) : null,
    product_commission_percentage: value.product_commission_percentage ? Number(value.product_commission_percentage) : null,
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

const labelClass = 'field-label'

export function JobRoleFieldsForm({ value, onChange }: JobRoleFieldsFormProps) {
  const showFixed = value.compensation_type === 'fixa' || value.compensation_type === 'mista'
  const showVariable = value.compensation_type === 'variavel' || value.compensation_type === 'mista'

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Descrição do cargo</label>
        <Textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="O que essa pessoa vai fazer no dia a dia"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tipo de contrato</label>
          <StyledSelect
            value={value.contract_type}
            onChange={(v) => onChange({ contract_type: v })}
            options={Object.entries(CONTRACT_TYPE_LABELS).map(([k, label]) => ({ value: k, label }))}
            emptyLabel="Selecione"
            searchable={false}
          />
        </div>
        <div>
          <label className={labelClass}>Tipo de remuneração</label>
          <StyledSelect
            value={value.compensation_type}
            onChange={(compensation_type) => {
              const nextShowFixed = compensation_type === 'fixa' || compensation_type === 'mista'
              const nextShowVariable = compensation_type === 'variavel' || compensation_type === 'mista'
              onChange({
                compensation_type,
                ...(nextShowFixed ? {} : { fixed_amount: '' }),
                ...(nextShowVariable ? {} : { variable_percentage: '', variable_basis: '' }),
              })
            }}
            options={Object.entries(COMPENSATION_TYPE_LABELS).map(([k, label]) => ({ value: k, label }))}
            emptyLabel="Selecione"
            searchable={false}
          />
        </div>
      </div>

      {(showFixed || showVariable) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {showFixed && (
            <div>
              <label className={labelClass}>Valor fixo (R$)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={value.fixed_amount}
                onChange={(e) => onChange({ fixed_amount: e.target.value })}
                placeholder="Ex: 1800.00"
              />
            </div>
          )}
          {showVariable && (
            <div>
              <label className={labelClass}>Percentual variável (%)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={value.variable_percentage}
                onChange={(e) => onChange({ variable_percentage: e.target.value })}
                placeholder="Ex: 3.5"
              />
            </div>
          )}
        </div>
      )}

      {showVariable && (
        <div>
          <label className={labelClass}>Base de cálculo da variável</label>
          <Input
            type="text"
            value={value.variable_basis}
            onChange={(e) => onChange({ variable_basis: e.target.value })}
            placeholder="Ex: % sobre vendas líquidas do mês"
          />
        </div>
      )}

      {/* Percentuais do Contrato de Profissional Parceiro (Lei 13.352/2016) —
          só fazem sentido em vínculo MEI, mesmo critério de
          job_roles.requires_experience. São o que vai impresso no contrato
          gerado em /admin/dp/contratos, não a remuneração variável divulgada
          na vaga (variable_percentage, acima). */}
      {value.contract_type === 'mei' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Retenção do salão (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={value.partner_retention_percentage}
              onChange={(e) => onChange({ partner_retention_percentage: e.target.value })}
              placeholder="Ex: 50"
            />
          </div>
          <div>
            <label className={labelClass}>Comissão sobre produtos (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={value.product_commission_percentage}
              onChange={(e) => onChange({ product_commission_percentage: e.target.value })}
              placeholder="Ex: 10"
            />
          </div>
          <p className="sm:col-span-2 text-[12px] text-muted-foreground -mt-2">
            Vão impressos no Contrato de Profissional Parceiro. A vaga guarda uma cópia editável destes valores.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Horário de trabalho</label>
          <Input
            type="text"
            value={value.work_schedule}
            onChange={(e) => onChange({ work_schedule: e.target.value })}
            placeholder="Ex: Seg-Sex 08h-18h, sáb 08h-12h"
          />
        </div>
        <div>
          <label className={labelClass}>Carga horária semanal (h)</label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={value.workload_hours}
            onChange={(e) => onChange({ workload_hours: e.target.value })}
            placeholder="Ex: 44"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Requisitos</label>
        <Textarea
          value={value.requirements}
          onChange={(e) => onChange({ requirements: e.target.value })}
          rows={2}
          placeholder="Pré-requisitos para a vaga/cargo"
        />
      </div>

      <div>
        <label className={labelClass}>Benefícios</label>
        <Textarea
          value={value.benefits}
          onChange={(e) => onChange({ benefits: e.target.value })}
          rows={2}
          placeholder="Ex: VT, VR, plano de saúde"
        />
      </div>
    </div>
  )
}
