import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_ORDER_TOTAL = 500

interface CartItem {
  product_id: string
  qty: number
}

interface OrderRequest {
  items: CartItem[]
  customer_name: string
  customer_whatsapp: string
  customer_email: string
  notes?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate the user via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação ausente' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with the USER's token (respects RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User-scoped client (for auth)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Service client (for price validation — bypasses RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authenticated user
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Parse and validate request body
    const body: OrderRequest = await req.json()

    if (!body.items || body.items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Carrinho vazio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!body.customer_name?.trim() || !body.customer_whatsapp?.trim() || !body.customer_email?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Nome, WhatsApp e email são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate qty
    for (const item of body.items) {
      if (!item.product_id || !item.qty || item.qty < 1 || !Number.isInteger(item.qty)) {
        return new Response(
          JSON.stringify({ error: `Quantidade inválida para produto ${item.product_id}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3. Fetch REAL prices from database (server-side — cannot be manipulated)
    const productIds = body.items.map(i => i.product_id)

    const { data: products, error: productsError } = await serviceClient
      .from('catalog_products')
      .select('id, name, price, is_active')
      .in('id', productIds)

    if (productsError || !products) {
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar produtos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build price map and validate all products exist and are active
    const priceMap = new Map(products.map(p => [p.id, p]))

    for (const item of body.items) {
      const product = priceMap.get(item.product_id)
      if (!product) {
        return new Response(
          JSON.stringify({ error: `Produto não encontrado: ${item.product_id}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!product.is_active) {
        return new Response(
          JSON.stringify({ error: `Produto indisponível: ${product.name}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 4. Calculate total using REAL prices
    let subtotal = 0
    const orderItems = body.items.map(item => {
      const product = priceMap.get(item.product_id)!
      const lineTotal = product.price * item.qty
      subtotal += lineTotal
      return {
        product_id: product.id,
        product_name_snapshot: product.name,
        unit_price_snapshot: product.price,
        qty: item.qty,
        line_total: Math.round(lineTotal * 100) / 100,
      }
    })

    subtotal = Math.round(subtotal * 100) / 100

    // 5. Validate minimum order
    if (subtotal < MIN_ORDER_TOTAL) {
      return new Response(
        JSON.stringify({
          error: `Pedido mínimo: R$ ${MIN_ORDER_TOTAL}. Seu total: R$ ${subtotal.toFixed(2)}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Create order (using service client to bypass RLS — we already verified auth)
    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .insert({
        user_id: user.id,
        subtotal,
        shipping: 0,
        total: subtotal,
        customer_name: body.customer_name.trim(),
        customer_whatsapp: body.customer_whatsapp.trim(),
        customer_email: body.customer_email.trim(),
        notes: body.notes?.trim() || null,
        status: 'recebido',
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Order creation error:', orderError)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar pedido' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Create order items
    const itemsWithOrderId = orderItems.map(item => ({
      ...item,
      order_id: order.id,
    }))

    const { error: itemsError } = await serviceClient
      .from('order_items')
      .insert(itemsWithOrderId)

    if (itemsError) {
      console.error('Order items error:', itemsError)
      // Cleanup: delete the order if items fail
      await serviceClient.from('orders').delete().eq('id', order.id)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar itens do pedido' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Fire-and-forget WhatsApp notification
    try {
      const whatsappUrl = Deno.env.get('UAZAPI_URL')
      const whatsappToken = Deno.env.get('UAZAPI_TOKEN')
      const whatsappDest = Deno.env.get('WHATSAPP_DEST_NUMBER')

      if (whatsappUrl && whatsappToken && whatsappDest) {
        const itemsList = orderItems
          .map(i => `• ${i.qty}x ${i.product_name_snapshot} — R$ ${i.line_total.toFixed(2)}`)
          .join('\n')

        const message = [
          `🛒 *Novo Pedido #${order.id.slice(0, 8)}*`,
          `👤 ${body.customer_name}`,
          `📱 ${body.customer_whatsapp}`,
          `📧 ${body.customer_email}`,
          '',
          itemsList,
          '',
          `💰 *Total: R$ ${subtotal.toFixed(2)}*`,
          body.notes ? `📝 ${body.notes}` : '',
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

    // 9. Return success
    return new Response(
      JSON.stringify({ order_id: order.id, total: subtotal }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
