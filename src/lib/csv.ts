// Geração e download de CSV no dialeto que o Excel pt-BR entende sem
// perguntar nada ao usuário: separador ';' (o Excel em português trata ','
// como decimal e joga a linha inteira numa coluna só) e BOM de UTF-8 no
// começo do arquivo (sem ele, acento vira "Ã§" ao abrir por duplo clique).
// Quebra de linha CRLF pelo mesmo motivo — é o que a RFC 4180 pede e o que
// o Excel mais velho espera.
//
// Sem dependência nova: é string, Blob e um <a download> temporário.

const SEPARATOR = ';'
const BOM = '\uFEFF'
const NEWLINE = '\r\n'

export type CsvValue = string | number | null | undefined

// Um caractere de fórmula no início da célula faz o Excel/Sheets executarem
// o conteúdo ao abrir a planilha (CSV injection). Prefixo de aspa simples
// neutraliza sem mudar o que o usuário lê na tela.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function escapeCell(value: CsvValue): string {
  if (value == null) return ''

  // Número entra cru: '-12' precisa continuar sendo -12 pro Excel somar e
  // ordenar. A guarda de fórmula abaixo é só pra texto, onde '-' ou '='
  // no início é conteúdo, não sinal.
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  let cell = value
  if (FORMULA_PREFIXES.some((prefix) => cell.startsWith(prefix))) {
    cell = `'${cell}`
  }

  if (/[";\r\n]/.test(cell) || cell !== cell.trim()) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

/** Monta o texto do CSV a partir de uma matriz de linhas (a primeira normalmente é o cabeçalho). */
export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(escapeCell).join(SEPARATOR)).join(NEWLINE)
}

/** Monta o CSV e dispara o download no navegador. */
export function downloadCsv(filename: string, rows: CsvValue[][]): void {
  const blob = new Blob([BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revogar na hora cancela o download em alguns navegadores; o tick seguinte
  // já é depois do clique ter sido processado.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** 'Rei dos Cachos — Linhares' → 'rei-dos-cachos-linhares', pra usar em nome de arquivo. */
export function slugifyForFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
