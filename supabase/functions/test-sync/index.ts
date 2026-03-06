console.log("✅ Test function loaded");

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

Deno.serve(async (req) => {
  console.log("📡 Test request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  return new Response(JSON.stringify({ message: "Test OK", timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
  });
});
