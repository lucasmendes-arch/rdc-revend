// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-expect-error Deno import
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

declare const Deno: { env: { get(k: string): string | undefined } }

// ─────────────────────────────────────────────────────────────────────────────
// cron-commission-reports
//
// Disparado pelo pg_cron no dia 1 de cada mês às 11:00 UTC (08:00 BRT).
// Gera e envia via WhatsApp o relatório de comissão do mês anterior
// para todos os vendedores ativos com pedidos no período.
//
// Não requer JWT — chamado internamente pelo pg_cron.
// ─────────────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string
  order_number: string
  created_at: string
  customer_name: string
  total: number
  status: string
  payment_method: string | null
}

interface CommissionData {
  seller: { id: string; name: string; code: string | null; commission_pct: number }
  period: { start_date: string; end_date: string }
  orders: OrderRow[]
  summary: { total_orders: number; total_value: number; commission_pct: number; commission_amount: number }
}

function fmtDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

async function buildPDF(data: CommissionData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontReg  = await doc.embedFont(StandardFonts.Helvetica)

  const green    = rgb(0.07, 0.43, 0.25)
  const dark     = rgb(0.13, 0.13, 0.13)
  const muted    = rgb(0.50, 0.50, 0.50)
  const rowAlt   = rgb(0.96, 0.96, 0.96)
  const white    = rgb(1, 1, 1)
  const summBg   = rgb(0.93, 0.97, 0.94)

  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 40
  const ROW_H  = 17
  const COL    = { num: MARGIN, date: 100, customer: 175, total: 430, status: 500 }

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - 40

  function ensurePage(needed = ROW_H + 5) {
    if (y - needed < 90) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - 40
    }
  }

  page.drawRectangle({ x: 0, y: PAGE_H - 75, width: PAGE_W, height: 75, color: green })
  page.drawText('Rei dos Cachos B2B', {
    x: MARGIN, y: PAGE_H - 32, size: 18, font: fontBold, color: white,
  })
  page.drawText('Relatório de Comissão de Vendas', {
    x: MARGIN, y: PAGE_H - 55, size: 11, font: fontReg, color: white,
  })
  y = PAGE_H - 95

  page.drawText(`Vendedor: ${data.seller.name}${data.seller.code ? ` (${data.seller.code})` : ''}`, {
    x: MARGIN, y, size: 12, font: fontBold, color: dark,
  })
  y -= 18
  page.drawText(
    `Período: ${fmtDate(data.period.start_date)} a ${fmtDate(data.period.end_date)}`,
    { x: MARGIN, y, size: 10, font: fontReg, color: muted },
  )
  y -= 6
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rowAlt })
  y -= 16

  page.drawRectangle({ x: MARGIN - 4, y: y - 5, width: PAGE_W - 2 * MARGIN + 8, height: ROW_H + 4, color: green })
  const thOpts = { size: 8, font: fontBold, color: white }
  page.drawText('#PEDIDO', { x: COL.num,      y: y + 2, ...thOpts })
  page.drawText('DATA',    { x: COL.date,     y: y + 2, ...thOpts })
  page.drawText('CLIENTE', { x: COL.customer, y: y + 2, ...thOpts })
  page.drawText('VALOR',   { x: COL.total,    y: y + 2, ...thOpts })
  page.drawText('STATUS',  { x: COL.status,   y: y + 2, ...thOpts })
  y -= ROW_H + 4

  data.orders.forEach((order, i) => {
    ensurePage(ROW_H + 5)
    const bg = i % 2 === 0 ? rowAlt : white
    page.drawRectangle({ x: MARGIN - 4, y: y - 4, width: PAGE_W - 2 * MARGIN + 8, height: ROW_H, color: bg })

    const name = order.customer_name.length > 30
      ? order.customer_name.slice(0, 27) + '...'
      : order.customer_name

    const rowOpts = { size: 8, font: fontReg, color: dark }
    page.drawText(`#${order.order_number}`, { x: COL.num,      y, ...rowOpts })
    page.drawText(fmtDate(order.created_at), { x: COL.date,    y, ...rowOpts })
    page.drawText(name,                      { x: COL.customer, y, ...rowOpts })
    page.drawText(fmtBRL(order.total),       { x: COL.total,   y, ...rowOpts })
    page.drawText(order.status,              { x: COL.status,  y, ...rowOpts })
    y -= ROW_H
  })

  const SUMM_H = 90
  ensurePage(SUMM_H + 30)
  y -= 12
  page.drawRectangle({ x: MARGIN - 4, y: y - SUMM_H, width: PAGE_W - 2 * MARGIN + 8, height: SUMM_H, color: summBg })

  const lx = MARGIN + 6
  const vx = 280
  y -= 14
  page.drawText('RESUMO DO PERÍODO', { x: lx, y, size: 9, font: fontBold, color: dark })
  y -= 17
  page.drawText('Pedidos finalizados:',      { x: lx, y, size: 10, font: fontReg,  color: dark })
  page.drawText(`${data.summary.total_orders}`, { x: vx, y, size: 10, font: fontBold, color: dark })
  y -= 15
  page.drawText('Valor total:',              { x: lx, y, size: 10, font: fontReg,  color: dark })
  page.drawText(fmtBRL(data.summary.total_value), { x: vx, y, size: 10, font: fontBold, color: dark })
  y -= 15
  page.drawText(`Comissão (${data.summary.commission_pct}%):`, { x: lx, y, size: 11, font: fontBold, color: green })
  page.drawText(fmtBRL(data.summary.commission_amount), { x: vx, y, size: 11, font: fontBold, color: green })

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  page.drawText(`Gerado em ${now} · Rei dos Cachos B2B`, {
    x: MARGIN, y: 28, size: 7, font: fontReg, color: muted,
  })

  return await doc.save()
}

