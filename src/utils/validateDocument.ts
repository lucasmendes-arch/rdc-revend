// CPF validation using modulo 11 algorithm
export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false

  // Reject known invalid sequences (all same digit)
  if (/^(\d)\1{10}$/.test(digits)) return false

  // First check digit
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(digits[9])) return false

  // Second check digit
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(digits[10])) return false

  return true
}

// CNPJ validation using modulo 11 algorithm
export function isValidCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return false

  // Reject known invalid sequences
  if (/^(\d)\1{13}$/.test(digits)) return false

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  // First check digit
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weights1[i]
  }
  let remainder = sum % 11
  const check1 = remainder < 2 ? 0 : 11 - remainder
  if (check1 !== parseInt(digits[12])) return false

  // Second check digit
  sum = 0
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weights2[i]
  }
  remainder = sum % 11
  const check2 = remainder < 2 ? 0 : 11 - remainder
  if (check2 !== parseInt(digits[13])) return false

  return true
}

// Validate CPF or CNPJ based on length
export function isValidDocument(doc: string): { valid: boolean; type: 'CPF' | 'CNPJ' | null; error?: string } {
  const digits = doc.replace(/\D/g, '')

  if (digits.length === 11) {
    if (!isValidCPF(digits)) return { valid: false, type: 'CPF', error: 'CPF inválido. Verifique os dígitos.' }
    return { valid: true, type: 'CPF' }
  }

  if (digits.length === 14) {
    if (!isValidCNPJ(digits)) return { valid: false, type: 'CNPJ', error: 'CNPJ inválido. Verifique os dígitos.' }
    return { valid: true, type: 'CNPJ' }
  }

  return { valid: false, type: null, error: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.' }
}
