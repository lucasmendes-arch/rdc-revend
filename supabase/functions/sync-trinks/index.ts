// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  addDays, agendaQuery, clientesPayload, comissoesPayload, exactColumn, exportCsv,
  financeiroPayload, findColumn, fromBR, looksLikeLoginPage, normalizeKey, parseBRNumber,
  parseCsv, todaySaoPaulo, trinksGet, type TrinksSession,
} from './trinks.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

// ─────────────────────────────────────────────────────────────────────────────
// sync-trinks
//
// Coleta os dados do Trinks de uma unidade e grava nas tabelas trinks_*.
// Chamada pelo pg_cron (uma invocação por unidade, escalonada) ou à mão.
//
// Body: {
//   store_id?: uuid      — unidade; ausente = todas as ativas (sequencial)
//   date_from?, date_to? — janela ISO; padrão = ontem..hoje
//   probe?: boolean      — não grava nada, devolve cabeçalhos dos CSVs
//   force_session?: bool — ignora o cache de sessão
// }
//
// Auth: header x-trinks-secret (internal_config.trinks_sync_secret).
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_MAX_AGE_MS = 25 * 60 * 1000
const EXPENSES_MAX_WINDOW_DAYS = 7

interface UnitRow {
  store_id: string
  trinks_establishment_id: number
  cookie_route: string
  display_name: string
}

interface DayAccumulator {
  gross_revenue: number
  services_revenue: number
  products_revenue: number
  packages_revenue: number
  discounts: number
  expenses: number
  tickets: Set<string>
  new_customers: number
  appointments_total: number
  appointments_done: number
  no_shows: number
  cancellations: number
}

const emptyDay = (): DayAccumulator => ({
  gross_revenue: 0, services_revenue: 0, products_revenue: 0, packages_revenue: 0,
  discounts: 0, expenses: 0, tickets: new Set(), new_customers: 0,
  appointments_total: 0, appointments_done: 0, no_shows: 0, cancellations: 0,
})

function dayOf(map: Map<string, DayAccumulator>, date: string): DayAccumulator {
  let d = map.get(date)
  if (!d) { d = emptyDay(); map.set(date, d) }
  return d
}

// ── Sessão ───────────────────────────────────────────────────────────────────

async function fetchFreshSession(unit: UnitRow): Promise<TrinksSession> {
  // O host faz login real com Puppeteer: 17–47s observados, e não aguenta
  // chamadas concorrentes. O cron escalona as unidades justamente por isso.
  const res = await fetch(unit.cookie_route, { signal: AbortSignal.timeout(150000) })
  if (!res.ok) throw new Error(`cookie host HTTP ${res.status}`)
  const s = await res.json()
  if (!s?.cookieString) throw new Error('cookie host: resposta sem cookieString')
  return { cookieString: s.cookieString, idConta: s.idConta, idEstabelecimento: s.idEstabelecimento }
}

async function getSession(
  db: any, unit: UnitRow, force: boolean,
): Promise<{ session: TrinksSession; cached: boolean }> {
  if (!force) {
    const { data } = await db
      .from('trinks_sessions')
      .select('cookie_string, id_conta, id_estab, fetched_at')
      .eq('store_id', unit.store_id)
      .maybeSingle()

    if (data && Date.now() - new Date(data.fetched_at).getTime() < SESSION_MAX_AGE_MS) {
      return {
        session: {
          cookieString: data.cookie_string,
          idConta: data.id_conta,
          idEstabelecimento: data.id_estab,
        },
        cached: true,
      }
    }
  }

  const session = await fetchFreshSession(unit)
  await db.from('trinks_sessions').upsert({
    store_id: unit.store_id,
    cookie_string: session.cookieString,
    id_conta: session.idConta,
    id_estab: session.idEstabelecimento,
    fetched_at: new Date().toISOString(),
    last_ok_at: new Date().toISOString(),
    failures: 0,
  }, { onConflict: 'store_id' })

  return { session, cached: false }
}

