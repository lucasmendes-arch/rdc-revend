// Modelos base disponíveis pra um tipo de contrato — os Google Docs que
// estiverem na mesma pasta do Drive onde mora o template padrão cadastrado em
// contract_templates. Adicionar um modelo é jogar um doc nessa pasta; não há
// cadastro no banco (decisão do usuário em 2026-08-22).
//
// Só lê: quem gera o contrato é `generate-contract`, que revalida a pasta
// antes de copiar qualquer doc.
// @ts-expect-error Deno import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getGoogleAccessToken, getParentFolderId, listDocsInFolder } from '../_shared/googleDrive.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

const ALLOWED_ORIGINS = ['https://rdc-os.vercel.app']

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const isLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
  const allowed = ALLOWED_ORIGINS.includes(origin) || isLocal ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(req ? corsHeaders(req) : {}) },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401, req)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401, req)

    const { data: hasAccess, error: accessErr } = await userClient.rpc('has_rh_access')
    if (accessErr || !hasAccess) return json({ error: 'Acesso negado' }, 403, req)

    const { contract_type } = await req.json()
    if (!contract_type) return json({ error: 'contract_type é obrigatório' }, 400, req)

    const serviceClient = createClient(supabaseUrl, supabaseService)
    const { data: template } = await serviceClient
      .from('contract_templates')
      .select('google_doc_id, is_active')
      .eq('contract_type', contract_type)
      .maybeSingle()
    if (!template || !template.is_active) {
      return json({ error: `Template de contrato "${contract_type}" não configurado` }, 400, req)
    }

    const accessToken = await getGoogleAccessToken()
    const folderId = await getParentFolderId(accessToken, template.google_doc_id)
    if (!folderId) {
      // Doc solto na raiz do Drive: sem pasta não há lista, mas o padrão
      // continua utilizável.
      return json({ templates: [{ id: template.google_doc_id, name: 'Modelo padrão' }], default_id: template.google_doc_id }, 200, req)
    }

    const docs = await listDocsInFolder(accessToken, folderId)
    return json({ templates: docs, default_id: template.google_doc_id }, 200, req)
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500, req)
  }
})
