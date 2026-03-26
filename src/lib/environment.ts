/**
 * Environment detection utilities.
 * Uses VITE_SUPABASE_URL to determine if the app is connected to production.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''

/** True when the frontend is pointing at the production Supabase project */
export const isProduction = !!(
  supabaseUrl &&
  !supabaseUrl.includes('localhost') &&
  !supabaseUrl.includes('127.0.0.1') &&
  !supabaseUrl.includes('placeholder')
)

/** Human-readable label for the current environment */
export const environmentLabel: string = isProduction ? 'PRODUÇÃO' : 'LOCAL / DEV'