// ── Parsers dos relatórios ───────────────────────────────────────────────────
//
// Nomes de coluna confirmados contra CSVs reais em 28/07/2026 (probe na unidade
// de Linhares). Casamento EXATO: vários cabeçalhos se contêm — "Total (R$)" é
// prefixo de "Total (R$) Serviço", "Total (R$) Produtos" etc., então busca por
// substring pega a coluna errada. `findColumn` fica só como fallback.

/**
 * CSV do relatório financeiro: uma linha por FECHAMENTO DE CONTA (comanda),
 * com os totais já separados por natureza. Não traz o nome dos itens — o
 * ranking de serviços/produtos vem do CSV de comissões.
 */
function parseFinanceiro(
  csv: string, days: Map<string, DayAccumulator>, window: { from: string; to: string },
) {
  const { headers, rows } = parseCsv(csv)

  // Regime de CAIXA: o filtro do relatório (TipoData=2) é por data de
  // pagamento, então é essa a data que define o dia. Usar a data de atendimento
  // faria um pagamento tardio cair fora da janela consultada e sobrescrever um
  // dia antigo com valor parcial — foi o que produziu "34 dias" num mês de 31.
  const colDate     = exactColumn(headers, ['Data de Pagamento/Estorno', 'Data de Atendimento/Venda'])
  const colTotal    = exactColumn(headers, ['Total (R$)'])
  const colServices = exactColumn(headers, ['Total (R$) Serviço'])
  const colProducts = exactColumn(headers, ['Total (R$) Produtos'])
  const colPackages = exactColumn(headers, ['Total (R$) Pacotes'])
  const colDiscount = exactColumn(headers, ['Total (R$) Descontos'])
  // Sem fallback por substring aqui de propósito: "Comentário sobre o
  // Fechamento" também contém "fechamento" e é uma coluna vazia.
  const colTicket   = exactColumn(headers, ['Nº Fechamento', 'N° Fechamento', 'No Fechamento'])

  const missing: string[] = []
  if (!colDate) missing.push('Data de Atendimento/Venda')
  if (!colTotal) missing.push('Total (R$)')
  if (missing.length) return { missing, headers }

  for (const row of rows) {
    const date = fromBR(row[colDate!])
    // Fora da janela consultada o dado seria parcial (só o que foi pago dentro
    // do filtro), e o upsert sobrescreveria um dia já correto.
    if (!date || date < window.from || date > window.to) continue

    const day = dayOf(days, date)
    day.gross_revenue += parseBRNumber(row[colTotal!])
    if (colServices) day.services_revenue += parseBRNumber(row[colServices])
    if (colProducts) day.products_revenue += parseBRNumber(row[colProducts])
    if (colPackages) day.packages_revenue += parseBRNumber(row[colPackages])
    // O CSV traz desconto como valor negativo; guardamos o módulo para exibir.
    if (colDiscount) day.discounts += Math.abs(parseBRNumber(row[colDiscount]))

    // Cada linha do CSV é um fechamento de conta. A coluna "Nº Fechamento"
    // existe no cabeçalho mas vem vazia nas exportações observadas, então a
    // contagem é por linha — que é exatamente o número de comandas do dia.
    const ticketId = (colTicket ? row[colTicket] : '') || `linha-${day.tickets.size + 1}`
    day.tickets.add(ticketId)
  }

  return { missing, headers }
}

/**
 * O CSV de comissões não marca o tipo do item, e a categoria cadastrada no
 * Trinks é o tipo do produto, não a natureza — as categorias reais observadas
 * em Linhares foram "Shampoo", "Ativador", "Máscara", "Spray" (produtos) ao
 * lado de "Hidratações", "Tratamento", "Combo de serviços" (serviços).
 *
 * Classificamos por categoria conhecida OU pelo nome trazer volume/peso
 * ("SHAMPOO CAFÉ VERDE 500ML"), padrão que todo item de revenda segue aqui.
 * A divergência contra o total oficial de produtos (que vem do CSV financeiro)
 * é checada depois e vira warning — ver `productSplitWarning`.
 */
const PRODUCT_CATEGORY_HINTS = [
  'produto', 'revenda', 'shampoo', 'ativador', 'mascara', 'spray',
  'condicionador', 'creme', 'gelatina', 'oleo', 'leave',
]

