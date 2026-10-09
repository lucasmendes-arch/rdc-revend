/**
 * Formatação de exibição. Fonte única: antes cada tela fazia
 * `R$ {valor.toFixed(2)}`, que mostra "R$ 49.90" (ponto americano) e sem
 * separador de milhar ("R$ 12500.00").
 */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 49.9 → "R$ 49,90"; 12500 → "R$ 12.500,00". Aceita string numérica do Postgres. */
export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0
  return BRL.format(Number.isFinite(n) ? (n as number) : 0)
}
