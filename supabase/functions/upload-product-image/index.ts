// Upload de arquivos pro R2. Corrigido no checkup 2026-07-23 (item S-02):
// antes não tinha autenticação nenhuma — não lia Authorization, não chamava
// getUser(), CORS '*' — e ia direto do formData pro PUT no R2 com as
// credenciais de serviço. Confirmado explorável em produção com a chave anon.
//
// A autenticação é POR PASTA porque o formulário público de candidatura
// (/candidatura/:storeSlug, fora do ProtectedRoute) sobe foto e currículo
// sem sessão — exigir login em tudo derrubaria esse fluxo. Ver ALLOWED_FOLDERS.
// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'npm:aws4fetch'

declare const Deno: { env: { get(k: string): string | undefined } }

const BUCKET = 'product-images'

const ALLOWED_ORIGINS = [
  'https://rdc-os.vercel.app',
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

// Extensão derivada do MIME validado no servidor, nunca do nome do arquivo
// que o cliente mandou (era assim antes: `file.name.split('.').pop()`).
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const DOC_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  'application/pdf': 'pdf',
}

const MB = 1024 * 1024

// Allowlist fechada — o `folder` do cliente só pode casar exatamente com uma
// destas chaves (antes era regex de sanitização, que não bloqueava '../' no
// meio da string). `public: true` = aceita anônimo, porque é o formulário
// público de candidatura que sobe.
const ALLOWED_FOLDERS: Record<string, { public: boolean; types: Record<string, string>; maxBytes: number }> = {
  'products':           { public: false, types: IMAGE_TYPES, maxBytes: 5 * MB },
  'banners':            { public: false, types: IMAGE_TYPES, maxBytes: 5 * MB },
  'lookbook':           { public: false, types: IMAGE_TYPES, maxBytes: 5 * MB },
  'candidates/photos':  { public: true,  types: IMAGE_TYPES, maxBytes: 5 * MB },
  'candidates/resumes': { public: true,  types: DOC_TYPES,   maxBytes: 10 * MB },
  'candidates/certificates': { public: true, types: IMAGE_TYPES, maxBytes: 5 * MB },
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  try {
    const s3Api = Deno.env.get('S3_API')
    const publicBase = Deno.env.get('ENDPOINT')
    const accessKeyId = Deno.env.get('ACCESS_KEY_ID')
    const secretAccessKey = Deno.env.get('SECRET_ACCESS_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!s3Api || !publicBase || !accessKeyId || !secretAccessKey) {
      return jsonResponse(req, { error: 'R2 credentials not configured' }, 500)
    }
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return jsonResponse(req, { error: 'Supabase credentials not configured' }, 500)
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return jsonResponse(req, { error: 'Expected multipart/form-data' }, 400)
    }

    // ── Pasta: allowlist exata, sem sanitização ────────────────────────────
    // Resolvida antes de tudo porque é ela que define o regime de
    // autenticação e os limites de conteúdo aplicados abaixo.
    const folderRaw = formData.get('folder')
    const folder = typeof folderRaw === 'string' && folderRaw.trim() ? folderRaw.trim() : 'products'
    const rules = ALLOWED_FOLDERS[folder]
    if (!rules) {
      return jsonResponse(req, { error: 'Pasta de destino inválida' }, 400)
    }

    // ── Autenticação ───────────────────────────────────────────────────────
    // Pastas privadas exigem sessão de verdade (getUser valida o JWT contra o
    // Auth — a chave anon é um JWT válido e pública, então checar só a
    // presença do header não autentica nada).
    if (!rules.public) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return jsonResponse(req, { error: 'Unauthorized' }, 401)

      const userClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authErr } = await userClient.auth.getUser()
      if (authErr || !user) return jsonResponse(req, { error: 'Unauthorized' }, 401)

      // products/banners/lookbook são escritos pelo admin (Catálogo, Pedidos)
      // e pelo módulo de Estoque (Config). A união cobre exatamente quem as
      // rotas já deixam entrar: is_estoque() = role 'salao' (renomeada, ver
      // 20260702000015) e has_full_stock_access() = admin + administrativo.
      const [{ data: isEstoque }, { data: hasFullStock }] = await Promise.all([
        userClient.rpc('is_estoque'),
        userClient.rpc('has_full_stock_access'),
      ])
      if (!isEstoque && !hasFullStock) {
        return jsonResponse(req, { error: 'Acesso negado' }, 403)
      }
    } else {
      // Pasta pública (formulário de candidatura): sem sessão, então limita
      // por IP pra não virar hospedagem gratuita. Mesma RPC usada por
      // create-user.
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || 'unknown'
      const serviceClient = createClient(supabaseUrl, supabaseService)
      const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
        p_key: `upload:${clientIp}`,
        p_max_requests: 10,
        p_window_seconds: 600,
      })
      if (allowed === false) {
        return jsonResponse(req, { error: 'Muitos envios. Aguarde alguns minutos.' }, 429)
      }
    }

    // ── Conteúdo: tipo e tamanho ───────────────────────────────────────────
    const file = formData.get('file') as File | null
    if (!file) {
      return jsonResponse(req, { error: 'No file provided (field: "file")' }, 400)
    }

    const ext = rules.types[file.type]
    if (!ext) {
      return jsonResponse(req, {
        error: `Tipo de arquivo não permitido (${file.type || 'desconhecido'})`,
      }, 400)
    }
    if (file.size > rules.maxBytes) {
      return jsonResponse(req, {
        error: `Arquivo maior que o limite de ${Math.round(rules.maxBytes / MB)}MB`,
      }, 400)
    }

    const key = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' })

    const fileBuffer = await file.arrayBuffer()
    const r2Response = await aws.fetch(`${s3Api}/${BUCKET}/${key}`, {
      method: 'PUT',
      body: fileBuffer,
      headers: { 'Content-Type': file.type },
    })

    if (!r2Response.ok) {
      const errText = await r2Response.text()
      console.error('R2 upload failed:', r2Response.status, errText)
      return jsonResponse(req, { error: 'Falha ao enviar o arquivo' }, 502)
    }

    return jsonResponse(req, { url: `${publicBase}/${key}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('upload-product-image error:', message)
    return jsonResponse(req, { error: 'Erro interno no upload' }, 500)
  }
})
