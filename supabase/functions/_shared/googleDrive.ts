// Autenticação + operações de Drive/Docs compartilhadas entre
// generate-contract (manual, JWT de usuário) e generate-contract-automation
// (automático, disparado por trigger no banco via pg_net). Primeira vez que
// este projeto usa uma pasta _shared/ — justificado pela duplicação real
// entre as 2 functions.
// @ts-expect-error Deno import
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5'

declare const Deno: { env: { get(k: string): string | undefined } }

export async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKeyRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Credenciais da service account do Google não configuradas')
  }
  const privateKeyPem = privateKeyRaw.includes('\\n') ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')

  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Falha ao autenticar com o Google: ${errText}`)
  }
  const data = await res.json()
  return data.access_token as string
}

// Busca uma subpasta pelo nome dentro de parentId; cria se não existir.
// Usado pra pasta da unidade e, dentro dela, a pasta do candidato.
export async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'")
  const query = `'${parentId}' in parents and name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!searchRes.ok) throw new Error(`Falha ao buscar pasta no Drive: ${await searchRes.text()}`)
  const searchData = await searchRes.json()
  if (searchData.files?.length > 0) return searchData.files[0].id as string

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!createRes.ok) throw new Error(`Falha ao criar pasta no Drive: ${await createRes.text()}`)
  const createData = await createRes.json()
  return createData.id as string
}

export async function copyTemplate(accessToken: string, templateId: string, name: string, folderId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [folderId] }),
  })
  if (!res.ok) throw new Error(`Falha ao copiar template no Drive: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

export interface FieldMap { [placeholder: string]: string }

export async function replacePlaceholders(accessToken: string, documentId: string, fieldMap: FieldMap): Promise<void> {
  const requests = Object.entries(fieldMap).map(([placeholder, value]) => ({
    replaceAllText: {
      containsText: { text: placeholder, matchCase: true },
      replaceText: value,
    },
  }))
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`Falha ao preencher o contrato: ${await res.text()}`)
}

export async function getWebViewLink(accessToken: string, documentId: string): Promise<string | null> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}?fields=webViewLink`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.webViewLink ?? null
}

// {{dia_assinatura}}/{{mes_assinatura}} (por extenso)/{{ano_assinatura}} —
// convenção dos templates de formação/desligamento.
const PT_MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function decomposeDatePtBR(iso: string): { dia: string; mes: string; ano: string } {
  const [y, m, d] = iso.split('-')
  return { dia: String(parseInt(d, 10)), mes: PT_MONTHS[parseInt(m, 10) - 1], ano: y }
}

export function formatDateBR(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
