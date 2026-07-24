// Shapes de linha do módulo DP, compartilhadas entre a página de Contratação
// (kanban) e a página de Colaboradores (ativos) — ambas abrem o mesmo
// ProcessoDetailModal.
import type { EmploymentType, DocumentSlug, DocumentStatus, ContractType } from '@/lib/dpConstants'

export interface ProcessoCandidateAnswer {
  value: string
  form_fields: { field_key: string; label: string; field_type: string; show_on_card: boolean } | null
}
export interface ProcessoCandidateTag { tags: { id: string; name: string; color: string } | null }

export interface Processo {
  id: string
  candidate_id: string
  employment_type: EmploymentType
  store_id: string
  role_title: string
  current_stage: string
  status: 'em_andamento' | 'ativo' | 'encerrado'
  started_at: string
  activated_at: string | null
  onboarding_completed: boolean
  training_applicable: boolean
  training_completed: boolean
  drive_folder_url: string | null
  experience_renewed_at: string | null
  created_at: string
  updated_at: string
  candidates: {
    id: string
    name: string
    age: number | null
    whatsapp: string
    photo_url: string | null
    assignee_id: string | null
    source: 'formulario' | 'manual'
    notes: string | null
    start_date: string | null
    due_date: string | null
    resume_url: string | null
    candidate_answers: ProcessoCandidateAnswer[]
    candidate_tags: ProcessoCandidateTag[]
  } | null
  stores: { name: string } | null
}

export interface TimelineEntry {
  id: string
  occurred_at: string
  note: string
  source: 'rh' | 'dp'
}

export interface DocumentRow {
  id: string
  document_type: DocumentSlug
  status: DocumentStatus
  file_url: string | null
}

export interface ContractRow {
  id: string
  contract_type: ContractType
  signature_date: string | null
  term_start: string | null
  term_end: string | null
  file_url: string | null
}

export interface ContractPersonalData {
  process_id: string
  cpf: string | null
  rg: string | null
  cnpj: string | null
  birth_date: string | null
  marital_status: string | null
  nationality: string
  address: string | null
  email: string | null
  bank_name: string | null
  bank_agency: string | null
  bank_account: string | null
  pix_key: string | null
}