const VOLUME_PATTERN = /\d+\s?(ml|l|g|kg)\b/i

function isProductCategory(categoria: string, itemName: string): boolean {
  const c = categoria.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (PRODUCT_CATEGORY_HINTS.some(h => c.includes(h))) return true
  return VOLUME_PATTERN.test(itemName)
}

interface ItemAccum { date: string; name: string; qty: number; revenue: number }
interface ProfAccum { date: string; key: string; name: string; count: number; revenue: number; commission: number }

/**
 * CSV de comissões: uma linha por item vendido (serviço, produto ou pacote),
 * com profissional. É a única fonte item-a-item disponível via exportação.
 *
 * Ressalva: quando há assistente vinculado, o mesmo atendimento pode aparecer
 * em mais de uma linha — o ranking serve para ordenar, não para bater centavo
 * a centavo. O faturamento oficial vem sempre do CSV financeiro.
 */
function parseComissoes(csv: string, window: { from: string; to: string }) {
  const { headers, rows } = parseCsv(csv)

  // Mesma razão do financeiro: o filtro é por data de pagamento.
  const colDate  = exactColumn(headers, ['Pagamento / Estorno', 'Atendimento/Venda'])
  const colProf  = exactColumn(headers, ['Profissional'])
  const colItem  = exactColumn(headers, ['Serviço/Produto/Pacote'])
  const colCateg = exactColumn(headers, ['Categoria'])
  const colValue = exactColumn(headers, ['Valor'])
  const colComm  = exactColumn(headers, ['Valor Comissão'])

  const professionals = new Map<string, ProfAccum>()
  const services = new Map<string, ItemAccum>()
  const products = new Map<string, ItemAccum>()
  const categories = new Set<string>()

  const missing: string[] = []
  if (!colDate) missing.push('Atendimento/Venda')
  if (!colProf) missing.push('Profissional')
  if (missing.length) return { professionals, services, products, categories, missing, headers }

  for (const row of rows) {
    const date = fromBR(row[colDate!])
    if (!date || date < window.from || date > window.to) continue

    const value = colValue ? parseBRNumber(row[colValue]) : 0
    const profName = (row[colProf!] ?? '').trim()

    if (profName) {
      const pKey = `${date}|${normalizeKey(profName)}`
      const p = professionals.get(pKey)
        ?? { date, key: normalizeKey(profName), name: profName, count: 0, revenue: 0, commission: 0 }
      p.count += 1
      p.revenue += value
      if (colComm) p.commission += parseBRNumber(row[colComm])
      professionals.set(pKey, p)
    }

    const itemName = (colItem ? row[colItem] : '').trim()
    if (!itemName) continue

    // O Trinks não marca o tipo do item nesse CSV; a categoria é o que separa
    // produto de serviço. Sem categoria reconhecível, entra como serviço.
    const categoria = (colCateg ? row[colCateg] : '').trim()
    if (categoria) categories.add(categoria)
    const bucket = isProductCategory(categoria, itemName) ? products : services

    const iKey = `${date}|${normalizeKey(itemName)}`
    const item = bucket.get(iKey) ?? { date, name: itemName, qty: 0, revenue: 0 }
    item.qty += 1
    item.revenue += value
    bucket.set(iKey, item)
  }

  return { professionals, services, products, categories, missing, headers }
}

function parseClientes(
  csv: string, days: Map<string, DayAccumulator>, window: { from: string; to: string },
) {
  const { headers, rows } = parseCsv(csv)
  const colDate = exactColumn(headers, ['Data de Cadastro'])
    ?? findColumn(headers, [['data', 'cadastro']])
  if (!colDate) return { missing: ['Data de Cadastro'], headers }

  for (const row of rows) {
    const date = fromBR(row[colDate])
    if (date && date >= window.from && date <= window.to) dayOf(days, date).new_customers += 1
  }
  return { missing: [], headers }
}

