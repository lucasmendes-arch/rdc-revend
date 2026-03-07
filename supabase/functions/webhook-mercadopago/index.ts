import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// HMAC-SHA256 signature verification for MercadoPago webhooks
async function verifySignature(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')
  if (!secret) {
    console.warn('MERCADOPAGO_WEBHOOK_SECRET not set — skipping signature check')
    // If secret is not configured yet, fall back to verifying payment via API (existing behavior)
    return true
  }

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  if (!xSignature || !xRequestId) {
    console.error('Missing x-signature or x-request-id headers')
    return false
  }

  // Parse signature: "ts=1234567890,v1=abcdef..."
  const parts: Record<string, string> = {}
  for (const part of xSignature.split(',')) {
    const [key, ...valueParts] = part.split('=')
    parts[key.trim()] = valueParts.join('=').trim()
  }

  const ts = parts['ts']
  const v1 = parts['v1']

  if (!ts || !v1) {
    console.error('Invalid x-signature format:', xSignature)
    return false
  }

  // Reject if timestamp is older than 5 minutes (replay attack prevention)
  const signatureAge = Date.now() - parseInt(ts) * 1000
  if (signatureAge > 5 * 60 * 1000) {
    console.error('Webhook signature too old:', signatureAge, 'ms')
    return false
  }

  // Build the signed template: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`

  // Compute HMAC-SHA256
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(template))
  const computed = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (computed !== v1) {
    console.error('Webhook signature mismatch. Expected:', computed, 'Got:', v1)
    return false
  }

  return true
}

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

    // Verify webhook signature (prevents forged payment confirmations)
    const isValid = await verifySignature(req, String(paymentId))
    if (!isValid) {
      console.error('Webhook signature verification FAILED for payment:', paymentId)
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Query MercadoPago for payment details (double-check: never trust webhook body for status)
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

      // When payment is confirmed, update the client_sessions funnel to 'comprou'
      if (orderStatus === 'pago') {
        // Get user_id from the order to find their session
        const { data: orderData } = await serviceClient
          .from('orders')
          .select('user_id')
          .eq('id', orderId)
          .maybeSingle()

        if (orderData?.user_id) {
          // Find the most recent session for this user and update to 'comprou'
          const { error: sessionError } = await serviceClient
            .from('client_sessions')
            .update({
              status: 'comprou',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', orderData.user_id)
            .in('status', ['visitou', 'visualizou_produto', 'adicionou_carrinho', 'iniciou_checkout'])
            .order('updated_at', { ascending: false })
            .limit(1)

          if (sessionError) {
            console.warn('Failed to update session to comprou:', sessionError)
          } else {
            console.log(`Session updated to comprou for user ${orderData.user_id}`)
          }
        }
      }

      // Restore stock when payment is rejected or cancelled
      if (orderStatus === 'cancelado') {
        const { error: stockError } = await serviceClient.rpc('restore_order_stock', {
          p_order_id: orderId,
        })
        if (stockError) {
          console.error('Failed to restore stock for order:', orderId, stockError)
        } else {
          console.log(`Stock restored for cancelled order ${orderId}`)
        }
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
