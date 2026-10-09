// ─────────────────────────────────────────────────────────────────────────────
// Parsers dos relatórios exportados pela tela do Trinks (CSV)
//
// Usado pelo importador local (scripts/trinks-import.ts) e, no futuro, por um
// upload pelo dashboard. Módulo puro: sem Deno, sem rede, sem banco.
//
// Formato confirmado em 08/10/2026 (exportações de Linhares e Colatina):
//   • Windows-1252, separador ";", campos entre aspas, comentários com quebra
//     de linha DENTRO das aspas — por isso um tokenizador de verdade.
//   • Financeiro: preâmbulo (tipo de data, período, "gerado em"), cabeçalho de
//     28 colunas, um fechamento por linha, uma linha "Total (R$):", depois uma
//     SEGUNDA tabela (abertura de caixa / sangria) que não usamos.
//   • Clientes: preâmbulo de filtros, cabeçalho de 28 colunas, um cliente por
//     linha. Só lista clientes ATIVOS e não traz o ID do Trinks.
// ─────────────────────────────────────────────────────────────────────────────

export function decodeReport(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
  return text.replace(/^﻿/, '')
}

/**
 * Tokenizador CSV (";" e aspas, com quebra de linha dentro de campo).
 *
 * Tolerante a aspas não escapadas: o Trinks exporta nomes como
 * `"Fulana "Apelido" Silva"` sem dobrar as aspas internas. Num parser estrito
 * isso abre um campo que engole o resto do arquivo — em Linhares, 3,5 mil dos
 * 6,3 mil clientes sumiam em silêncio. Aqui a aspa só fecha o campo quando
 * vem seguida de separador, quebra de linha ou fim do texto.
 */
export function tokenize(text: string, sep = ';'): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        const next = text[i + 1]
        if (next === '"') { field += '"'; i++ }
        else if (next === undefined || next === sep || next === '\n' || next === '\r') quoted = false
        else field += '"'
      } else field += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === sep) { row.push(field); field = ''; continue }
    if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; continue }
    if (c === '\r') continue
    field += c
  }
  if (field || row.length) { row.push(field); out.push(row) }
  return out
}

/** "1.234,56" → 1234.56 ; "-20,00" → -20 ; "" → 0 */
export function brNumber(v: string | undefined): number {
  if (!v) return 0
  const n = Number(v.trim().replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) throw new Error(`numero invalido: "${v}"`)
  return n
}

/** "dd/mm/yyyy" (com ou sem hora) → "yyyy-mm-dd" */
export function brDate(v: string | undefined): string | null {
  const m = v?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** "dd/mm/yyyy hh:mm" → "yyyy-mm-ddThh:mm:00" (hora local de Brasília, sem fuso) */
export function brDateTime(v: string | undefined): string | null {
  const m = v?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}` : null
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Hash estável (FNV-1a 64 bits em hex) — só para chave de deduplicação. */
export function stableHash(s: string): string {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const bytes = new TextEncoder().encode(s)
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * prime) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

/** Campo gigante = aspa desbalanceada engolindo linhas. Melhor recusar que perder dado. */
function assertNoRunawayField(rows: string[][]) {
  for (const r of rows) {
    for (const f of r) {
      if (f.length > 5000) throw new ReportError('campo com mais de 5000 caracteres: aspas desbalanceadas no arquivo')
    }
  }
}

function preamble(rows: string[][], headerIdx: number): string[] {
  return rows.slice(0, headerIdx).map(r => r.join(' ').trim()).filter(Boolean)
}

function generatedAt(lines: string[]): string | null {
  const l = lines.find(x => x.startsWith('Relatório gerado em'))
  const m = l?.match(/(\d{2})\/(\d{2})\/(\d{4}) às (\d{2}):(\d{2})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00` : null
}

// ── Financeiro ───────────────────────────────────────────────────────────────

