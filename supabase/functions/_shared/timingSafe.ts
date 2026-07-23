// Comparação de segredos em tempo constante. `===`/`!==` em string faz
// short-circuit no primeiro byte diferente, então o tempo de resposta vaza
// quantos caracteres do prefixo o atacante acertou — dá pra reconstruir o
// segredo byte a byte. Usado na verificação de assinatura do webhook do
// MercadoPago e no header x-automation-secret da automação de contratos.
// Adicionado no checkup de 2026-07-23 (item S-04).
export function timingSafeEqual(a: string, b: string): boolean {
  // O comprimento em si não é segredo (é fixo pros dois usos), então sair
  // cedo aqui não vaza nada útil — e evita comparar buffers de tamanhos
  // diferentes.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