/** Agenda: JSON estruturado (mesmo endpoint dos fluxos n8n de confirmação). */
async function collectAgenda(
  s: TrinksSession, unit: UnitRow, from: string, to: string, days: Map<string, DayAccumulator>,
) {
  const { status, text } = await trinksGet(
    s, `/BackOffice/Agenda/ListarHorarios?${agendaQuery(unit.trinks_establishment_id, from, to)}`,
  )
  if (status !== 200) throw new Error(`ListarHorarios HTTP ${status}`)
  if (looksLikeLoginPage(text)) throw new Error('sessao_expirada')

  const list = JSON.parse(text)?.Dados ?? []
  for (const a of list) {
    // cid 9998/9999 e idcliest<=0 são bloqueios de horário e ausências, não agendamentos
    if (!a?.start || a.cid === 9998 || a.cid === 9999) continue
    if ((a.idcliest ?? 0) <= 0) continue

    const date = String(a.start).slice(0, 10)
    const day = dayOf(days, date)
    day.appointments_total += 1

    // `checkedout` é o único indicador de conclusão presente no payload.
    // Falta/cancelamento não vêm neste endpoint: o objeto não traz status
    // textual, só o filtro StatusSelecionados na query. Enquanto o código de
    // status não for identificado (ver ListarStatusHorarios), no_shows e
    // cancellations ficam zerados em vez de receber um palpite.
    if (a.checkedout === true) day.appointments_done += 1
  }
}

