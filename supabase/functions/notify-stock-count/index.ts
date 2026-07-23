import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Notifica via WhatsApp (UAZAPI) quando a loja CENTRAL confirma uma contagem
// de estoque. Chamada pelo frontend (Confirmacao.tsx) logo após
// confirm_stock_count retornar, só quando a loja da contagem é central —
// contagem central não gera replenishment_request (é compra do fornecedor,
// não pedido entre lojas, ver migration 20260707000002), então não passa
// pelo fluxo de notify-replenishment.
// Mesmo padrão/segredos de notify-replenishment: UAZAPI_URL, UAZAPI_TOKEN,
// WHATSAPP_DEST_NUMBER (número do negócio).

interface StockCountRow {
  id: string;
  store_id: string;
  status: string;
  confirmed_at: string | null;
  stores: { name: string; type: string } | null;
}

interface CountItemRow {
  product_id: string;
  total_units: number | null;
  catalog_products: { units_per_box: number | null } | null;
}

interface TargetRow {
  product_id: string;
  target_quantity: number;
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
    // Autenticação de verdade — checar só a presença do header (como era até
    // o checkup de 2026-07-23) não autentica nada: a chave anon é pública e é
    // um JWT válido, então passava direto e o resto do handler rodava com
    // service role. getUser() valida o token contra o Auth.
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só quem opera o módulo de Estoque — mesma união que EstoqueRoute deixa
    // entrar: is_estoque() = role 'salao' (ver 20260702000015) e
    // has_full_stock_access() = admin + administrativo.
    const [{ data: isEstoque }, { data: hasFullStock }] = await Promise.all([
      userClient.rpc('is_estoque'),
      userClient.rpc('has_full_stock_access'),
    ]);
    if (!isEstoque && !hasFullStock) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { stock_count_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stockCountId = body.stock_count_id;
    if (!stockCountId || !/^[0-9a-f-]{36}$/i.test(stockCountId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid stock_count_id' }), {
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

    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    const countResp = await fetch(
      `${supabaseUrl}/rest/v1/stock_counts?id=eq.${stockCountId}` +
        `&select=id,store_id,status,confirmed_at,stores(name,type)`,
      { headers: restHeaders }
    );
    if (!countResp.ok) {
      console.error('Failed to fetch stock_count:', countResp.status, await countResp.text());
      return new Response(JSON.stringify({ success: false, message: 'Stock count fetch failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const countRows = (await countResp.json()) as StockCountRow[];
    const count = countRows[0];
    if (!count || count.status !== 'confirmed' || count.stores?.type !== 'central') {
      // Não é uma contagem confirmada da central — nada a notificar.
      return new Response(JSON.stringify({ success: false, message: 'Not a confirmed central stock count' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [itemsResp, targetsResp] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/stock_count_items?stock_count_id=eq.${stockCountId}` +
          `&select=product_id,total_units,catalog_products(units_per_box)`,
        { headers: restHeaders }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/store_stock_targets?store_id=eq.${count.store_id}` +
          `&select=product_id,target_quantity`,
        { headers: restHeaders }
      ),
    ]);

    if (!itemsResp.ok || !targetsResp.ok) {
      console.error('Failed to fetch items/targets:', itemsResp.status, targetsResp.status);
      return new Response(JSON.stringify({ success: false, message: 'Items fetch failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = (await itemsResp.json()) as CountItemRow[];
    const targets = (await targetsResp.json()) as TargetRow[];
    const targetByProduct = new Map(targets.map((t) => [t.product_id, t.target_quantity]));

    let itemsAbaixoMeta = 0;
    let itemsNaoConciliados = 0;
    for (const item of items) {
      if (item.catalog_products?.units_per_box == null) {
        itemsNaoConciliados++;
        continue;
      }
      const target = targetByProduct.get(item.product_id);
      if (target === undefined) {
        itemsNaoConciliados++;
        continue;
      }
      if ((item.total_units ?? 0) < target) itemsAbaixoMeta++;
    }

    const storeName = count.stores?.name || 'Central';
    const when = new Date(count.confirmed_at || Date.now()).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const message = `📦 *Contagem confirmada — ${storeName}*
📅 ${when}

*${items.length}* ${items.length === 1 ? 'item contado' : 'itens contados'}${
      itemsAbaixoMeta > 0 ? `\n⚠️ *${itemsAbaixoMeta}* ${itemsAbaixoMeta === 1 ? 'item abaixo da meta' : 'itens abaixo da meta'} — avaliar compra com fornecedor` : ''
    }${
      itemsNaoConciliados > 0 ? `\nℹ️ *${itemsNaoConciliados}* ${itemsNaoConciliados === 1 ? 'item não conciliado' : 'itens não conciliados'} (sem meta/classificação)` : ''
    }

👉 Ver detalhe da contagem:
https://rdc-os.vercel.app/estoque/contagem/${count.id}/confirmar`;

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
    console.error('notify-stock-count error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
