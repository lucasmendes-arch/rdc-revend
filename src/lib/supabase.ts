import { createClient } from '@supabase/supabase-js'
import { FunctionsHttpError } from '@supabase/functions-js'

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

/** Call a Supabase Edge Function (refreshes session then invokes with explicit token) */
export async function callEdgeFunction(functionName: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  await supabase.auth.refreshSession()
  const { data: authData } = await supabase.auth.getSession()
  const token = authData.session?.access_token

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
  })

  if (error) {
    let message = error.message || `Edge function error: ${functionName}`
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        if (body?.error) message = body.error
      } catch {
        // context não era JSON ou já foi consumido — mantém a mensagem genérica
      }
    }
    throw new Error(message)
  }

  return data
}
