import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Notifica via WhatsApp (UAZAPI) quando uma contagem confirmada gera um
// pedido de reposição consolidado. Chamada pelo frontend (Confirmacao.tsx)
// logo após confirm_stock_count retornar replenishment_request_id.
// Mesmo padrão/segredos de send-order-whatsapp: UAZAPI_URL, UAZAPI_TOKEN,
// WHATSAPP_DEST_NUMBER (número do negócio).

interface RequestRow {
  id: string;
  generated_at: string;
  stores: { name: string } | null;
  replenishment_request_items: Array<{
    suggested_quantity: number;
    catalog_products: { name: string } | null;
  }>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { request_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestId = body.request_id;
    if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid request_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const uazapiUrl = Deno.env.get('UAZAPI_URL');
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN');
    const destNumber = Deno.env.get('WHATSAPP_DEST_NUMBER');

    if (!supabaseUrl || !serviceKey || !uazapiUrl || !uazapiToken || !destNumber) {
      console.error('Missing environment configuration');
      return new Response(JSON.stringify({ success: false, message: 'Notification not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const selectUrl =
      `${supabaseUrl}/rest/v1/replenishment_requests?id=eq.${requestId}` +
      `&select=id,generated_at,stores(name),replenishment_request_items(suggested_quantity,catalog_products(name))`;

    const resp = await fetch(selectUrl, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!resp.ok) {
      console.error('Failed to fetch request:', resp.status, await resp.text());
      return new Response(JSON.stringify({ success: false, message: 'Request fetch failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = (await resp.json()) as RequestRow[];
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Request not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const request = rows[0];
    const items = request.replenishment_request_items || [];
    const totalUnits = items.reduce((sum, i) => sum + i.suggested_quantity, 0);
    const storeName = request.stores?.name || 'Loja';
    const when = new Date(request.generated_at).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    // Lista completa até 25 itens; acima disso resume pra não estourar a mensagem.
    const shown = items.slice(0, 25);
    const itemsText = shown
      .map((i) => `  • ${i.catalog_products?.name || 'Produto'} — ${i.suggested_quantity} un.`)
      .join('\n');
    const more = items.length > shown.length ? `\n  … e mais ${items.length - shown.length} itens` : '';

    const message = `📦 *Pedido de Reposição — ${storeName}*
📅 ${when}

Contagem confirmada gerou reposição com *${items.length} ${items.length === 1 ? 'item' : 'itens'}* (${totalUnits} un. no total):

${itemsText}${more}

👉 Abrir o pedido no kanban:
https://rdc-revend.vercel.app/estoque/pedidos?pedido=${request.id}`;

    const uazapiEndpoint = `${uazapiUrl}/send/text?token=${encodeURIComponent(uazapiToken)}`;
    const waResp = await fetch(uazapiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: destNumber, text: message }),
    });

    if (!waResp.ok) {
      console.warn('uazapi send failed:', waResp.status, await waResp.text());
      return new Response(JSON.stringify({ success: false, message: 'WhatsApp send failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('notify-replenishment error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
