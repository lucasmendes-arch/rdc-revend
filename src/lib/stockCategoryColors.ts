// Paleta pastel fixa pra categorias de estoque (stock_categories.color_index).
// Tons suaves de propósito — identificação visual rápida, sem chamar
// atenção demais na tela de contagem.
export const STOCK_CATEGORY_PALETTE = [
  { bg: '#FCE7F3', text: '#9D174D' }, // rosa
  { bg: '#DBEAFE', text: '#1E40AF' }, // azul
  { bg: '#D1FAE5', text: '#065F46' }, // verde
  { bg: '#FEF3C7', text: '#92400E' }, // amarelo
  { bg: '#EDE9FE', text: '#5B21B6' }, // roxo
  { bg: '#FFEDD5', text: '#9A3412' }, // laranja
  { bg: '#CCFBF1', text: '#115E59' }, // teal
  { bg: '#FEE2E2', text: '#991B1B' }, // vermelho
  { bg: '#E0E7FF', text: '#3730A3' }, // índigo
  { bg: '#ECFCCB', text: '#3F6212' }, // lima
] as const

export function getCategoryColor(colorIndex: number | null | undefined) {
  if (colorIndex == null) return STOCK_CATEGORY_PALETTE[0]
  return STOCK_CATEGORY_PALETTE[colorIndex % STOCK_CATEGORY_PALETTE.length]
}