/** Despesas do dia — JSON limpo, mas é uma chamada por dia: só em janela curta. */
async function collectExpenses(
  s: TrinksSession, from: string, to: string, days: Map<string, DayAccumulator>,
) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const br = `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
    const { status, text } = await trinksGet(
      s,
      `/Backoffice/ControleDeEntradaESaida/ValoresDeReceitaEDespesa?DataInicio=${encodeURIComponent(br)}&DataFim=${encodeURIComponent(br)}`,
      30000,
    )
    if (status !== 200 || looksLikeLoginPage(text)) continue
    try {
      dayOf(days, d).expenses += parseBRNumber(JSON.parse(text)?.Dados?.ValorDasDespesas)
    } catch { /* formato inesperado: despesa fica 0, não derruba o sync */ }
  }
}

// ── Sync de uma unidade ──────────────────────────────────────────────────────

async function syncUnit(
  db: any, unit: UnitRow, from: string, to: string, opts: { probe: boolean; forceSession: boolean },
) {
  const runStart = new Date().toISOString()
  const warnings: string[] = []

  let { session, cached } = await getSession(db, unit, opts.forceSession)

  // Uma sessão em cache pode ter morrido antes dos 25 min: se o Trinks devolver
  // a tela de login, busca cookie novo uma vez e refaz.
  const withRetry = async <T>(fn: (s: TrinksSession) => Promise<T>): Promise<T> => {
    try {
      return await fn(session)
    } catch (err) {
      if (!cached || !String(err).includes('sessao_expirada')) throw err
      const fresh = await getSession(db, unit, true)
      session = fresh.session
      cached = false
      return await fn(session)
    }
  }

  const days = new Map<string, DayAccumulator>()

  // 1. Financeiro (CSV) — faturamento, serviços e produtos
  //
  // Quando não há movimento no período o Trinks responde 200 sem UrlDownload
  // (não gera arquivo). Isso é ausência de dado, não falha: vira warning e o
  // sync segue com agenda/clientes, que continuam valendo.
  const fin = await withRetry(s => exportCsv(s, 'Financeiro', financeiroPayload(from, to)))
  let finParsed: { missing: string[]; headers: string[] } = { missing: [], headers: [] }

  if (!fin.ok) {
    if (fin.detail === 'sessao_expirada') throw new Error('sessao_expirada')
    warnings.push(`financeiro: ${fin.detail} (periodo sem movimento?)`)
  } else {
    finParsed = parseFinanceiro(fin.csv!, days, { from, to })
    if (finParsed.missing.length) {
      warnings.push(`financeiro: colunas nao encontradas (${finParsed.missing.join(', ')})`)
    }
  }

  // 2. Comissões (CSV) — produção por profissional + itens vendidos
  let profRows = new Map<string, ProfAccum>()
  let serviceRows = new Map<string, ItemAccum>()
  let productRows = new Map<string, ItemAccum>()
  let comCategories: string[] = []
  let comHeaders: string[] = []
  try {
    const com = await withRetry(s => exportCsv(s, 'Comissoes', comissoesPayload(from, to)))
    if (com.ok) {
      const parsed = parseComissoes(com.csv!, { from, to })
      profRows = parsed.professionals
      serviceRows = parsed.services
      productRows = parsed.products
      comCategories = [...parsed.categories]
      comHeaders = parsed.headers
      if (parsed.missing.length) warnings.push(`comissoes: colunas nao encontradas (${parsed.missing.join(', ')})`)
    } else {
      warnings.push(`comissoes: ${com.detail}`)
    }
  } catch (err) {
    warnings.push(`comissoes: ${String(err)}`)
  }

  // 3. Clientes novos (CSV, filtrado por data de cadastro)
  let cliHeaders: string[] = []
  try {
    const cli = await withRetry(s => exportCsv(s, 'Clientes', clientesPayload(from, to)))
    if (cli.ok) {
      const parsed = parseClientes(cli.csv!, days, { from, to })
      cliHeaders = parsed.headers
      if (parsed.missing.length) warnings.push(`clientes: colunas nao encontradas (${parsed.missing.join(', ')})`)
    } else {
      warnings.push(`clientes: ${cli.detail}`)
    }
  } catch (err) {
    warnings.push(`clientes: ${String(err)}`)
  }

  // 4. Agenda (JSON)
  try {
    await withRetry(s => collectAgenda(s, unit, from, to, days))
  } catch (err) {
    warnings.push(`agenda: ${String(err)}`)
  }

  // 5. Despesas (JSON, 1 chamada por dia — só em janela curta)
  const windowDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
  if (windowDays <= EXPENSES_MAX_WINDOW_DAYS) {
    try {
      await withRetry(s => collectExpenses(s, from, to, days))
    } catch (err) {
      warnings.push(`despesas: ${String(err)}`)
    }
  } else {
    warnings.push(`despesas: puladas (janela de ${windowDays} dias)`)
  }

  // Auto-verificação do split: o total de produtos por dia vem do CSV
  // financeiro (fonte oficial); o ranking vem da classificação por categoria/
  // nome. Se divergirem muito, a heurística de classificação envelheceu.
  for (const [date, day] of days) {
    if (day.products_revenue <= 0) continue
    const classified = [...productRows.values()]
      .filter(p => p.date === date)
      .reduce((acc, p) => acc + p.revenue, 0)
    const diff = Math.abs(classified - day.products_revenue)
    if (diff > day.products_revenue * 0.15) {
      warnings.push(
        `split produtos ${date}: classificado ${classified.toFixed(2)} vs oficial ${day.products_revenue.toFixed(2)}`,
      )
    }
  }

  if (opts.probe) {
    return {
      probe: true,
      unit: unit.display_name,
      used_cached_session: cached,
      headers: { financeiro: finParsed.headers, comissoes: comHeaders, clientes: cliHeaders },
      days: [...days.entries()].map(([date, d]) => ({
        date,
        gross_revenue: d.gross_revenue,
        services_revenue: d.services_revenue,
        products_revenue: d.products_revenue,
        packages_revenue: d.packages_revenue,
        discounts: d.discounts,
        expenses: d.expenses,
        tickets: d.tickets.size,
        appointments_total: d.appointments_total,
        appointments_done: d.appointments_done,
        new_customers: d.new_customers,
      })),
      categories: comCategories,
      services_sample: [...serviceRows.values()].slice(0, 5),
      products_sample: [...productRows.values()].slice(0, 5),
      professionals_sample: [...profRows.values()].slice(0, 5),
      warnings,
    }
  }

  // ── Gravação ──────────────────────────────────────────────────────────────
  let rowsUpserted = 0

  const dailyRows = [...days.entries()].map(([business_date, d]) => ({
    store_id: unit.store_id,
    business_date,
    gross_revenue: d.gross_revenue,
    services_revenue: d.services_revenue,
    products_revenue: d.products_revenue,
    packages_revenue: d.packages_revenue,
    discounts: d.discounts,
    expenses: d.expenses,
    tickets_count: d.tickets.size,
    new_customers: d.new_customers,
    appointments_total: d.appointments_total,
    appointments_done: d.appointments_done,
    no_shows: d.no_shows,
    cancellations: d.cancellations,
    synced_at: new Date().toISOString(),
  }))

  if (dailyRows.length) {
    const { error } = await db.from('trinks_daily_revenue')
      .upsert(dailyRows, { onConflict: 'store_id,business_date' })
    if (error) throw new Error(`upsert daily: ${error.message}`)
    rowsUpserted += dailyRows.length
  }

  const itemRows = (map: Map<string, ItemAccum>) => [...map.values()].map(v => ({
    store_id: unit.store_id,
    business_date: v.date,
    item_key: normalizeKey(v.name),
    name: v.name,
    qty: v.qty,
    revenue: v.revenue,
    synced_at: new Date().toISOString(),
  }))

  for (const [table, rows] of [
    ['trinks_service_sales', itemRows(serviceRows)],
    ['trinks_product_sales', itemRows(productRows)],
  ] as const) {
    if (!rows.length) continue
    const { error } = await db.from(table)
      .upsert(rows, { onConflict: 'store_id,business_date,item_key' })
    if (error) throw new Error(`upsert ${table}: ${error.message}`)
    rowsUpserted += rows.length
  }

  if (profRows.size) {
    const rows = [...profRows.values()].map(p => ({
      store_id: unit.store_id,
      business_date: p.date,
      professional_key: p.key,
      professional_name: p.name,
      services_count: p.count,
      revenue: p.revenue,
      commission: p.commission,
      synced_at: new Date().toISOString(),
    }))
    const { error } = await db.from('trinks_professional_sales')
      .upsert(rows, { onConflict: 'store_id,business_date,professional_key' })
    if (error) throw new Error(`upsert profissionais: ${error.message}`)
    rowsUpserted += rows.length
  }

  await db.from('trinks_sync_runs').insert({
    store_id: unit.store_id,
    started_at: runStart,
    finished_at: new Date().toISOString(),
    status: warnings.length ? 'partial' : 'ok',
    window_start: from,
    window_end: to,
    rows_upserted: rowsUpserted,
    used_cached_session: cached,
    error_detail: warnings.length ? { warnings } : null,
  })

  return {
    unit: unit.display_name,
    status: warnings.length ? 'partial' : 'ok',
    days: dailyRows.length,
    rows_upserted: rowsUpserted,
    used_cached_session: cached,
    warnings,
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: secretRow } = await db
    .from('internal_config').select('value').eq('key', 'trinks_sync_secret').maybeSingle()

  const provided = req.headers.get('x-trinks-secret')
  if (!secretRow?.value || provided !== secretRow.value) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body opcional */ }

  const today = todaySaoPaulo()
  const from = (body.date_from as string) ?? addDays(today, -1)
  const to   = (body.date_to as string) ?? today
  const probe = body.probe === true
  const forceSession = body.force_session === true

  let query = db
    .from('trinks_units')
    .select('store_id, trinks_establishment_id, cookie_route, display_name')
    .eq('active', true)
    .order('cookie_route')

  if (body.store_id) query = query.eq('store_id', body.store_id as string)

  const { data: units, error: unitsErr } = await query
  if (unitsErr || !units?.length) {
    return new Response(
      JSON.stringify({ error: 'nenhuma unidade ativa', detail: unitsErr?.message }),
      { status: 400 },
    )
  }

  const results: unknown[] = []
  for (const unit of units as UnitRow[]) {
    try {
      results.push(await syncUnit(db, unit, from, to, { probe, forceSession }))
    } catch (err) {
      console.error(`sync-trinks ${unit.display_name}:`, err)
      if (!probe) {
        await db.from('trinks_sync_runs').insert({
          store_id: unit.store_id,
          finished_at: new Date().toISOString(),
          status: 'error',
          window_start: from,
          window_end: to,
          error_detail: { message: String(err) },
        })
      }
      results.push({ unit: unit.display_name, status: 'error', detail: String(err) })
    }
  }

  return new Response(
    JSON.stringify({ window: { from, to }, probe, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
