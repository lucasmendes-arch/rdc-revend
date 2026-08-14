// ─────────────────────────────────────────────────────────────────────────────
// Cliente do Trinks BackOffice
//
// O Trinks não expõe API pública aqui — o que usamos são os mesmos endpoints
// internos que a interface consome, autenticados com o cookie de sessão que o
// host Puppeteer mantém vivo por unidade.
//
// Dois formatos de resposta convivem:
//   • JSON limpo   — Agenda, ControleDeEntradaESaida (preferir sempre)
//   • {"Html":...} — Relatórios Financeiro/Comissões (tabela pronta pra render)
//
// Para os relatórios, em vez de parsear HTML usamos a exportação:
//   POST /BackOffice/Download/Exportar{Tela}  (mesmo payload da tela)
//   → {"Dados":{"UrlDownload":"https://prd-exportacoes.s3..."}}
//   → GET nessa URL devolve o CSV completo, sem paginação.
// A URL é pré-assinada e expira em poucos minutos: baixar na hora.
// ─────────────────────────────────────────────────────────────────────────────

export const TRINKS_BASE = 'https://www.trinks.com'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export interface TrinksSession {
  cookieString: string
  idConta: number | string
  idEstabelecimento: number | string
}

export function sessionHeaders(s: TrinksSession, extra: Record<string, string> = {}) {
  return {
    cookie: s.cookieString,
    'id-conta-logado': String(s.idConta),
    'id-estabelecimento-autenticado': String(s.idEstabelecimento),
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': UA,
    accept: '*/*',
    'accept-language': 'pt-BR,pt;q=0.9',
    origin: TRINKS_BASE,
    ...extra,
  }
}

/** O host devolve HTML de login quando a sessão morreu, em vez de 401. */
export function looksLikeLoginPage(body: string): boolean {
  const head = body.slice(0, 800).toLowerCase()
  return head.includes('<!doctype html') && (head.includes('login') || head.includes('entrar'))
}

// ── Datas ────────────────────────────────────────────────────────────────────

/** Hoje em America/Sao_Paulo — o Trinks opera em BRT; toISOString() erra o dia à noite. */
export function todaySaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** yyyy-mm-dd → dd/mm/yyyy (formato dos relatórios) */
export function toBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** dd/mm/yyyy (ou dd/mm/yyyy hh:mm:ss) → yyyy-mm-dd */
export function fromBR(value: string): string | null {
  const m = value?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** "1.234,56" → 1234.56 ; "R$ 90,00" → 90 ; "" → 0 */
export function parseBRNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (!value) return 0
  const cleaned = String(value)
    .replace(/[^\d,.\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * As exportações do Trinks vêm em Windows-1252, não UTF-8 — decodificar como
 * UTF-8 transforma "Serviço" em "Servi�o" e quebra o casamento de colunas.
 * Detecta pelo caractere de substituição e refaz em latin1.
 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('windows-1252').decode(bytes)
}

/** Parser de CSV com aspas, separador detectado (`;` ou `,`) e BOM removido. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? clean.length : clean.indexOf('\n'))
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === sep) { row.push(field); field = ''; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    if (c === '\r') continue
    field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  // Algumas exportações do Trinks abrem com linhas de título antes do cabeçalho:
  // usamos como cabeçalho a primeira linha com mais de uma coluna preenchida.
  const headerIdx = rows.findIndex(r => r.filter(c => c.trim()).length > 1)
  if (headerIdx === -1) return { headers: [], rows: [] }

  const headers = rows[headerIdx].map(h => h.trim())
  const out: Record<string, string>[] = []
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r.some(c => c.trim())) continue
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
    out.push(obj)
  }
  return { headers, rows: out }
}

/**
 * Localiza uma coluna por palavras-chave, sem depender do nome exato.
 * O cabeçalho das exportações do Trinks ainda não foi confirmado contra um CSV
 * real, então casar por heurística evita quebrar por diferença de acento,
 * maiúscula ou ordem de colunas. Ver `probe: true` no index.ts.
 */
// Descarta tudo que não é letra/dígito: os cabeçalhos do Trinks misturam "º",
// "°", "(R$)" e espaços que variam entre exportações. "Nº Fechamento" e
// "N° Fechamento" viram a mesma chave; "Comentário sobre o Fechamento", não.
const normHeader = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Casamento exato (ignorando acento/caixa/espaço) — usar sempre que o nome da
 * coluna já foi confirmado contra um CSV real. Cabeçalhos do Trinks têm nomes
 * que se contêm ("Total (R$)" vs "Total (R$) Serviço"), então busca por
 * substring escolhe a coluna errada.
 */
export function exactColumn(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const hit = headers.find(h => normHeader(h) === normHeader(c))
    if (hit) return hit
  }
  return null
}

export function findColumn(headers: string[], keywords: string[][]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const group of keywords) {
    const hit = headers.find(h => group.every(k => norm(h).includes(norm(k))))
    if (hit) return hit
  }
  return null
}