export const FINANCEIRO_HEADER = [
  'Data de Atendimento/Venda', 'Data de Pagamento/Estorno', 'Tipo', 'ID Cliente', 'Nome do Cliente',
  'Total (R$) Serviço', 'Quantidade Serviço', 'Total (R$) Produtos', 'Quantidade Produto UN',
  'Total (R$) Pacotes', 'Quantidade Pacotes', 'Total (R$) Vale-Presente', 'Quantidade Vale-Presente',
  'Total (R$) Crédito Cliente', 'Total (R$) Descontos', 'Motivo Desconto', 'Total (R$) Crédito',
  'Total (R$) Débito', 'Total (R$) Dinheiro', 'Total (R$) Pré-Pago', 'Total (R$) Outros',
  'Total (R$) Troco', 'Total (R$) Gorjeta', 'Total (R$)', 'Quem Fechou a Conta',
  'Comentário sobre o Fechamento', 'Comentário sobre o Estorno', 'Nº Fechamento',
] as const

export interface FinanceiroRow {
  source_key: string
  business_date: string
  paid_at: string | null
  service_date: string | null
  kind: 'pagamento' | 'estorno'
  trinks_client_id: number | null
  client_name: string | null
  services_total: number
  services_qty: number
  products_total: number
  products_qty: number
  packages_total: number
  packages_qty: number
  gift_cards_total: number
  client_credit_total: number
  discounts: number
  discount_reason: string | null
  pay_credit: number
  pay_debit: number
  pay_cash: number
  pay_prepaid: number
  pay_other: number
  change_given: number
  tip: number
  total: number
  closed_by: string | null
  comment: string | null
}

export interface FinanceiroReport {
  type: 'financeiro'
  period_start: string
  period_end: string
  generated_at: string | null
  rows: FinanceiroRow[]
  /** "Total (R$):" do próprio arquivo, para conferir a soma. */
  file_total: number | null
}

export interface ClientesReport {
  type: 'clientes'
  generated_at: string | null
  only_active: boolean
  rows: ClienteRow[]
}

export class ReportError extends Error {}

export function detectReport(text: string): 'financeiro' | 'clientes' | null {
  const rows = tokenize(text)
  if (rows.some(r => r[0] === 'Data de Atendimento/Venda' && r[1] === 'Data de Pagamento/Estorno')) return 'financeiro'
  if (rows.some(r => r[0] === 'CPF' && r.includes('Data de Cadastro'))) return 'clientes'
  return null
}

