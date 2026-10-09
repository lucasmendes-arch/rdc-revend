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

export type ReportType = 'financeiro' | 'clientes' | 'agendamentos' | 'comissoes' | 'ranking'

export function detectReport(text: string): ReportType | null {
  const rows = tokenize(text)
  if (rows.some(r => r[0] === 'Data de Atendimento/Venda' && r[1] === 'Data de Pagamento/Estorno')) return 'financeiro'
  if (rows.some(r => r[0] === 'CPF' && r.includes('Data de Cadastro'))) return 'clientes'
  if (rows.some(r => r[0] === 'Data' && r[1] === 'Hora' && r.includes('Serviço'))) return 'agendamentos'
  if (rows.some(r => r[0] === 'Atendimento/Venda' && r.includes('Valor Comissão'))) return 'comissoes'
  // Ranking de Profissionais: resumo fechado do período, sem data por linha —
  // não serve para filtro por dia/mês no dashboard. Reconhecido só para avisar.
  if (rows.some(r => r[0] === 'Posição' && r[1] === 'Profissional')) return 'ranking'
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

// ── Agendamentos ─────────────────────────────────────────────────────────────

// Colunas obrigatórias, localizadas pelo NOME: o Trinks acrescentou
// "Etiqueta do agendamento" no meio do cabeçalho em 2026, então a posição
// muda conforme a época da exportação.
export const AGENDAMENTOS_HEADER = [
  'Data', 'Hora', 'Profissional', 'Profissional da vez', 'Assistente', 'Categoria Serviço', 'Serviço',
  'Duração', 'Cliente', 'Sexo', 'Telefones', 'Email', 'Valor', 'Fechamento Conta', 'Status',
  'Cadastramento', 'Data de Cadastro do Cliente', 'Quem Realizou o Agendamento', 'Origem',
  'Observações', 'Etiqueta do cliente',
] as const

export interface AgendamentoRow {
  source_key: string
  appointment_date: string
  starts_at: string | null
  professional: string | null
  professional_on_duty: boolean | null
  assistant: string | null
  service_category: string | null
  service: string | null
  duration_min: number | null
  value: number
  status: string
  ticket_closed: boolean | null
  booked_at: string | null
  booked_by: string | null
  origin: string | null
  client_key: string | null
  client_name: string | null
  client_gender: string | null
  client_phones: string | null
  client_email: string | null
  client_registered_at: string | null
  client_tags: string | null
  appointment_tags: string | null
  notes: string | null
}

export interface AgendamentosReport {
  type: 'agendamentos'
  period_start: string
  period_end: string
  generated_at: string | null
  rows: AgendamentoRow[]
}

/** "60 min" → 60 ; "1h e 20 min" → 80 ; "2h" → 120 */
export function durationMinutes(v: string | undefined): number | null {
  const s = (v ?? '').trim()
  if (!s) return null
  const h = s.match(/(\d+)\s*h/)
  const m = s.match(/(\d+)\s*min/)
  if (!h && !m) return null
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

function checkHeader(header: string[], expected: readonly string[], label: string) {
  expected.forEach((h, i) => {
    if ((header[i] ?? '').trim() !== h) {
      throw new ReportError(`${label}: coluna ${i + 1} esperada "${h}", veio "${header[i] ?? ''}"`)
    }
  })
}

export function parseAgendamentos(text: string): AgendamentosReport {
  const rows = tokenize(text)
  assertNoRunawayField(rows)
  const hi = rows.findIndex(r => r[0] === 'Data' && r[1] === 'Hora')
  if (hi === -1) throw new ReportError('cabecalho do relatorio de agendamentos nao encontrado')
  const header = rows[hi].map(h => h.trim())
  const ix = Object.fromEntries(AGENDAMENTOS_HEADER.map(name => {
    const i = header.indexOf(name)
    if (i === -1) throw new ReportError(`agendamentos: coluna "${name}" ausente`)
    return [name, i]
  })) as Record<(typeof AGENDAMENTOS_HEADER)[number], number>
  const ixApptTag = header.indexOf('Etiqueta do agendamento')
  const minCols = Math.max(...Object.values(ix)) + 1

  const pre = preamble(rows, hi)
  // Uma linha só: "Data Inicio: 01/09/2024 - Data Fim: 31/12/2024"
  const per = pre.join(' ').match(/Data In[ií]cio:\s*(\d{2}\/\d{2}\/\d{4}).*Data Fim:\s*(\d{2}\/\d{2}\/\d{4})/)
  const start = brDate(per?.[1])
  const end = brDate(per?.[2])
  if (!start || !end) throw new ReportError('periodo (Data Inicio/Data Fim) nao encontrado no arquivo de agendamentos')

  const out: AgendamentoRow[] = []
  const occurrences = new Map<string, number>()
  for (const r of rows.slice(hi + 1)) {
    if (r.length < minCols) {
      if (r.every(c => !c.trim())) continue
      throw new ReportError(`linha de agendamento com ${r.length} colunas (esperado ${minCols})`)
    }
    const c = (name: (typeof AGENDAMENTOS_HEADER)[number]) => (r[ix[name]] ?? '').trim()
    const date = brDate(c('Data'))
    if (!date) throw new ReportError(`agendamento sem data: "${r.slice(0, 3).join(';')}"`)
    if (date < start || date > end) throw new ReportError(`agendamento em ${date} fora do periodo ${start}..${end}`)

    const name = c('Cliente')
    const phones = c('Telefones')
    // Pode vir "(27) 99999-0001 / (27) 3333-0001": o primeiro é o Telefone 1
    // do cadastro, que compõe a chave do cliente.
    const firstPhone = phones.split(/\s*[/,]\s*/)[0] ?? ''

    // Status, comanda, valor e observação mudam depois de marcado: fora do hash.
    const identity = [c('Data'), c('Hora'), c('Profissional'), c('Serviço'), name, phones, c('Cadastramento')].join('|')
    const n = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, n)

    const time = c('Hora').match(/^(\d{2}):(\d{2})/)
    const ticket = c('Fechamento Conta')
    out.push({
      source_key: `${stableHash(identity)}#${n}`,
      appointment_date: date,
      starts_at: time ? `${date}T${time[1]}:${time[2]}:00` : null,
      professional: c('Profissional') || null,
      professional_on_duty: yesNo(c('Profissional da vez')),
      assistant: c('Assistente') || null,
      service_category: c('Categoria Serviço') || null,
      service: c('Serviço') || null,
      duration_min: durationMinutes(c('Duração')),
      value: brNumber(c('Valor')),
      status: c('Status'),
      ticket_closed: ticket ? ticket.toLowerCase() === 'fechada' : null,
      booked_at: brDateTime(c('Cadastramento')),
      booked_by: c('Quem Realizou o Agendamento') || null,
      origin: c('Origem') || null,
      client_key: name ? clientKey(name, '', firstPhone) : null,
      client_name: name || null,
      client_gender: c('Sexo') || null,
      client_phones: phones || null,
      client_email: c('Email') || null,
      client_registered_at: brDateTime(c('Data de Cadastro do Cliente')),
      client_tags: c('Etiqueta do cliente') || null,
      appointment_tags: ixApptTag >= 0 ? (r[ixApptTag] ?? '').trim() || null : null,
      notes: c('Observações') || null,
    })
  }
  return { type: 'agendamentos', period_start: start, period_end: end, generated_at: generatedAt(pre), rows: out }
}

// ── Comissões ────────────────────────────────────────────────────────────────

export const COMISSOES_HEADER = [
  'Atendimento/Venda', 'Pagamento / Estorno', 'Data de Liberação da Comissão', 'Profissional',
  'Assistente', 'Serviço/Produto/Pacote', 'Categoria', 'Consumo de Pacote', 'Cliente', 'CPF', 'Valor',
  'Desconto Cliente', 'Desconto administrativo', 'Pago em', 'Motivo de Desconto', 'Custo operacional',
  'Valor Base Comissão', '% Comissão', 'Desconto Operadora', 'Valor Comissão', 'Taxa de Comanda',
  'Quem registrou a transação', 'Comissão para',
] as const

export interface ComissaoRow {
  source_key: string
  business_date: string
  paid_at: string | null
  service_date: string | null
  commission_release_on: string | null
  professional: string | null
  assistant: string | null
  item_name: string
  category: string | null
  package_consumption: boolean
  client_name: string | null
  client_cpf: string | null
  value: number
  client_discount: number
  admin_discount: number
  discount_reason: string | null
  paid_with: string | null
  operational_cost: number
  commission_base: number
  commission_pct: number | null
  acquirer_discount: number
  commission_value: number
  ticket_fee: number
  registered_by: string | null
  commission_to: string | null
}

export interface ComissoesReport {
  type: 'comissoes'
  period_start: string
  period_end: string
  generated_at: string | null
  rows: ComissaoRow[]
  file_total: number | null
  file_commission_total: number | null
}

export function parseComissoes(text: string): ComissoesReport {
  const rows = tokenize(text)
  assertNoRunawayField(rows)
  const hi = rows.findIndex(r => r[0] === COMISSOES_HEADER[0])
  if (hi === -1) throw new ReportError('cabecalho do relatorio de comissoes nao encontrado')
  checkHeader(rows[hi], COMISSOES_HEADER, 'comissoes')

  const pre = preamble(rows, hi)
  // Regime de caixa, como o financeiro: o dia é o do pagamento.
  if (pre[0] !== 'Data de Pagamento/Estorno') {
    throw new ReportError(`exporte as comissoes filtrando por "Data de Pagamento/Estorno" (veio "${pre[0] ?? ''}")`)
  }
  const start = brDate(pre.find(l => l.startsWith('Data Início:'))?.split(':')[1])
  const end = brDate(pre.find(l => l.startsWith('Data Fim:'))?.split(':')[1])
  if (!start || !end) throw new ReportError('periodo (Data Início/Data Fim) nao encontrado no arquivo de comissoes')

  const out: ComissaoRow[] = []
  const occurrences = new Map<string, number>()
  let fileTotal: number | null = null
  let fileCommission: number | null = null

  for (const r of rows.slice(hi + 1)) {
    // Linha de total: 9 vazias + rótulo; Valor em [10], Valor Comissão em [19].
    if (r[9] === 'Total (R$):') { fileTotal = brNumber(r[10]); fileCommission = brNumber(r[19]); break }
    if (r.length < COMISSOES_HEADER.length) {
      if (r.every(c => !c.trim())) continue
      throw new ReportError(`linha de comissao com ${r.length} colunas (esperado ${COMISSOES_HEADER.length})`)
    }
    const businessDate = brDate(r[1])
    if (!businessDate) throw new ReportError(`item sem data de pagamento: "${r.slice(0, 6).join(';')}"`)
    if (businessDate < start || businessDate > end) {
      throw new ReportError(`item em ${businessDate} fora do periodo ${start}..${end}`)
    }
    const item = r[5].trim()
    if (!item) throw new ReportError(`item sem nome em ${businessDate}`)

    // Comissão, liberação e forma de pagamento podem ser ajustadas depois: fora do hash.
    const identity = [r[0], r[1], r[3], r[4], item, r[8], r[9], r[10], r[11]].map(x => x.trim()).join('|')
    const n = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, n)

    const pct = r[17].trim()
    out.push({
      source_key: `${stableHash(identity)}#${n}`,
      business_date: businessDate,
      paid_at: brDateTime(r[1]),
      service_date: brDate(r[0]),
      commission_release_on: brDate(r[2]),
      professional: r[3].trim() || null,
      assistant: r[4].trim() || null,
      item_name: item,
      category: r[6].trim() || null,
      package_consumption: r[7].trim().toUpperCase() === 'SIM',
      client_name: r[8].trim() || null,
      client_cpf: r[9].replace(/\D/g, '') || null,
      value: brNumber(r[10]),
      client_discount: Math.abs(brNumber(r[11])),
      admin_discount: Math.abs(brNumber(r[12])),
      discount_reason: r[14].trim() || null,
      paid_with: r[13].trim() || null,
      operational_cost: brNumber(r[15]),
      commission_base: brNumber(r[16]),
      // Comissão de valor fixo vem como texto ("comissão informada"), sem percentual.
      commission_pct: /^-?[\d.,]+\s*%?$/.test(pct) ? brNumber(pct.replace('%', '')) : null,
      acquirer_discount: Math.abs(brNumber(r[18])),
      commission_value: brNumber(r[19]),
      ticket_fee: brNumber(r[20]),
      registered_by: r[21].trim() || null,
      commission_to: r[22].trim() || null,
    })
  }

  // Conferência dupla com o rodapé do Trinks: valor dos itens e comissão.
  if (fileTotal !== null) {
    const sum = out.reduce((a, x) => a + x.value, 0)
    const com = out.reduce((a, x) => a + x.commission_value, 0)
    if (Math.abs(sum - fileTotal) > 0.05) {
      throw new ReportError(`soma dos itens ${sum.toFixed(2)} difere do total do arquivo ${fileTotal.toFixed(2)}`)
    }
    if (fileCommission !== null && Math.abs(com - fileCommission) > 0.05) {
      throw new ReportError(`soma das comissoes ${com.toFixed(2)} difere do total do arquivo ${fileCommission.toFixed(2)}`)
    }
  }

  return {
    type: 'comissoes', period_start: start, period_end: end, generated_at: generatedAt(pre),
    rows: out, file_total: fileTotal, file_commission_total: fileCommission,
  }
}
