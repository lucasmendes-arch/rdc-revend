import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()

    // AbacatePay sends: { event, data }
    const event = body?.event
    const billing = body?.data?.billing || body?.data

    console.log('Webhook received:', event, JSON.stringify(body).slice(0, 500))

    if (!event || !billing) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const billingId = billing.id || billing.billingId

    if (event === 'billing.paid' || event === 'BILLING_PAID') {
      if (!billingId) {
        console.error('No billing ID in payload')
        return new Response(JSON.stringify({ error: 'Missing billing ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Find order by payment_id
      const { data: order, error: findError } = await serviceClient
        .from('orders')
        .select('id, status')
        .eq('payment_id', billingId)
        .single()

      if (findError || !order) {
        console.error('Order not found for billing:', billingId, findError)
        return new Response(JSON.stringify({ error: 'Order not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Update order status to paid
      const { error: updateError } = await serviceClient
        .from('orders')
        .update({ status: 'pago' })
        .eq('id', order.id)

      if (updateError) {
        console.error('Failed to update order status:', updateError)
        return new Response(JSON.stringify({ error: 'Update failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      console.log(`Order ${order.id} marked as PAGO (billing: ${billingId})`)

      // Fire-and-forget WhatsApp notification for payment confirmation
      try {
        const whatsappUrl = Deno.env.get('UAZAPI_URL')
        const whatsappToken = Deno.env.get('UAZAPI_TOKEN')
        const whatsappDest = Deno.env.get('WHATSAPP_DEST_NUMBER')

        if (whatsappUrl && whatsappToken && whatsappDest) {
          const message = `✅ *Pagamento Confirmado!*\n\nPedido #${order.id.slice(0, 8)} foi pago via AbacatePay.\nStatus atualizado para: *PAGO*`

          fetch(`${whatsappUrl}/send-message?token=${whatsappToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: whatsappDest, message }),
          }).catch(err => console.warn('WhatsApp send failed:', err))
        }
      } catch (err) {
        console.warn('WhatsApp notification error:', err)
      }

      return new Response(JSON.stringify({ success: true, order_id: order.id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // For other events (billing.disputed, withdraw.done, etc.), just log
    console.log(`Unhandled event: ${event}`)
    return new Response(JSON.stringify({ received: true, event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
