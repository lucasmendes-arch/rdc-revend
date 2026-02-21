console.log("✅ Test function loaded");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  console.log("📡 Test request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ message: "Test OK", timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