export function parseFinanceiro(text: string): FinanceiroReport {
  const rows = tokenize(text)
  assertNoRunawayField(rows)
  const hi = rows.findIndex(r => r[0] === FINANCEIRO_HEADER[0])
  if (hi === -1) throw new ReportError('cabecalho do relatorio financeiro nao encontrado')

  const header = rows[hi].map(h => h.trim())
  FINANCEIRO_HEADER.forEach((h, i) => {
    if (header[i] !== h) throw new ReportError(`coluna ${i + 1} esperada "${h}", veio "${header[i]}"`)
  })

  const pre = preamble(rows, hi)
  // Regime de caixa: o dashboard conta o dia do PAGAMENTO. Uma exportação
  // filtrada por data de atendimento deixaria as bordas do período parciais.
  if (pre[0] !== 'Data de Pagamento/Estorno') {
    throw new ReportError(`exporte filtrando por "Data de Pagamento/Estorno" (veio "${pre[0] ?? ''}")`)
  }
  const start = brDate(pre.find(l => l.startsWith('Data Início:'))?.split(':')[1])
  const end = brDate(pre.find(l => l.startsWith('Data Fim:'))?.split(':')[1])
  if (!start || !end) throw new ReportError('periodo (Data Início/Data Fim) nao encontrado no arquivo')

  const out: FinanceiroRow[] = []
  const occurrences = new Map<string, number>()
  let fileTotal: number | null = null

  for (const r of rows.slice(hi + 1)) {
    // Linha de total: 3 vazias + rótulo + os totais a partir de "Serviço", sem
    // as colunas de texto finais — o "Total (R$)" geral cai na posição 22.
    if (r[3] === 'Total (R$):') { fileTotal = brNumber(r[22]); break }
    if (r.length < FINANCEIRO_HEADER.length) {
      if (r.every(c => !c.trim())) continue
      break  // começou a tabela de caixa
    }
    const businessDate = brDate(r[1])
    if (!businessDate) throw new ReportError(`linha sem data de pagamento: "${r.slice(0, 3).join(';')}"`)
    if (businessDate < start || businessDate > end) {
      throw new ReportError(`fechamento em ${businessDate} fora do periodo ${start}..${end}`)
    }

    const tipo = r[2].trim().toLowerCase()
    if (tipo !== 'pagamento' && tipo !== 'estorno') throw new ReportError(`Tipo desconhecido: "${r[2]}"`)

    // Campos imutáveis do fechamento. Comentário, quem fechou e o rateio das
    // formas de pagamento ficam de fora: são editáveis no Trinks.
    const identity = [r[0], r[1], r[2], r[3], r[5], r[7], r[9], r[11], r[13], r[14], r[23]]
      .map(s => s.trim()).join('|')
    const n = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, n)

    const clientId = Number(r[3])
    out.push({
      source_key: `${stableHash(identity)}#${n}`,
      business_date: businessDate,
      paid_at: brDateTime(r[1]),
      service_date: brDate(r[0]),
      kind: tipo as 'pagamento' | 'estorno',
      trinks_client_id: r[3] && Number.isFinite(clientId) ? clientId : null,
      client_name: r[4].trim() || null,
      services_total: brNumber(r[5]),
      services_qty: Math.round(brNumber(r[6])),
      products_total: brNumber(r[7]),
      products_qty: brNumber(r[8]),
      packages_total: brNumber(r[9]),
      packages_qty: Math.round(brNumber(r[10])),
      gift_cards_total: brNumber(r[11]),
      client_credit_total: brNumber(r[13]),
      discounts: Math.abs(brNumber(r[14])),
      discount_reason: r[15].trim() || null,
      pay_credit: brNumber(r[16]),
      pay_debit: brNumber(r[17]),
      pay_cash: brNumber(r[18]),
      pay_prepaid: brNumber(r[19]),
      pay_other: brNumber(r[20]),
      change_given: Math.abs(brNumber(r[21])),
      tip: brNumber(r[22]),
      total: brNumber(r[23]),
      closed_by: r[24].trim() || null,
      comment: r[25].trim() || null,
    })
  }

  // Conferência com o total impresso pelo Trinks: se divergir, o parser leu
  // errado (coluna deslocada, linha perdida) e nada deve ser gravado.
  if (fileTotal !== null) {
    const sum = out.reduce((a, x) => a + x.total, 0)
    if (Math.abs(sum - fileTotal) > 0.05) {
      throw new ReportError(`soma dos fechamentos ${sum.toFixed(2)} difere do total do arquivo ${fileTotal.toFixed(2)}`)
    }
  }

  return { type: 'financeiro', period_start: start, period_end: end, generated_at: generatedAt(pre), rows: out, file_total: fileTotal }
}

// ── Clientes ─────────────────────────────────────────────────────────────────

export interface ClienteRow {
  client_key: string
  name: string
  cpf: string | null
  gender: string | null
  phone_1: string | null
  phone_2: string | null
  email: string | null
  birth_date: string | null
  registered_on: string | null
  origin: string | null
  acquisition_channel: string | null
  notes: string | null
  tags: string[] | null
  instagram: string | null
  first_appointment_on: string | null
  first_appointment_status: string | null
  last_appointment_on: string | null
  last_appointment_status: string | null
  can_book_online: boolean | null
  accepts_sms: boolean | null
  accepts_email: boolean | null
  accepts_loyalty_email: boolean | null
  cep: string | null
  state: string | null
  address: string | null
  address_number: string | null
  address_complement: string | null
  neighborhood: string | null
  city: string | null
}

const yesNo = (v: string | undefined) => {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'sim' ? true : s === 'não' || s === 'nao' ? false : null
}

const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '')

/** CPF quando existe; senão nome normalizado + telefone (famílias dividem telefone). */
export function clientKey(name: string, cpf: string, phone: string): string {
  const c = digits(cpf)
  if (c.length === 11) return `cpf:${c}`
  return `np:${norm(name)}|${digits(phone)}`
}

