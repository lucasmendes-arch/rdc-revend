/**
 * Importa os relatórios exportados do Trinks para o banco.
 *
 *   npx tsx scripts/trinks-import.ts relatorios-trinks/linhares [--dry-run]
 *
 * A pasta tem o nome do slug da loja (stores.slug). Dentro dela, qualquer
 * quantidade de CSVs dos relatórios Financeiro e Comissões (exportados por
 * "Data de Pagamento/Estorno"), Agendamentos e Clientes, com períodos
 * sobrepostos ou repetidos — o tipo é detectado pelo cabeçalho. O "Ranking de
 * Profissionais" é reconhecido e ignorado (resumo sem data por linha).
 *
 * Idempotente: arquivo já importado (mesmo sha256) é pulado, e cada
 * importação do financeiro SUBSTITUI os fechamentos do período do arquivo
 * numa transação (trinks_import_financeiro). Arquivos são processados do
 * gerado mais antigo para o mais novo, então a exportação mais recente vence.
 *
 * Credenciais: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE do .env.local.
 * Ver docs/trinks-endpoints.md.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

import {
  decodeReport, detectReport, parseAgendamentos, parseClientes, parseComissoes, parseFinanceiro,
  type AgendamentosReport, type ClientesReport, type ComissoesReport, type FinanceiroReport,
} from '../supabase/functions/_shared/trinks-reports'

// Ordem de importação entre tipos: as comissões dependem dos agendamentos para
// separar serviço de produto (ver 20261009000002).
const TYPE_ORDER = { clientes: 0, financeiro: 1, agendamentos: 2, comissoes: 3 } as const

const RPC_BY_TYPE = {
  financeiro: 'trinks_import_financeiro',
  clientes: 'trinks_import_clientes',
  agendamentos: 'trinks_import_agendamentos',
  comissoes: 'trinks_import_comissoes',
} as const

function loadEnv(): Record<string, string> {
  const text = readFileSync(resolve('.env.local'), 'utf8')
  return Object.fromEntries(
    text.split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
  )
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function main() {
  const dir = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!dir) {
    console.error('uso: npx tsx scripts/trinks-import.ts relatorios-trinks/<slug> [--dry-run]')
    process.exit(1)
  }
  const slug = basename(resolve(dir))

  type Parsed = {
    file: string
    sha: string
    report: FinanceiroReport | ClientesReport | AgendamentosReport | ComissoesReport
  }

  const parsed: Parsed[] = []
  for (const file of readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv')).sort()) {
    const bytes = readFileSync(join(dir, file))
    const sha = createHash('sha256').update(bytes).digest('hex')
    const text = decodeReport(bytes)
    const kind = detectReport(text)
    if (kind === 'financeiro') parsed.push({ file, sha, report: parseFinanceiro(text) })
    else if (kind === 'clientes') parsed.push({ file, sha, report: parseClientes(text) })
    else if (kind === 'agendamentos') parsed.push({ file, sha, report: parseAgendamentos(text) })
    else if (kind === 'comissoes') parsed.push({ file, sha, report: parseComissoes(text) })
    else if (kind === 'ranking') console.warn(`- ${file}: ranking de profissionais (resumo sem data por linha) — ignorado`)
    else console.warn(`? ${file}: relatório não reconhecido — ignorado`)
  }

  // Por tipo na ordem de dependência; dentro do tipo, exportação mais antiga
  // primeiro, para a mais recente sobrescrever.
  parsed.sort((a, b) =>
    TYPE_ORDER[a.report.type] - TYPE_ORDER[b.report.type]
    || (a.report.generated_at ?? '').localeCompare(b.report.generated_at ?? ''))

  for (const p of parsed) {
    if (p.report.type === 'financeiro') {
      const r = p.report
      const sum = r.rows.reduce((a, x) => a + x.total, 0)
      console.log(`financeiro ${p.file}: ${r.period_start}..${r.period_end}, ${r.rows.length} fechamentos, ${brl(sum)} (total do arquivo ${r.file_total === null ? '—' : brl(r.file_total)})`)
    } else if (p.report.type === 'comissoes') {
      const r = p.report
      const com = r.rows.reduce((a, x) => a + x.commission_value, 0)
      console.log(`comissoes  ${p.file}: ${r.period_start}..${r.period_end}, ${r.rows.length} itens, ${brl(r.rows.reduce((a, x) => a + x.value, 0))}, comissão ${brl(com)}`)
    } else if (p.report.type === 'agendamentos') {
      const r = p.report
      const faltas = r.rows.filter(x => x.status === 'Cliente não compareceu').length
      console.log(`agendament ${p.file}: ${r.period_start}..${r.period_end}, ${r.rows.length} agendamentos, ${faltas} faltas`)
    } else {
      const r = p.report
      console.log(`clientes   ${p.file}: ${r.rows.length} clientes${r.only_active ? ' (só ativos)' : ''}`)
    }
  }

  if (dryRun) {
    console.log('\n--dry-run: nada gravado.')
    return
  }

  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE ausentes no .env.local')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: store, error: storeErr } = await db.from('stores').select('id, name').eq('slug', slug).maybeSingle()
  if (storeErr || !store) throw new Error(`loja com slug "${slug}" não encontrada: ${storeErr?.message ?? ''}`)
  console.log(`\nunidade: ${store.name} (${slug})`)

  for (const p of parsed) {
    const importMeta = { file_name: p.file, file_sha256: p.sha, generated_at: p.report.generated_at }
    const period = 'period_start' in p.report
      ? { period_start: p.report.period_start, period_end: p.report.period_end }
      : {}
    const { data, error } = await db.rpc(RPC_BY_TYPE[p.report.type], {
      p_store_id: store.id,
      p_import: { ...importMeta, ...period },
      p_rows: p.report.rows,
    })
    if (error) throw new Error(`${p.file}: ${error.message}`)
    console.log(`  ${p.file}: ${JSON.stringify(data)}`)
  }

  // CRM dos salões: recalcula o resumo por cliente com o que acabou de entrar
  // (o cron horário faria o mesmo, mas assim a tela já reflete na hora).
  const { data: crm, error: crmErr } = await db.rpc('salon_crm_refresh', { p_store_id: store.id })
  if (crmErr) throw new Error(`salon_crm_refresh: ${crmErr.message}`)
  console.log(`  CRM: ${crm} clientes recalculadas`)
}

main().catch(err => {
  console.error(`ERRO: ${err.message ?? err}`)
  process.exit(1)
})
