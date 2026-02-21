import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface Order {
  id: string;
  total: number;
  customer_name: string;
  customer_whatsapp: string;
  created_at: string;
  order_items: Array<{
    product_name_snapshot: string;
    qty: number;
    unit_price_snapshot: number;
  }>;
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    // Verify Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: { order_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { order_id } = body;
    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'Missing order_id in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get Supabase credentials from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.warn('Missing Supabase credentials in environment');
      return new Response(
        JSON.stringify({ success: true, message: 'Order received (Supabase not configured for WhatsApp)' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch order from Supabase using service role key
    const ordersUrl = `${supabaseUrl}/rest/v1/orders?id=eq.${order_id}&select=id,total,customer_name,customer_whatsapp,created_at,order_items(product_name_snapshot,qty,unit_price_snapshot)`;

    console.log('Fetching order from:', ordersUrl);
    const ordersResponse = await fetch(ordersUrl, {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    });

    console.log('Supabase response status:', ordersResponse.status);
    const responseText = await ordersResponse.text();
    console.log('Supabase response body:', responseText);

    if (!ordersResponse.ok) {
      console.error('Failed to fetch order from Supabase:', ordersResponse.statusText, responseText);
      return new Response(
        JSON.stringify({ success: true, message: 'Order saved (WhatsApp notification skipped)' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const orders = JSON.parse(responseText) as Order[];
    console.log('Parsed orders:', orders);

    if (!orders || orders.length === 0) {
      console.error(`Order ${order_id} not found in Supabase`);
      return new Response(
        JSON.stringify({ success: true, message: 'Order saved (not found for WhatsApp)' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const order = orders[0];

    // Get uazapi credentials - debug all env vars
    const allEnv = Deno.env.toObject();
    console.log('All environment variables:', Object.keys(allEnv));

    const uazapiUrl = Deno.env.get('UAZAPI_URL');
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN');
    const whatsappDestNumber = Deno.env.get('WHATSAPP_DEST_NUMBER');

    console.log('DEBUG - UAZAPI_URL:', uazapiUrl);
    console.log('DEBUG - UAZAPI_TOKEN:', uazapiToken ? '***PRESENT***' : 'MISSING');
    console.log('DEBUG - WHATSAPP_DEST_NUMBER:', whatsappDestNumber);

    if (!uazapiUrl || !uazapiToken || !whatsappDestNumber) {
      const debugMsg = `Missing credentials: url=${!!uazapiUrl}, token=${!!uazapiToken}, number=${!!whatsappDestNumber}`;
      console.error(debugMsg);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing uazapi credentials',
          debug: debugMsg,
          env_keys: Object.keys(allEnv)
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Format order message
    const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR');
    const orderNumber = order_id.slice(0, 8).toUpperCase();

    let itemsText = '';
    if (order.order_items && order.order_items.length > 0) {
      itemsText = order.order_items
        .map((item) => `  • ${item.product_name_snapshot} (${item.qty}x) — R$ ${(item.qty * item.unit_price_snapshot).toFixed(2)}`)
        .join('\n');
    }

    const message = `🛒 *Novo Pedido #${orderNumber}*
📅 ${orderDate}

*Cliente:* ${order.customer_name}
*WhatsApp:* ${order.customer_whatsapp}

*Itens:*
${itemsText}

*Total: R$ ${order.total.toFixed(2)}*`;

    // Send WhatsApp notification via uazapi
    // Try with token as query parameter (some APIs use this pattern)
    const uazapiEndpoint = `${uazapiUrl}/send/text?token=${encodeURIComponent(uazapiToken)}`;

    console.log('Sending to uazapi endpoint:', uazapiEndpoint.substring(0, 100) + '...');
    console.log('Message preview:', message.substring(0, 100) + '...');

    const whatsappResponse = await fetch(uazapiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: whatsappDestNumber,
        text: message,
      }),
    });

    console.log('uazapi response status:', whatsappResponse.status);
    const whatsappErrorText = await whatsappResponse.text();
    console.log('uazapi response body:', whatsappErrorText);
    const whatsappError = whatsappErrorText;

    if (!whatsappResponse.ok) {
      console.warn(`uazapi WhatsApp send failed (${whatsappResponse.status}): ${whatsappError}`);
      // Don't fail the entire request - order is already saved
      return new Response(
        JSON.stringify({ success: true, message: 'Order saved (WhatsApp notification failed)', warning: whatsappError }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`WhatsApp notification sent for order ${order_id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Order saved and WhatsApp notification sent' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-order-whatsapp function:', message);

    return new Response(
      JSON.stringify({ success: true, message: 'Order saved (unexpected error)', error: message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
