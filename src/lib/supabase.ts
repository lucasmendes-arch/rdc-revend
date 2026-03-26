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

/** Call a Supabase Edge Function (refreshes session then invokes) */
export async function callEdgeFunction(functionName: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  await supabase.auth.refreshSession()
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: extraHeaders,
  })

  if (error) {
    throw new Error(error.message || `Edge function error: ${functionName}`)
  }

  return data
}