export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

// ── Chamadas ao Trinks ───────────────────────────────────────────────────────

export async function trinksPost(
  s: TrinksSession,
  path: string,
  body: string,
  timeoutMs = 60000,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${TRINKS_BASE}${path}`, {
    method: 'POST',
    headers: sessionHeaders(s, { 'Content-Type': 'application/x-www-form-urlencoded' }),
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, text: await res.text() }
}

export async function trinksGet(
  s: TrinksSession,
  path: string,
  timeoutMs = 60000,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${TRINKS_BASE}${path}`, {
    headers: sessionHeaders(s),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, text: await res.text() }
}

/**
 * Dispara a exportação de uma tela e baixa o CSV gerado.
 * `screen` é o sufixo de /BackOffice/Download/Exportar{screen}.
 */
export async function exportCsv(
  s: TrinksSession,
  screen: 'Financeiro' | 'Comissoes' | 'Clientes' | 'Produtos' | 'Servicos' | 'Agendamentos',
  payload: string,
): Promise<{ ok: boolean; csv?: string; detail?: string }> {
  // A exportação falha esporadicamente devolvendo 200 sem UrlDownload, mesmo
  // com movimento no período — confirmado em 28/07/2026: Teixeira/set-2025
  // voltou vazia no backfill e trouxe 707 linhas na retentativa. Sem o retry,
  // um mês inteiro de faturamento some silenciosamente.
  const ATTEMPTS = 2

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { status, text } = await trinksPost(s, `/BackOffice/Download/Exportar${screen}`, payload, 90000)

    if (status !== 200) return { ok: false, detail: `Exportar${screen} HTTP ${status}` }
    if (looksLikeLoginPage(text)) return { ok: false, detail: 'sessao_expirada' }

    let url: string | undefined
    try {
      url = JSON.parse(text)?.Dados?.UrlDownload
    } catch {
      return { ok: false, detail: `Exportar${screen}: resposta nao-JSON` }
    }

    if (!url) {
      if (attempt < ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      return { ok: false, detail: `Exportar${screen}: sem UrlDownload apos ${ATTEMPTS} tentativas` }
    }

    // A URL assinada expira em poucos minutos — baixar imediatamente.
    const csvRes = await fetch(url, { signal: AbortSignal.timeout(90000) })
    if (!csvRes.ok) return { ok: false, detail: `download CSV HTTP ${csvRes.status}` }

    return { ok: true, csv: decodeCsvBytes(await csvRes.arrayBuffer()) }
  }

  return { ok: false, detail: `Exportar${screen}: falhou` }
}

// ── Payloads das telas ───────────────────────────────────────────────────────

export function financeiroPayload(fromISO: string, toISO: string): string {
  return new URLSearchParams({
    TipoData: '2',
    DataInicio: toBR(fromISO),
    DataFim: toBR(toISO),
    ExibirEstornos: 'false',
    TipoFiltroTransacaoProduto: '0',
    IdFiltroPorDesconto: '0',
  }).toString()
}

export function comissoesPayload(fromISO: string, toISO: string): string {
  return new URLSearchParams({
    TipoData: '2',
    DataInicio: toBR(fromISO),
    DataFim: toBR(toISO),
    TipoItemPago: '0',
    ExibirEstornos: 'false',
    TipoStatusFiltroPagamento: '1',
    IdRelacaoProfissional: '0',
    temPagamentoProfissional: 'true',
  }).toString()
}

export function clientesPayload(fromISO: string, toISO: string): string {
  return new URLSearchParams({
    FiltroSelecionado: '0',
    ConteudoFiltro: '',
    Origem: '0',
    ClientesPodemAgendarOnline: '0',
    FiltroDataInicioCadastroCliente: toBR(fromISO),
    FiltroDataFimCadastroCliente: toBR(toISO),
    PeriodoAniversariante: '',
    ClientesQueRecebemSMS: '0',
    EnviarEmailAgendamentoCliente: '0',
    FiltrarApenasAtivos: 'true',
  }).toString()
}

/** Agenda: JSON estruturado, mesmo endpoint já validado nos fluxos n8n. */
export function agendaQuery(idEstabelecimento: string | number, fromISO: string, toISO: string): string {
  const p = new URLSearchParams({
    idEstabelecimento: String(idEstabelecimento),
    DataInicial: fromISO,
    DataFinal: toISO,
    TipoFiltroAgenda: 'AgendamentosCategoria',
    FechamentoContaSelecionado: '-1',
    page: '1',
    start: '0',
    limit: '2000',
    filter: '[{"property":null,"value":null}]',
  })
  // multi-valor: 9999 = ausência de profissional, demais = status de atendimento
  for (const st of ['9999', '3', '4', '6', '7', '8']) p.append('StatusSelecionados', st)
  return p.toString()
}