export function parseClientes(text: string): ClientesReport {
  const rows = tokenize(text)
  assertNoRunawayField(rows)
  const hi = rows.findIndex(r => r[0] === 'CPF' && r.includes('Data de Cadastro'))
  if (hi === -1) throw new ReportError('cabecalho do relatorio de clientes nao encontrado')

  const header = rows[hi].map(h => h.trim())
  const col = (name: string) => {
    const i = header.indexOf(name)
    if (i === -1) throw new ReportError(`coluna "${name}" ausente no relatorio de clientes`)
    return i
  }
  const optCol = (name: string) => header.indexOf(name)
  const c = {
    cpf: col('CPF'), origin: col('Origem'), name: col('Nome'), gender: col('Gênero'),
    phone1: col('Telefone 1'), phone2: optCol('Telefone 2'), email: col('E-mail'),
    birth: col('Data de Nascimento'), registered: col('Data de Cadastro'), notes: optCol('Observações'),
    online: optCol('Pode agendar online'), firstAppt: optCol('Primeiro agendamento'),
    lastAppt: optCol('Último agendamento'), firstStatus: optCol('Status do primeiro agendamento'),
    lastStatus: optCol('Status do último agendamento'), sms: optCol('Recebe SMS'),
    emailAppt: optCol('Recebe e-mails agendamentos'),
    loyalty: optCol('Recebe e-mail sobre Programa de Fidelidade'), cep: optCol('CEP'),
    state: optCol('Estado'), address: optCol('Endereço'), number: optCol('Número'),
    complement: optCol('Complemento'), neighborhood: optCol('Bairro'), city: optCol('Cidade'),
    channel: optCol('Como nos conheceu'), tags: optCol('Etiquetas'), instagram: optCol('Instagram'),
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '') || null

  const pre = preamble(rows, hi)
  const byKey = new Map<string, ClienteRow>()

  for (const r of rows.slice(hi + 1)) {
    if (r.length < header.length - 1) {
      if (r.every(x => !x.trim())) continue
      throw new ReportError(`linha de cliente com ${r.length} colunas (esperado ${header.length})`)
    }
    const name = get(r, c.name)
    if (!name) continue

    const tagText = get(r, c.tags)
    const row: ClienteRow = {
      client_key: clientKey(name, r[c.cpf] ?? '', r[c.phone1] ?? ''),
      name,
      cpf: digits(r[c.cpf]) || null,
      gender: get(r, c.gender),
      phone_1: get(r, c.phone1),
      phone_2: get(r, c.phone2),
      email: get(r, c.email),
      // Datas absurdas ("07/01/1904") existem no cadastro: guardamos como vieram.
      birth_date: brDate(r[c.birth]),
      registered_on: brDate(r[c.registered]),
      origin: get(r, c.origin),
      acquisition_channel: get(r, c.channel),
      notes: get(r, c.notes),
      // Etiquetas vêm separadas por " / ".
      tags: tagText ? tagText.split(/\s*\/\s*/).map(t => t.trim()).filter(Boolean) : null,
      instagram: get(r, c.instagram),
      first_appointment_on: brDate(r[c.firstAppt]),
      first_appointment_status: get(r, c.firstStatus),
      last_appointment_on: brDate(r[c.lastAppt]),
      last_appointment_status: get(r, c.lastStatus),
      can_book_online: yesNo(r[c.online]),
      accepts_sms: yesNo(r[c.sms]),
      accepts_email: yesNo(r[c.emailAppt]),
      accepts_loyalty_email: yesNo(r[c.loyalty]),
      cep: get(r, c.cep),
      state: get(r, c.state),
      address: get(r, c.address),
      address_number: get(r, c.number),
      address_complement: get(r, c.complement),
      neighborhood: get(r, c.neighborhood),
      city: get(r, c.city),
    }
    // Mesma pessoa duas vezes no arquivo (cadastro duplicado no Trinks): fica a
    // de cadastro mais antigo, que é o que conta como "cliente novo".
    const prev = byKey.get(row.client_key)
    if (!prev || (row.registered_on ?? '9999') < (prev.registered_on ?? '9999')) byKey.set(row.client_key, row)
  }

  return {
    type: 'clientes',
    generated_at: generatedAt(pre),
    only_active: pre.some(l => l.includes('Listar clientes ativos')),
    rows: [...byKey.values()],
  }
}
