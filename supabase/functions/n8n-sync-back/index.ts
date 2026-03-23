// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

// Fields that ClickUp/n8n always overwrites
const CLICKUP_OWNED_FIELDS = [
  'clickup_task_id',
  'lead_status',
  'assigned_seller',
  'integration_notes',
  'last_synced_at',
] as const

// Fields that only get written if currently empty in the profile
const USER_OWNED_FIELDS = [
  'full_name',
  'phone',
  'document',
  'document_type',
  'address_street',
  'address_number',
  'address_complement',
  'address_neighborhood',
  'address_cep',
] as const

// Shared fields: written only if empty
const SHARED_FIELDS = [
  'business_type',
  'address_city',
  'address_state',
] as const

interface SyncRequest {
  user_id: string
  source: string
  fields: Record<string, unknown>
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // --- Auth: API key ---
    const apiKey = req.headers.get('x-api-key')
    const expectedKey = Deno.env.get('N8N_SYNC_API_KEY')

    if (!expectedKey) {
      console.error('N8N_SYNC_API_KEY not configured')
      return new Response(
        JSON.stringify({ ok: false, error: 'Server misconfiguration' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (!apiKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // --- Parse body ---
    const body: SyncRequest = await req.json()
    const { user_id, source, fields } = body

    if (!user_id || !fields || typeof fields !== 'object') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing user_id or fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // --- Supabase client (service_role to bypass RLS) ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // --- Fetch current profile ---
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single()

    if (fetchError || !profile) {
      return new Response(
        JSON.stringify({ ok: false, error: `Profile not found: ${fetchError?.message || 'null'}` }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // --- Build selective update ---
    const updates: Record<string, unknown> = {}
    const fieldsUpdated: string[] = []
    const fieldsSkipped: string[] = []

    // ClickUp-owned: always overwrite
    for (const field of CLICKUP_OWNED_FIELDS) {
      if (field in fields && fields[field] !== undefined) {
        updates[field] = fields[field]
        fieldsUpdated.push(field)
      }
    }

    // User-owned: only if currently empty
    for (const field of USER_OWNED_FIELDS) {
      if (field in fields && fields[field] !== undefined) {
        if (profile[field] === null || profile[field] === '' || profile[field] === undefined) {
          updates[field] = fields[field]
          fieldsUpdated.push(field)
        } else {
          fieldsSkipped.push(field)
        }
      }
    }

    // Shared: only if currently empty
    for (const field of SHARED_FIELDS) {
      if (field in fields && fields[field] !== undefined) {
        if (profile[field] === null || profile[field] === '' || profile[field] === undefined) {
          updates[field] = fields[field]
          fieldsUpdated.push(field)
        } else {
          fieldsSkipped.push(field)
        }
      }
    }

    // Always set metadata
    updates.last_synced_at = new Date().toISOString()
    updates.updated_by = source || 'n8n'

    // --- Apply update ---
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user_id)

      if (updateError) {
        return new Response(
          JSON.stringify({ ok: false, error: `Update failed: ${updateError.message}` }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // --- Audit: crm_events ---
    const { error: auditError } = await supabase
      .from('crm_events')
      .insert({
        user_id,
        event_type: 'profile_synced',
        metadata: {
          source: source || 'n8n',
          fields_updated: fieldsUpdated,
          fields_skipped: fieldsSkipped,
        },
      })

    if (auditError) {
      console.error('Audit insert failed (non-blocking):', auditError.message)
    }

    // --- Response ---
    return new Response(
      JSON.stringify({
        ok: true,
        user_id,
        fields_updated: fieldsUpdated,
        fields_skipped: fieldsSkipped,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('n8n-sync-back error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
