import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  'https://rdc-revend.vercel.app',
  'http://localhost:8080',
  'http://localhost:5173',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

interface SheetRow {
  nome_produto: string
  sku: string
  quantidade: number
  quantidade_minima: number
  preco: number | null
  preco_revenda: number | null
  foto: string | null
  categoria: string | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase credentials" }),
        { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SHEETS_API_KEY nao configurada nos secrets do Supabase" }),
        { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { sheetId } = await req.json();

    if (!sheetId) {
      return new Response(
        JSON.stringify({ error: "sheetId e obrigatorio" }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // Fetch data from Google Sheets API v4 (columns A through H)
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:H?key=${googleApiKey}`;
    const sheetsResponse = await fetch(sheetsUrl);

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      return new Response(
        JSON.stringify({ error: `Google Sheets API error: ${sheetsResponse.status} - ${errorText}` }),
        { status: 502, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const sheetsData = await sheetsResponse.json();
    const rows: string[][] = sheetsData.values || [];

    if (rows.length < 2) {
      return new Response(
        JSON.stringify({ error: "Planilha vazia ou sem dados (precisa de header + pelo menos 1 linha)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // Parse header row to find column indices
    const headers = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const colName = headers.indexOf("nome_produto");
    const colSku = headers.indexOf("sku");
    const colQty = headers.indexOf("quantidade");
    const colMin = headers.indexOf("quantidade_minima");
    const colPrice = headers.indexOf("preco");
    const colResale = headers.indexOf("preco_revenda");
    const colPhoto = headers.indexOf("foto");
    const colCategory = headers.indexOf("categoria");

    if (colName === -1) {
      return new Response(
        JSON.stringify({
          error: "Coluna 'nome_produto' obrigatoria nao encontrada.",
          headers_found: headers,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // Parse data rows
    const dataRows: SheetRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[colName]?.trim();
      if (!name) continue;

      const parseNum = (idx: number): number | null => {
        if (idx === -1) return null;
        const raw = row[idx]?.trim().replace(",", ".").replace(/[^\d.]/g, "");
        const val = parseFloat(raw);
        return isNaN(val) ? null : val;
      };

      dataRows.push({
        nome_produto: name,
        sku: colSku !== -1 ? (row[colSku]?.trim() || "") : "",
        quantidade: colQty !== -1 ? parseInt(row[colQty] || "0", 10) : 0,
        quantidade_minima: colMin !== -1 ? parseInt(row[colMin] || "5", 10) : 5,
        preco: parseNum(colPrice),
        preco_revenda: parseNum(colResale),
        foto: colPhoto !== -1 ? (row[colPhoto]?.trim() || null) : null,
        categoria: colCategory !== -1 ? (row[colCategory]?.trim() || null) : null,
      });
    }

    // Fetch existing products
    const { data: products, error: productsError } = await supabase
      .from("catalog_products")
      .select("id, name, price, compare_at_price, main_image, category_id");

    if (productsError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar produtos: ${productsError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // Fetch categories for matching by name
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name");

    const categoryMap = new Map<string, string>();
    for (const c of categories || []) {
      categoryMap.set(c.name.toLowerCase().trim(), c.id);
    }

    // Build name-to-product map (case-insensitive)
    const productMap = new Map<string, { id: string; price: number; compare_at_price: number | null; main_image: string | null; category_id: string | null }>();
    for (const p of products || []) {
      productMap.set(p.name.toLowerCase().trim(), p);
    }

    let created = 0;
    let updated = 0;
    let stockSynced = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const row of dataRows) {
      const existing = productMap.get(row.nome_produto.toLowerCase());

      if (existing) {
        // UPDATE existing product (only fields that have values in sheet)
        const updates: Record<string, unknown> = {};

        if (row.preco !== null && row.preco !== existing.price) {
          updates.price = row.preco;
        }
        if (row.preco_revenda !== null && row.preco_revenda !== existing.compare_at_price) {
          updates.compare_at_price = row.preco_revenda;
        }
        if (row.foto && row.foto !== existing.main_image) {
          updates.main_image = row.foto;
        }
        if (row.categoria) {
          const catId = categoryMap.get(row.categoria.toLowerCase().trim());
          if (catId && catId !== existing.category_id) {
            updates.category_id = catId;
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const { error } = await supabase
            .from("catalog_products")
            .update(updates)
            .eq("id", existing.id);

          if (error) {
            errors++;
            errorMessages.push(`Erro ao atualizar '${row.nome_produto}': ${error.message}`);
            continue;
          }
          updated++;
        }

        // Upsert inventory
        const { error: invError } = await supabase
          .from("inventory")
          .upsert(
            {
              product_id: existing.id,
              sku: row.sku || null,
              quantity: row.quantidade,
              min_quantity: row.quantidade_minima,
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "product_id" }
          );

        if (!invError) stockSynced++;

      } else {
        // CREATE new product
        if (row.preco === null || row.preco <= 0) {
          errors++;
          errorMessages.push(`Produto novo '${row.nome_produto}' sem preco — ignorado`);
          continue;
        }

        const newProduct: Record<string, unknown> = {
          name: row.nome_produto,
          price: row.preco,
          compare_at_price: row.preco_revenda || null,
          main_image: row.foto || null,
          is_active: true,
          source: "google_sheets",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (row.categoria) {
          const catId = categoryMap.get(row.categoria.toLowerCase().trim());
          if (catId) newProduct.category_id = catId;
        }

        const { data: createdProduct, error: createError } = await supabase
          .from("catalog_products")
          .insert(newProduct)
          .select("id")
          .single();

        if (createError) {
          errors++;
          errorMessages.push(`Erro ao criar '${row.nome_produto}': ${createError.message}`);
          continue;
        }

        created++;

        // Create inventory for new product
        if (createdProduct) {
          await supabase
            .from("inventory")
            .upsert(
              {
                product_id: createdProduct.id,
                sku: row.sku || null,
                quantity: row.quantidade,
                min_quantity: row.quantidade_minima,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "product_id" }
            );
          stockSynced++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          total_rows: dataRows.length,
          created,
          updated,
          stock_synced: stockSynced,
          errors,
          error_messages: errorMessages.slice(0, 20),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Error: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});
