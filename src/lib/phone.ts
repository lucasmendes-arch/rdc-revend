// Máscara de telefone/WhatsApp padrão do projeto — mesma regra usada no
// formulário público de candidatura (src/components/rh/FormFieldRenderer.tsx),
// reaproveitada em qualquer outro campo de telefone/WhatsApp do admin.
export function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}
