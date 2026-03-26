import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase não configurado. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local'
  )
}

// Usar valores placeholder se não configurados (para desenvolvimento)
const url = supabaseUrl || 'https://placeholder.supabase.co'
const key = supabaseAnonKey || 'placeholder-key'

export const supabase = createClient(url, key)

/** Call a Supabase Edge Function via fetch (uses admin session JWT when available) */
export async function callEdgeFunction(functionName: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || supabaseAnonKey
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || data.message || `Edge function error: ${response.status}`)
  }

  return response.json()
}