function prevMonthRange(): { start_date: string; end_date: string } {
  const now = new Date()
  const year  = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth() // 1-based
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  const dd = String(lastDay).padStart(2, '0')
  return {
    start_date: `${year}-${mm}-01`,
    end_date:   `${year}-${mm}-${dd}`,
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
  const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const uazapiUrl       = Deno.env.get('UAZAPI_URL')
  const uazapiToken     = Deno.env.get('UAZAPI_TOKEN')
  const destNumber      = Deno.env.get('WHATSAPP_FINANCEIRO_NUMBER') || '5527996602331'

  const serviceClient = createClient(supabaseUrl, supabaseService)

  const { start_date, end_date } = prevMonthRange()

  // Fetch all active sellers
  const { data: sellers, error: sellersErr } = await serviceClient
    .from('sellers')
    .select('id, name, code, commission_pct')
    .eq('active', true)

  if (sellersErr || !sellers?.length) {
    console.error('Error fetching sellers:', sellersErr?.message)
    return new Response(JSON.stringify({ error: 'Falha ao buscar vendedores', detail: sellersErr?.message }), { status: 500 })
  }

  const results: { seller: string; status: 'sent' | 'skipped' | 'error'; detail?: string }[] = []

  for (const seller of sellers) {
    try {
      // RPC via service client — function is SECURITY DEFINER with is_admin() check,
      // but cron runs as service role which bypasses RLS. We call the underlying query directly.
      const { data: summary, error: rpcErr } = await serviceClient.rpc(
        'get_seller_commission_summary_internal',
        { p_seller_id: seller.id, p_start_date: start_date, p_end_date: end_date },
      )

      if (rpcErr) {
        console.error(`RPC error for ${seller.name}:`, rpcErr.message)
        results.push({ seller: seller.name, status: 'error', detail: rpcErr.message })
        continue
      }

      const data = summary as CommissionData
      if (data.summary.total_orders === 0) {
        results.push({ seller: seller.name, status: 'skipped' })
        continue
      }

      // Generate PDF
      const pdfBytes = await buildPDF(data)

      // Upload to Storage
      const slug     = data.seller.code || data.seller.id.slice(0, 8)
      const fileName = `comissao_${slug}_${start_date}_${end_date}.pdf`
      const path     = `${data.seller.id}/${fileName}`

      const { error: uploadErr } = await serviceClient.storage
        .from('commission-reports')
        .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })

      if (uploadErr) {
        console.error(`Upload error for ${seller.name}:`, uploadErr.message)
        results.push({ seller: seller.name, status: 'error', detail: uploadErr.message })
        continue
      }

      const { data: urlData, error: urlErr } = await serviceClient.storage
        .from('commission-reports')
        .createSignedUrl(path, 60 * 60 * 24 * 30)

      if (urlErr || !urlData?.signedUrl) {
        console.error(`Signed URL error for ${seller.name}:`, urlErr?.message)
        results.push({ seller: seller.name, status: 'error', detail: urlErr?.message })
        continue
      }

      let pdfUrl = urlData.signedUrl
      try {
        const tinyRes = await fetch(
          `https://is.gd/create.php?format=simple&url=${encodeURIComponent(pdfUrl)}`,
          { signal: AbortSignal.timeout(4000) },
        )
        if (tinyRes.ok) {
          const short = (await tinyRes.text()).trim()
          if (short.startsWith('https://is.gd/')) pdfUrl = short
        }
      } catch {
        console.warn(`is.gd failed for ${seller.name} — usando URL original`)
      }

      // Send WhatsApp
      if (uazapiUrl && uazapiToken) {
        const s      = data.summary
        const period = `${fmtDate(data.period.start_date)} a ${fmtDate(data.period.end_date)}`
        const sellerLabel = data.seller.name + (data.seller.code ? ` (${data.seller.code})` : '')

        const message = [
          `📊 *Relatório de Comissão*`,
          ``,
          `👤 *Vendedor:* ${sellerLabel}`,
          `📅 *Período:* ${period}`,
          ``,
          `📦 Pedidos finalizados: ${s.total_orders}`,
          `💰 Valor total: ${fmtBRL(s.total_value)}`,
          `📈 Comissão (${s.commission_pct}%): *${fmtBRL(s.commission_amount)}*`,
          ``,
          `📎 PDF: ${pdfUrl}`,
          ``,
          `_Gerado automaticamente pelo sistema RDC Revend_`,
        ].join('\n')

        const wppRes = await fetch(`${uazapiUrl}/send/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', token: uazapiToken },
          body: JSON.stringify({ number: destNumber, text: message }),
        })

        if (!wppRes.ok) {
          const wppErr = await wppRes.text()
          console.warn(`WhatsApp failed for ${seller.name}:`, wppErr)
        }
      }

      results.push({ seller: seller.name, status: 'sent' })
    } catch (err) {
      console.error(`Unexpected error for ${seller.name}:`, err)
      results.push({ seller: seller.name, status: 'error', detail: String(err) })
    }
  }

  const processed = results.filter(r => r.status === 'sent').length
  const skipped   = results.filter(r => r.status === 'skipped').length
  const errors    = results.filter(r => r.status === 'error')

  console.log(`cron-commission-reports done: ${processed} enviados, ${skipped} sem pedidos, ${errors.length} erros`)

  return new Response(
    JSON.stringify({ success: true, period: { start_date, end_date }, processed, skipped, errors }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
