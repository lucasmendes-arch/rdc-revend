import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const NUVEMSHOP_API_URL = "https://api.tiendanube.com/v1";

interface NuvemshopProduct {
  id: number;
  name: { [key: string]: string };
  description: string;
  published: boolean;
  images: Array<{ id: number; src: string }>;
  variants: Array<{ id: number; price: number }>;
}

interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}

async function fetchNuvemshopProducts(
  storeId: string,
  token: string,
  userAgent: string
): Promise<{ products: NuvemshopProduct[]; error: string | null }> {
  const products: NuvemshopProduct[] = [];
  let page = 1;
  let hasMore = true;
  const perPage = 50;

  try {
    while (hasMore) {
      const url = `${NUVEMSHOP_API_URL}/${storeId}/products?page=${page}&per_page=${perPage}`;
      const response = await fetch(url, {
        headers: {
          Authentication: `bearer ${token}`,
          "User-Agent": userAgent,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          products: [],
          error: `Nuvemshop API error: ${response.status}`,
        };
      }

      const data = await response.json();
      const pageProducts = Array.isArray(data) ? data : (data.result || []);

      if (pageProducts.length === 0) {
        hasMore = false;
        break;
      }

      products.push(...pageProducts);

      if (pageProducts.length < perPage) {
        hasMore = false;
      }

      page++;
    }

    return { products, error: null };
  } catch (err) {
    return {
      products: [],
      error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function mapProduct(
  nuvemshopProduct: NuvemshopProduct
): {
  nuvemshop_product_id: number;
  name: string;
  description_html: string;
  price: number;
  images: string[];
  main_image: string | null;
  is_active: boolean;
} {
  const name =
    nuvemshopProduct.name["pt"] ||
    Object.values(nuvemshopProduct.name)[0] ||
    `Product ${nuvemshopProduct.id}`;

  const description_html = nuvemshopProduct.description || "";

  const price = nuvemshopProduct.variants?.[0]?.price || 0;

  const images = (nuvemshopProduct.images || []).map((img) => img.src);
  const main_image = images[0] || null;

  const is_active = nuvemshopProduct.published !== false;

  return {
    nuvemshop_product_id: nuvemshopProduct.id,
    name,
    description_html,
    price,
    images,
    main_image,
    is_active,
  };
}

async function upsertProducts(
  supabase: any,
  products: NuvemshopProduct[]
): Promise<SyncResult> {
  const result: SyncResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorMessages: [],
  };

  for (const nuvemProduct of products) {
    try {
      const mapped = mapProduct(nuvemProduct);

      const { data: existing } = await supabase
        .from("catalog_products")
        .select("id")
        .eq("nuvemshop_product_id", mapped.nuvemshop_product_id)
        .single();

      let upsertError = null;
      if (existing) {
        const { error } = await supabase
          .from("catalog_products")
          .update({
            ...mapped,
            updated_from_source_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("nuvemshop_product_id", mapped.nuvemshop_product_id);
        upsertError = error;
        if (!error) result.updated++;
      } else {
        const { error } = await supabase.from("catalog_products").insert({
          ...mapped,
          updated_from_source_at: new Date().toISOString(),
        });
        upsertError = error;
        if (!error) result.imported++;
      }

      if (upsertError) {
        result.errors++;
        result.errorMessages.push(
          `Product ${mapped.nuvemshop_product_id}: ${upsertError.message}`
        );
      }
    } catch (err) {
      result.errors++;
      result.errorMessages.push(
        `Error processing product: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-confirm-sync',
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }

  try {
    // Guard: require explicit confirmation header to prevent accidental sync
    const confirmHeader = req.headers.get("x-confirm-sync");
    if (confirmHeader !== "true") {
      return new Response(
        JSON.stringify({ error: "Missing x-confirm-sync header. Sync must be explicitly confirmed." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase credentials" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Audit: extract admin user ID from JWT ---
    let triggeredBy: string | null = null;
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7);
      try {
        // Decode JWT payload (no verification needed — Supabase gateway already validated)
        const payload = JSON.parse(atob(jwt.split(".")[1]));
        triggeredBy = payload.sub || null;
      } catch {
        // anon key or malformed — triggeredBy stays null
      }
    }

    // --- Rate limit: max 1 sync per 60 seconds per source ---
    const rateLimitKey = `sync:nuvemshop:${triggeredBy || "anon"}`;
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: rateLimitKey,
      p_max_requests: 1,
      p_window_seconds: 60,
    });
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: "Rate limited. Aguarde 60 segundos entre sincronizações." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    // --- Parse body for dry_run flag ---
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch {
      // empty body is OK for non-dry-run
    }

    const storeId = Deno.env.get("NUVEMSHOP_STORE_ID");
    const token = Deno.env.get("NUVEMSHOP_ACCESS_TOKEN");
    const userAgent = Deno.env.get("NUVEMSHOP_USER_AGENT");

    if (!storeId || !token || !userAgent) {
      return new Response(
        JSON.stringify({
          error: "Missing Nuvemshop configuration",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    // Fetch products from Nuvemshop
    const { products, error: fetchError } = await fetchNuvemshopProducts(
      storeId,
      token,
      userAgent
    );

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: fetchError }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    // --- Dry-run: compute preview without writing ---
    if (dryRun) {
      const preview = { to_import: 0, to_update: 0, unchanged: 0, total_source: products.length, details: [] as { name: string; action: string }[] };
      for (const nuvemProduct of products) {
        const mapped = mapProduct(nuvemProduct);
        const { data: existing } = await supabase
          .from("catalog_products")
          .select("id, name, price, is_active")
          .eq("nuvemshop_product_id", mapped.nuvemshop_product_id)
          .single();

        if (existing) {
          const changed = existing.name !== mapped.name || Number(existing.price) !== mapped.price || existing.is_active !== mapped.is_active;
          if (changed) {
            preview.to_update++;
            preview.details.push({ name: mapped.name, action: "update" });
          } else {
            preview.unchanged++;
          }
        } else {
          preview.to_import++;
          preview.details.push({ name: mapped.name, action: "import" });
        }
      }
      // Limit details to first 50 for payload size
      preview.details = preview.details.slice(0, 50);

      return new Response(
        JSON.stringify({ success: true, dry_run: true, preview }),
        { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // --- Real sync ---
    // Create sync run with audit info
    const { data: syncRun, error: syncRunError } = await supabase
      .from("catalog_sync_runs")
      .insert({
        status: "running",
        source: "nuvemshop",
        triggered_by: triggeredBy,
      })
      .select()
      .single();

    if (syncRunError || !syncRun) {
      return new Response(
        JSON.stringify({ error: `Failed to create sync run` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    const syncRunId = syncRun.id;

    // Upsert products
    const result = await upsertProducts(supabase, products);

    // Update sync run with results
    await supabase
      .from("catalog_sync_runs")
      .update({
        status: "success",
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        error_message:
          result.errorMessages.length > 0
            ? result.errorMessages.join("; ")
            : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRunId);

    return new Response(
      JSON.stringify({
        success: true,
        syncRunId,
        result: {
          imported: result.imported,
          updated: result.updated,
          total: result.imported + result.updated,
          errors: result.errors,
          errorMessages: result.errorMessages,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Error: ${message}` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }
});
