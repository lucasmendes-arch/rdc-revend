import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface SheetRow {
  nome_produto: string;
  sku: string;
  quantidade: number;
  quantidade_minima: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase credentials" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SHEETS_API_KEY não configurada nos secrets do Supabase" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { sheetId } = await req.json();

    if (!sheetId) {
      return new Response(
        JSON.stringify({ error: "sheetId é obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch data from Google Sheets API v4
    // Expects first sheet, first row as headers: nome_produto, sku, quantidade, quantidade_minima
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:D?key=${googleApiKey}`;
    const sheetsResponse = await fetch(sheetsUrl);

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      return new Response(
        JSON.stringify({ error: `Google Sheets API error: ${sheetsResponse.status} - ${errorText}` }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const sheetsData = await sheetsResponse.json();
    const rows: string[][] = sheetsData.values || [];

    if (rows.length < 2) {
      return new Response(
        JSON.stringify({ error: "Planilha vazia ou sem dados (precisa de header + pelo menos 1 linha)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Parse header row to find column indices
    const headers = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const colName = headers.indexOf("nome_produto");
    const colSku = headers.indexOf("sku");
    const colQty = headers.indexOf("quantidade");
    const colMin = headers.indexOf("quantidade_minima");

    if (colName === -1 || colQty === -1) {
      return new Response(
        JSON.stringify({
          error: "Colunas obrigatórias não encontradas. Necessário: nome_produto, quantidade. Opcional: sku, quantidade_minima",
          headers_found: headers,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Parse data rows
    const dataRows: SheetRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[colName]?.trim();
      if (!name) continue;

      dataRows.push({
        nome_produto: name,
        sku: colSku !== -1 ? (row[colSku]?.trim() || "") : "",
        quantidade: colQty !== -1 ? parseInt(row[colQty] || "0", 10) : 0,
        quantidade_minima: colMin !== -1 ? parseInt(row[colMin] || "5", 10) : 5,
      });
    }

    // Fetch all catalog products for matching
    const { data: products, error: productsError } = await supabase
      .from("catalog_products")
      .select("id, name");

    if (productsError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar produtos: ${productsError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build name-to-id map (case-insensitive)
    const productMap = new Map<string, string>();
    for (const p of products || []) {
      productMap.set(p.name.toLowerCase().trim(), p.id);
    }

    let synced = 0;
    let notFound = 0;
    const notFoundNames: string[] = [];

    for (const row of dataRows) {
      const productId = productMap.get(row.nome_produto.toLowerCase());

      if (!productId) {
        notFound++;
        notFoundNames.push(row.nome_produto);
        continue;
      }

      // Upsert inventory record
      const { error: upsertError } = await supabase
        .from("inventory")
        .upsert(
          {
            product_id: productId,
            sku: row.sku || null,
            quantity: row.quantidade,
            min_quantity: row.quantidade_minima,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "product_id" }
        );

      if (!upsertError) {
        synced++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          total_rows: dataRows.length,
          synced,
          not_found: notFound,
          not_found_names: notFoundNames.slice(0, 10),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Error: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
