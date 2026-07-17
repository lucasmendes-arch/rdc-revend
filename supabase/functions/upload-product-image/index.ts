import { AwsClient } from 'npm:aws4fetch'

const BUCKET = 'product-images'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const s3Api = Deno.env.get('S3_API')
    const publicBase = Deno.env.get('ENDPOINT')
    const accessKeyId = Deno.env.get('ACCESS_KEY_ID')
    const secretAccessKey = Deno.env.get('SECRET_ACCESS_KEY')

    if (!s3Api || !publicBase || !accessKeyId || !secretAccessKey) {
      return jsonResponse({ error: 'R2 credentials not configured' }, 500)
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return jsonResponse({ error: 'Expected multipart/form-data' }, 400)
    }

    const file = formData.get('file') as File | null
    if (!file) {
      return jsonResponse({ error: 'No file provided (field: "file")' }, 400)
    }

    const folderRaw = formData.get('folder')
    const folder = typeof folderRaw === 'string' && folderRaw.trim() ? folderRaw.trim().replace(/^\/+|\/+$/g, '') : 'products'

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const key = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
    const contentType = file.type || 'application/octet-stream'

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: 'auto',
      service: 's3',
    })

    const fileBuffer = await file.arrayBuffer()
    const uploadUrl = `${s3Api}/${BUCKET}/${key}`

    const r2Response = await aws.fetch(uploadUrl, {
      method: 'PUT',
      body: fileBuffer,
      headers: { 'Content-Type': contentType },
    })

    if (!r2Response.ok) {
      const errText = await r2Response.text()
      return jsonResponse({ error: `R2 upload failed: ${errText}` }, r2Response.status)
    }

    const url = `${publicBase}/${key}`
    return jsonResponse({ url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
