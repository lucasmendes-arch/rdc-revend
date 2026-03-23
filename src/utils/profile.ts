export type DocumentType = 'CPF' | 'CNPJ'

export interface ProfileData {
  document: string | null
  document_type: string | null
  address_city: string | null
  address_state: string | null
  full_name?: string | null
  phone?: string | null
  address_cep?: string | null
  address_street?: string | null
  address_number?: string | null
  address_neighborhood?: string | null
}

export const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]

export function isProfileIncomplete(profile: ProfileData | null): boolean {
  if (!profile) return true
  // For the catalog popup, we only care about document and location
  return !profile.document || !profile.address_city || !profile.address_state
}

export function applyDocMask(value: string, type: DocumentType) {
  const digits = value.replace(/\D/g, '')
  if (type === 'CPF') {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      .substring(0, 14)
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
    .substring(0, 18)
}
