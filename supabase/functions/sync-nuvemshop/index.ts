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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase credentials" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Create sync run
    const { data: syncRun, error: syncRunError } = await supabase
      .from("catalog_sync_runs")
      .insert({ status: "running" })
      .select()
      .single();

    if (syncRunError || !syncRun) {
      return new Response(
        JSON.stringify({ error: `Failed to create sync run` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const syncRunId = syncRun.id;

    // Fetch products from Nuvemshop
    const { products, error: fetchError } = await fetchNuvemshopProducts(
      storeId,
      token,
      userAgent
    );

    if (fetchError) {
      await supabase
        .from("catalog_sync_runs")
        .update({
          status: "error",
          error_message: fetchError,
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRunId);

      return new Response(
        JSON.stringify({ error: fetchError, syncRunId }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

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
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Error: ${message}` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
