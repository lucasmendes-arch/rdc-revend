// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const ALLOWED_ORIGINS = [
  'https://rdc-revend.vercel.app',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
  const allowedOrigin = (ALLOWED_ORIGINS.includes(origin) || isLocalhost) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/** Normalize to E.164 (+55XXXXXXXXXXX). Returns null if invalid. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  // Already has country code 55
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return '+' + digits
  }
  // Brazilian 10-digit (landline) or 11-digit (mobile)
  if (digits.length === 10 || digits.length === 11) {
    return '+55' + digits
  }
  return null
}

/** Generate a readable random password: 3 words-ish pattern, 8 chars alphanum */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  // Use crypto random bytes
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  for (const byte of arr) {
    pw += chars[byte % chars.length]
  }
  return pw
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  const corsHeaders = getCorsHeaders(req)

  function jsonError(message: string, status = 400) {
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  function jsonOk(data: unknown) {
    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Token de autenticação ausente', 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Auth check
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonError('Usuário não autenticado', 401)

    // Admin check
    const { data: callerProfile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileError || callerProfile?.role !== 'admin') {
      return jsonError('Acesso negado', 403)
    }

    const body = await req.json()
    const { action, profile_id, password: customPassword } = body as {
      action: 'create' | 'reset_password' | 'block' | 'unblock'
      profile_id: string
      password?: string
    }

    if (!action || !profile_id) return jsonError('action e profile_id são obrigatórios')

    // Load target profile
    const { data: profile, error: targetError } = await serviceClient
      .from('profiles')
      .select('id, full_name, phone, customer_segment, access_status, auth_phone')
      .eq('id', profile_id)
      .single()

    if (targetError || !profile) return jsonError('Parceiro não encontrado', 404)
    if (profile.customer_segment !== 'network_partner') {
      return jsonError('Perfil não é um parceiro da rede')
    }

    // ── CREATE ───────────────────────────────────────────────────────────────
    if (action === 'create') {
      if (profile.access_status !== 'not_created') {
        return jsonError('Acesso já foi criado. Use reset_password para alterar a senha.')
      }

      const rawPhone = profile.phone
      if (!rawPhone) return jsonError('Parceiro não possui telefone cadastrado')

      const normalizedPhone = normalizePhone(rawPhone)
      if (!normalizedPhone) return jsonError(`Telefone inválido para normalização E.164: "${rawPhone}"`)

      // Check uniqueness in profiles
      const { data: existing } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('auth_phone', normalizedPhone)
        .neq('id', profile_id)
        .maybeSingle()
      if (existing) return jsonError('Esse telefone já está em uso por outro parceiro')

      const finalPassword = customPassword?.trim() || generatePassword()

      // Update auth user: set phone + password + confirm phone (no OTP)
      const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(
        profile_id,
        {
          phone: normalizedPhone,
          password: finalPassword,
          // @ts-expect-error phone_confirm is valid but may not be typed
          phone_confirm: true,
        }
      )
      if (authUpdateError) {
        return jsonError(`Erro ao provisionar credenciais: ${authUpdateError.message}`, 500)
      }

      // Update profiles metadata
      const now = new Date().toISOString()
      await serviceClient
        .from('profiles')
        .update({
          access_status: 'active',
          auth_phone: normalizedPhone,
          credentials_created_at: now,
        })
        .eq('id', profile_id)

      return jsonOk({
        success: true,
        action: 'create',
        partner_name: profile.full_name,
        phone: normalizedPhone,
        created_password: finalPassword,
      })
    }

    // ── RESET PASSWORD ───────────────────────────────────────────────────────
    if (action === 'reset_password') {
      if (profile.access_status === 'not_created') {
        return jsonError('Acesso ainda não foi criado. Use create primeiro.')
      }

      const finalPassword = customPassword?.trim() || generatePassword()

      const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(
        profile_id,
        { password: finalPassword }
      )
      if (authUpdateError) {
        return jsonError(`Erro ao resetar senha: ${authUpdateError.message}`, 500)
      }

      const now = new Date().toISOString()
      await serviceClient
        .from('profiles')
        .update({ last_password_reset_at: now })
        .eq('id', profile_id)

      return jsonOk({
        success: true,
        action: 'reset_password',
        partner_name: profile.full_name,
        phone: profile.auth_phone,
        created_password: finalPassword,
      })
    }

    // ── BLOCK ────────────────────────────────────────────────────────────────
    if (action === 'block') {
      if (profile.access_status === 'not_created') {
        return jsonError('Acesso ainda não foi criado.')
      }
      if (profile.access_status === 'blocked') {
        return jsonError('Parceiro já está bloqueado.')
      }

      const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(
        profile_id,
        { ban_duration: '87600h' }
      )
      if (authUpdateError) {
        return jsonError(`Erro ao bloquear: ${authUpdateError.message}`, 500)
      }

      await serviceClient
        .from('profiles')
        .update({ access_status: 'blocked' })
        .eq('id', profile_id)

      return jsonOk({ success: true, action: 'block', partner_name: profile.full_name })
    }

    // ── UNBLOCK ──────────────────────────────────────────────────────────────
    if (action === 'unblock') {
      if (profile.access_status !== 'blocked') {
        return jsonError('Parceiro não está bloqueado.')
      }

      const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(
        profile_id,
        { ban_duration: 'none' }
      )
      if (authUpdateError) {
        return jsonError(`Erro ao desbloquear: ${authUpdateError.message}`, 500)
      }

      await serviceClient
        .from('profiles')
        .update({ access_status: 'active' })
        .eq('id', profile_id)

      return jsonOk({ success: true, action: 'unblock', partner_name: profile.full_name })
    }

    return jsonError(`Ação desconhecida: ${action}`)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
