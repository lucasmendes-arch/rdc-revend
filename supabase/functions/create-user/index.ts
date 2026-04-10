import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  'https://rdc-revend.vercel.app',
  'http://localhost:8080',
  'http://localhost:5173',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
  const allowedOrigin = (ALLOWED_ORIGINS.includes(origin) || isLocalhost) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  }
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

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase credentials" }),
        { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limiting: max 3 user creations per IP per 5 minutes
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown'

    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_key: `create-user:${clientIp}`,
      p_max_requests: 3,
      p_window_seconds: 300,
    })
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde alguns minutos.' }),
        { status: 429, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // Verify caller (admin or salao role required for this action)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Cabeçalho de autorização ausente" }),
        { status: 401, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ''
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada. Por favor, faça login novamente." }),
        { status: 401, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profile?.role !== 'admin' && profile?.role !== 'salao') {
      return new Response(
        JSON.stringify({ error: "Apenas administradores ou operadores de salão podem criar usuários" }),
        { status: 403, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const { email, password, role, full_name, phone } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email e senha são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres" }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    // Resolve role: salao and admin allowed; only admin can create another admin
    const CREATABLE_ROLES = ['admin', 'salao']
    const requestedRole = CREATABLE_ROLES.includes(role) ? role : 'user'
    const userRole = requestedRole === 'admin' && profile?.role !== 'admin' ? 'salao' : requestedRole

    // Create user via Supabase Admin API
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    const userId = userData.user.id;

    // Set role and additional details in profiles table
    const profileData = { 
      id: userId, 
      role: userRole,
      ...(full_name && { full_name }),
      ...(phone && { phone })
    };

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "id" });

    if (profileError) {
      return new Response(
        JSON.stringify({ error: `Usuário criado mas erro ao definir perfil: ${profileError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: userId, email, role: userRole, full_name, phone },
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
