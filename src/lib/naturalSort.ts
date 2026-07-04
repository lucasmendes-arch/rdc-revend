// Ordenação "natural" de nomes de produto: números embutidos comparam como
// número, não como texto — Tonalizante 2 vem antes do 10, e códigos com
// ponto (7.1, 7.12, 9.0) seguem a convenção de nuance de coloração.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}
