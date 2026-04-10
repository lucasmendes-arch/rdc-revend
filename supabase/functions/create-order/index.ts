// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};
const ALLOWED_ORIGINS = [
  'https://rdc-revend.vercel.app',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
  const allowedOrigin = (ALLOWED_ORIGINS.includes(origin) || isLocalhost) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const MIN_ORDER_TOTAL = 500

// Structured logger — outputs JSON lines readable in Supabase Dashboard > Edge Functions > Logs
function log(event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }))
}
function logError(event: string, err: unknown, data?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(JSON.stringify({ ts: new Date().toISOString(), event, error: message, ...data }))
}

interface CartItem {
  product_id: string
  qty: number
}

interface OrderRequest {
  items: CartItem[]
  customer_name: string
  customer_whatsapp: string
  customer_email: string
  customer_document?: string
  notes?: string
  payment_method?: 'pix' | 'credit'
  installments?: number
  shipping?: number
  delivery_method?: 'shipping' | 'pickup'
  pickup_unit_slug?: string
  coupon_code?: string
  coupon_id?: string
  discount_amount?: number
  seller_id?: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // 1. Authenticate the user via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação ausente' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
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
      log('auth_failed', { error: authError?.message })
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    log('request_start', { user_id: user.id })

    // 1.5. Rate limiting: max 5 orders per user per 60 seconds
    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_key: `order:${user.id}`,
      p_max_requests: 5,
      p_window_seconds: 60,
    })
    if (allowed === false) {
      log('rate_limit_hit', { user_id: user.id })
      return new Response(
        JSON.stringify({ error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.' }),
        { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 1.6. Fetch customer segment + price list assignment from profile
    let customerSegment: string | null = null
    let profilePriceListId: string | null = null
    {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('customer_segment, price_list_id')
        .eq('id', user.id)
        .single()
      customerSegment = profile?.customer_segment ?? null
      profilePriceListId = profile?.price_list_id ?? null
    }

    // 2. Parse and validate request body
    const body: OrderRequest = await req.json()

    if (!body.items || body.items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Carrinho vazio' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    if (!body.customer_name?.trim() || !body.customer_whatsapp?.trim() || !body.customer_email?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Nome, WhatsApp e email são obrigatórios' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Validate qty
    for (const item of body.items) {
      if (!item.product_id || !item.qty || item.qty < 1 || !Number.isInteger(item.qty)) {
        return new Response(
          JSON.stringify({ error: `Quantidade inválida para produto ${item.product_id}` }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
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
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Build price map and validate all products exist and are active
    const priceMap = new Map<string, { id: string; name: string; price: number; is_active: boolean }>(products.map((p: { id: string; name: string; price: number; is_active: boolean }) => [p.id, p]))

    for (const item of body.items) {
      const product = priceMap.get(item.product_id)
      if (!product) {
        return new Response(
          JSON.stringify({ error: `Produto não encontrado: ${item.product_id}` }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
      if (!product.is_active) {
        return new Response(
          JSON.stringify({ error: `Produto indisponível: ${product.name}` }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3b. Resolve partner prices from price_list_items (if user has an active price list)
    // Rule: price_list_items.price overrides catalog_products.price when list is active and item is present.
    const resolvedPrices = new Map<string, number>() // product_id → resolved price
    if (profilePriceListId) {
      const { data: priceList } = await serviceClient
        .from('price_lists')
        .select('is_active')
        .eq('id', profilePriceListId)
        .single()

      if (priceList?.is_active) {
        const { data: priceListItems } = await serviceClient
          .from('price_list_items')
          .select('product_id, price')
          .eq('price_list_id', profilePriceListId)
          .in('product_id', productIds)

        for (const pli of priceListItems || []) {
          resolvedPrices.set(pli.product_id, pli.price)
        }
        log('price_list_resolved', {
          user_id: user.id,
          price_list_id: profilePriceListId,
          overrides: resolvedPrices.size,
        })
      }
    }

    // 4. Calculate total using REAL prices (resolved via price list or catalog default)
    let subtotal = 0
    const orderItems = body.items.map(item => {
      const product = priceMap.get(item.product_id)!
      const unitPrice = resolvedPrices.get(item.product_id) ?? product.price
      const lineTotal = unitPrice * item.qty
      subtotal += lineTotal
      return {
        product_id: product.id,
        product_name_snapshot: product.name,
        unit_price_snapshot: unitPrice,
        qty: item.qty,
        line_total: Math.round(lineTotal * 100) / 100,
      }
    })

    subtotal = Math.round(subtotal * 100) / 100

    // 5. Resolve kit components — kits decrement component stock, not kit stock
    const { data: kitComponents } = await serviceClient
      .from('kit_components')
      .select('kit_product_id, component_product_id, quantity')
      .in('kit_product_id', productIds)

    // Build kit -> components map
    const kitMap = new Map<string, { component_product_id: string; quantity: number }[]>()
    for (const kc of kitComponents || []) {
      if (!kitMap.has(kc.kit_product_id)) kitMap.set(kc.kit_product_id, [])
      kitMap.get(kc.kit_product_id)!.push({ component_product_id: kc.component_product_id, quantity: kc.quantity })
    }

    // Build list of all product IDs we need stock for (components + non-kit products)
    const stockCheckIds = new Set<string>()
    // Track what to decrement: product_id -> total qty needed
    const stockDecrements = new Map<string, number>()

    for (const item of body.items) {
      const components = kitMap.get(item.product_id)
      if (components && components.length > 0) {
        // Kit: decrement each component
        for (const comp of components) {
          const needed = comp.quantity * item.qty
          stockCheckIds.add(comp.component_product_id)
          stockDecrements.set(comp.component_product_id, (stockDecrements.get(comp.component_product_id) || 0) + needed)
        }
      } else {
        // Regular product: decrement itself
        stockCheckIds.add(item.product_id)
        stockDecrements.set(item.product_id, (stockDecrements.get(item.product_id) || 0) + item.qty)
      }
    }

    // 6. Check stock availability
    const { data: inventory, error: inventoryError } = await serviceClient
      .from('inventory')
      .select('product_id, quantity')
      .in('product_id', Array.from(stockCheckIds))

    if (inventoryError) {
      console.error('Inventory check error:', inventoryError)
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar estoque' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Build stock map (products without inventory records are treated as unlimited)
    const stockMap = new Map<string, number>(inventory?.map((i: { product_id: string; quantity: number }) => [i.product_id, i.quantity]) ?? [])

    // Also need a name map for component products (for error messages)
    const componentIds = Array.from(stockCheckIds).filter(id => !priceMap.has(id))
    const componentNameMap = new Map<string, string>()
    if (componentIds.length > 0) {
      const { data: compProducts } = await serviceClient
        .from('catalog_products')
        .select('id, name')
        .in('id', componentIds)
      for (const p of compProducts || []) {
        componentNameMap.set(p.id, p.name)
      }
    }

    const outOfStock: string[] = []
    for (const [productId, needed] of stockDecrements) {
      const stock = stockMap.get(productId)
      if (stock != null && stock < needed) {
        const name = priceMap.get(productId)?.name || componentNameMap.get(productId) || productId
        outOfStock.push(`${name} (disponível: ${stock}, necessário: ${needed})`)
      }
    }

    if (outOfStock.length > 0) {
      log('stock_insufficient', { user_id: user.id, items: outOfStock })
      return new Response(
        JSON.stringify({
          error: 'Estoque insuficiente',
          details: outOfStock,
        }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 6. Validate minimum order
    if (subtotal < MIN_ORDER_TOTAL) {
      return new Response(
        JSON.stringify({
          error: `Pedido mínimo: R$ ${MIN_ORDER_TOTAL}. Seu total: R$ ${subtotal.toFixed(2)}`,
        }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Resolve delivery method and pickup unit
    const deliveryMethod = body.delivery_method === 'pickup' ? 'pickup' : 'shipping'
    let pickupUnitSlug: string | null = null
    let pickupUnitAddress: string | null = null

    if (deliveryMethod === 'pickup') {
      if (!body.pickup_unit_slug) {
        return new Response(
          JSON.stringify({ error: 'Retirada na loja requer seleção de unidade' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }

      // Fetch unit from DB to validate and snapshot the address
      const { data: unit, error: unitError } = await serviceClient
        .from('pickup_units')
        .select('slug, address')
        .eq('slug', body.pickup_unit_slug)
        .eq('is_active', true)
        .single()

      if (unitError || !unit) {
        return new Response(
          JSON.stringify({ error: `Unidade de retirada não encontrada ou inativa: ${body.pickup_unit_slug}` }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }

      pickupUnitSlug = unit.slug
      pickupUnitAddress = unit.address
    }

    // 7. Validate and apply coupon server-side
    let couponId: string | null = null
    let couponDiscount = 0
    let couponType: string | null = null
    let isFreeShipping = false
    let shippingDiscountPercent = 0

    if (body.coupon_code || body.coupon_id) {
      // If coupon_code provided, validate via RPC (authoritative)
      // If only coupon_id provided, validate directly
      if (body.coupon_code) {
        const { data: couponResult } = await serviceClient.rpc('validate_coupon', {
          p_code: body.coupon_code.toUpperCase().trim(),
          p_cart_total: subtotal,
        })

        if (couponResult?.valid) {
          couponId = couponResult.id
          couponType = couponResult.type

          if (couponResult.type === 'free_shipping') {
            isFreeShipping = true
            couponDiscount = 0
          } else if (couponResult.type === 'percent') {
            couponDiscount = Math.round(subtotal * couponResult.value / 100 * 100) / 100
          } else if (couponResult.type === 'fixed') {
            couponDiscount = Math.min(couponResult.value, subtotal)
          } else if (couponResult.type === 'shipping_percent') {
            shippingDiscountPercent = couponResult.value
          }
        }
        // If coupon is invalid, silently ignore (frontend already validated — this is a safety net)
      } else if (body.coupon_id) {
        // Fallback: trust the coupon_id from frontend but verify it exists
        const { data: coupon } = await serviceClient
          .from('coupons')
          .select('id, discount_type, discount_value, is_active')
          .eq('id', body.coupon_id)
          .eq('is_active', true)
          .single()

        if (coupon) {
          couponId = coupon.id
          couponType = coupon.discount_type
          if (coupon.discount_type === 'free_shipping') {
            isFreeShipping = true
          } else if (coupon.discount_type === 'percent') {
            couponDiscount = Math.round(subtotal * coupon.discount_value / 100 * 100) / 100
          } else if (coupon.discount_type === 'fixed') {
            couponDiscount = Math.min(coupon.discount_value, subtotal)
          } else if (coupon.discount_type === 'shipping_percent') {
            shippingDiscountPercent = coupon.discount_value
          }
        }
      }
    }

    // Calculate shipping: pickup = 0, free_shipping coupon = 0, else ~20% of subtotal
    let shipping: number
    if (deliveryMethod === 'pickup' || isFreeShipping) {
      shipping = 0
    } else {
      const shippingFromClient = body.shipping && body.shipping > 0 ? Math.round(body.shipping * 100) / 100 : 0
      const expectedShipping = Math.round(subtotal * 0.20 * 100) / 100
      // Use server-calculated shipping if client value diverges too much (max R$0.10 tolerance)
      shipping = Math.abs(shippingFromClient - expectedShipping) < 0.10 ? shippingFromClient : expectedShipping
    }

    // shipping_percent: calculate discount based on actual shipping value
    if (shippingDiscountPercent > 0) {
      couponDiscount = Math.round(shipping * shippingDiscountPercent / 100 * 100) / 100
    }

    // Total = subtotal + shipping - coupon discount (never negative)
    const total = Math.round(Math.max((subtotal + shipping - couponDiscount), 0) * 100) / 100

    // 7.5. Resolve seller_id: explicit > default active > null
    let resolvedSellerId: string | null = body.seller_id || null
    if (!resolvedSellerId) {
      const { data: defaultSeller } = await serviceClient
        .from('sellers')
        .select('id')
        .eq('is_default', true)
        .eq('active', true)
        .limit(1)
        .single()
      resolvedSellerId = defaultSeller?.id ?? null
    }

    // 8. Create order (using service client to bypass RLS — we already verified auth)
    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .insert({
        user_id: user.id,
        subtotal,
        shipping,
        total,
        customer_name: body.customer_name.trim(),
        customer_whatsapp: body.customer_whatsapp.trim(),
        customer_email: body.customer_email.trim(),
        notes: body.notes?.trim() || null,
        status: 'recebido',
        origin: 'site',
        delivery_method: deliveryMethod,
        pickup_unit_slug: pickupUnitSlug,
        pickup_unit_address: pickupUnitAddress,
        coupon_id: couponId,
        discount_amount: couponDiscount,
        seller_id: resolvedSellerId,
        customer_segment_snapshot: customerSegment,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      logError('order_insert_failed', orderError, { user_id: user.id, subtotal, total })
      return new Response(
        JSON.stringify({ error: 'Erro ao criar pedido' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    log('order_created', { order_id: order.id, user_id: user.id, subtotal, shipping, discount: couponDiscount, total, items: orderItems.length, coupon_id: couponId, seller_id: resolvedSellerId, delivery_method: deliveryMethod, price_list_id: profilePriceListId })

    // 8. Create order items
    const itemsWithOrderId = orderItems.map(item => ({
      ...item,
      order_id: order.id,
    }))

    const { error: itemsError } = await serviceClient
      .from('order_items')
      .insert(itemsWithOrderId)

    if (itemsError) {
      logError('order_items_failed', itemsError, { order_id: order.id, user_id: user.id })
      // Cleanup: delete the order if items fail
      await serviceClient.from('orders').delete().eq('id', order.id)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar itens do pedido' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 9. Decrement stock for all affected products (components for kits, direct for regular)
    const stockErrors: string[] = []
    for (const [productId, qty] of stockDecrements) {
      const stock = stockMap.get(productId)
      if (stock !== undefined) {
        const { error: stockError } = await serviceClient.rpc('decrement_stock', {
          p_product_id: productId,
          p_qty: qty,
        })
        if (stockError) {
          stockErrors.push(`${productId}: ${stockError.message}`)
        }
      }
    }

    if (stockErrors.length > 0) {
      // Rollback: delete order items and order
      logError('stock_decrement_failed', new Error(stockErrors.join('; ')), { order_id: order.id, user_id: user.id })
      await serviceClient.from('order_items').delete().eq('order_id', order.id)
      await serviceClient.from('orders').delete().eq('id', order.id)
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar estoque. Pedido cancelado, tente novamente.' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 10. Increment coupon used_count (atomic via RPC)
    if (couponId) {
      await serviceClient.rpc('increment_coupon_usage', { p_coupon_id: couponId })
        .catch((err: Error) => console.warn('Coupon usage increment failed:', err))
    }

    // 11. Create MercadoPago Checkout Pro preference
    let paymentUrl: string | null = null
    let preferenceId: string | null = null

    try {
      const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')

      if (mpAccessToken) {
        const origin = req.headers.get('Origin') || 'https://rdc-revend.vercel.app'
        const webhookUrl = `${supabaseUrl}/functions/v1/webhook-mercadopago`

        const mpItems = orderItems.map(item => ({
          id: item.product_id,
          title: item.product_name_snapshot,
          quantity: item.qty,
          unit_price: item.unit_price_snapshot,
          currency_id: 'BRL',
        }))

        // Add shipping as a line item
        if (shipping > 0) {
          mpItems.push({
            id: 'shipping',
            title: 'Frete',
            quantity: 1,
            unit_price: shipping,
            currency_id: 'BRL',
          })
        }

        // Add coupon discount as negative line item
        if (couponDiscount > 0) {
          mpItems.push({
            id: 'discount',
            title: `Desconto (cupom)`,
            quantity: 1,
            unit_price: -couponDiscount,
            currency_id: 'BRL',
          })
        }

        const preferencePayload = {
          items: mpItems,
          payer: {
            name: body.customer_name.trim(),
            email: body.customer_email.trim(),
            phone: { number: body.customer_whatsapp.trim() },
            identification: body.customer_document ? {
              type: body.customer_document.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF',
              number: body.customer_document.replace(/\D/g, ''),
            } : undefined,
          },
          back_urls: {
            success: `https://rdc-revend.vercel.app/pedido/sucesso/${order.id}`,
            failure: `https://rdc-revend.vercel.app/catalogo`,
            pending: `https://rdc-revend.vercel.app/pedido/sucesso/${order.id}`,
          },
          payment_methods: {
            excluded_payment_types: [
              { id: 'ticket' },
              ...(body.payment_method === 'pix' ? [{ id: 'credit_card' }, { id: 'debit_card' }] : []),
              ...(body.payment_method === 'credit' ? [{ id: 'bank_transfer' }] : []),
            ],
            ...(body.payment_method === 'pix' ? { default_payment_method_id: 'pix' } : {}),
            ...(body.payment_method === 'credit' && body.installments ? { installments: body.installments } : {}),
          },
          auto_return: 'approved',
          external_reference: order.id,
          notification_url: webhookUrl,
        }

        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mpAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preferencePayload),
        })

        const mpData = await mpRes.json()

        if (mpRes.ok && mpData?.init_point) {
          paymentUrl = mpData.init_point
          preferenceId = mpData.id
          log('payment_preference_created', { order_id: order.id, preference_id: preferenceId })

          await serviceClient
            .from('orders')
            .update({ payment_id: preferenceId, status: 'aguardando_pagamento' })
            .eq('id', order.id)
        } else {
          logError('mercadopago_preference_failed', new Error(mpData?.message || 'unknown'), { order_id: order.id, status: mpRes.status })
        }
      }
    } catch (err) {
      logError('mercadopago_error', err, { order_id: order.id })
    }

    // 11. Fire-and-forget WhatsApp notification
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
          deliveryMethod === 'pickup' ? `📍 *Retirada:* ${pickupUnitAddress}` : '',
          '',
          itemsList,
          '',
          shipping > 0 ? `📦 Frete: R$ ${shipping.toFixed(2)}` : '',
          deliveryMethod === 'pickup' ? '📦 Frete: R$ 0,00 (retirada)' : '',
          isFreeShipping ? '📦 Frete grátis (cupom)' : '',
          couponDiscount > 0 ? `🏷️ Desconto cupom: -R$ ${couponDiscount.toFixed(2)}` : '',
          `💰 *Total: R$ ${total.toFixed(2)}*`,
          paymentUrl ? `💳 Link: ${paymentUrl}` : '',
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

    // 12. Return success with payment URL
    log('request_completed', { order_id: order.id, total, has_payment_url: !!paymentUrl })
    return new Response(
      JSON.stringify({ order_id: order.id, total, payment_url: paymentUrl }),
      { status: 201, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logError('unexpected_error', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
