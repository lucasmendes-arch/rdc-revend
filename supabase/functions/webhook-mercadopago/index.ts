import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    console.log('MP Webhook received:', body.type, body.action, JSON.stringify(body).slice(0, 300))

    // MercadoPago sends: { type: "payment", action: "payment.created", data: { id: "123" } }
    if (body.type !== 'payment') {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const paymentId = body.data?.id
    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Missing payment ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Query MercadoPago for payment details
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!mpAccessToken) {
      console.error('MERCADOPAGO_ACCESS_TOKEN not set')
      return new Response(JSON.stringify({ error: 'Config error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpAccessToken}` },
    })

    if (!paymentRes.ok) {
      console.error('Failed to fetch payment:', paymentRes.status)
      return new Response(JSON.stringify({ error: 'Payment fetch failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const payment = await paymentRes.json()
    const orderId = payment.external_reference
    const status = payment.status // approved, pending, rejected, etc.

    console.log(`Payment ${paymentId}: status=${status}, order=${orderId}`)

    if (!orderId) {
      console.warn('No external_reference in payment')
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Map MercadoPago status to our order status
    let orderStatus: string | null = null
    if (status === 'approved') {
      orderStatus = 'pago'
    } else if (status === 'rejected' || status === 'cancelled') {
      orderStatus = 'cancelado'
    }
    // pending/in_process — keep as aguardando_pagamento

    if (orderStatus) {
      const { error: updateError } = await serviceClient
        .from('orders')
        .update({ status: orderStatus })
        .eq('id', orderId)

      if (updateError) {
        console.error('Failed to update order:', updateError)
      } else {
        console.log(`Order ${orderId} updated to: ${orderStatus}`)
      }

      // WhatsApp notification for approved payments
      if (orderStatus === 'pago') {
        try {
          const whatsappUrl = Deno.env.get('UAZAPI_URL')
          const whatsappToken = Deno.env.get('UAZAPI_TOKEN')
          const whatsappDest = Deno.env.get('WHATSAPP_DEST_NUMBER')

          if (whatsappUrl && whatsappToken && whatsappDest) {
            const amount = payment.transaction_amount
              ? `R$ ${Number(payment.transaction_amount).toFixed(2)}`
              : ''

            const message = [
              `✅ *Pagamento Confirmado!*`,
              ``,
              `Pedido #${orderId.slice(0, 8)}`,
              amount ? `Valor: ${amount}` : '',
              `Método: ${payment.payment_type_id || 'N/A'}`,
              `Status: *PAGO*`,
            ].filter(Boolean).join('\n')

            fetch(`${whatsappUrl}/send-message?token=${whatsappToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: whatsappDest, message }),
            }).catch(err => console.warn('WhatsApp send failed:', err))
          }
        } catch (err) {
          console.warn('WhatsApp notification error:', err)
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
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
