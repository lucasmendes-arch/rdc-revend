// Autenticação + operações de Drive/Docs compartilhadas entre
// generate-contract (manual, JWT de usuário) e generate-contract-automation
// (automático, disparado por trigger no banco via pg_net). Primeira vez que
// este projeto usa uma pasta _shared/ — justificado pela duplicação real
// entre as 2 functions.

declare const Deno: { env: { get(k: string): string | undefined } }

// Pastas "Unidade X" já existem no Drive (criadas manualmente antes desta
// automação) — o nome nem sempre é "Unidade " + stores.name (ex: loja
// "Teixeira de Freitas" → pasta "Unidade Teixeira", não "Unidade Teixeira
// de Freitas"). Mapeado por slug (mais estável que name) em 2026-07-23
// depois de conferir os nomes reais das pastas no Drive.
const UNIT_FOLDER_NAME_BY_SLUG: Record<string, string> = {
  linhares: 'Unidade Linhares',
  serra: 'Unidade Serra',
  teixeira: 'Unidade Teixeira',
  colatina: 'Unidade Colatina',
  'sao-gabriel': 'Unidade São Gabriel da Palha',
}

export function resolveUnitFolderName(slug: string, storeName: string): string {
  return UNIT_FOLDER_NAME_BY_SLUG[slug] || `Unidade ${storeName}`
}

// Autenticação via OAuth (refresh token de uma conta pessoal do Google),
// não service account — service account não tem cota própria de
// armazenamento numa conta pessoal (sem Google Workspace/Shared Drive), e
// falha com "storage quota exceeded" ao tentar copiar/criar arquivo (erro
// real encontrado testando com um processo real em 2026-07-22). Refresh
// token gerado uma vez via OAuth Playground, nunca expira sozinho (só se
// revogado manualmente ou sem uso por 6 meses).
export async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciais OAuth do Google não configuradas')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
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

// O banco guarda CPF só com dígitos (sem máscara) e o WhatsApp em formatos
// mistos — ora com o 55 na frente (5527996132417), ora sem (27981282900),
// herança de cadastros de origens diferentes. No documento os dois precisam
// sair pontuados, então a formatação acontece aqui, na hora de gerar, sem
// mexer no que está persistido.
export function formatCPF(cpf: string | null): string {
  if (!cpf) return ''
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

// Formato pedido: (27)99999-9999. Fixo de 8 dígitos vira (27)9999-9999.
// Qualquer coisa fora desses tamanhos volta como veio — melhor um número sem
// máscara no contrato do que um número mutilado por uma suposição errada.
export function formatPhoneBR(phone: string | null): string {
  if (!phone) return ''
  let digits = phone.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  if (digits.length !== 10 && digits.length !== 11) return phone
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  return `(${ddd})${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Duração do curso de formação, em dias ÚTEIS.
export const FORMACAO_COURSE_BUSINESS_DAYS = 10

// O curso conta só dias de semana (sábado e domingo não valem), e o próprio
// dia de início é o primeiro dia útil: começando na segunda 10/08, o décimo
// dia útil cai na sexta 21/08 — não em 20/08, que era o resultado da contagem
// corrida usada antes.
//
// Feriados não entram na conta: o sistema não tem calendário de feriados, e
// chutar um (nacional? estadual? municipal, com 5 unidades em cidades
// diferentes?) erraria mais do que ignorar. Se precisar, ajuste a data final
// pelo caminho manual em /admin/dp/contratos.
export function addBusinessDaysISO(iso: string, businessDays: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  let counted = 0
  for (;;) {
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) counted++
    if (counted >= businessDays) break
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return date.toISOString().slice(0, 10)
}

// Idade em anos completos hoje, a partir da data de nascimento (ISO).
// Aniversário que ainda não chegou no ano corrente desconta um ano — comparar
// só o ano erraria em metade dos casos. Devolve null pra data ausente,
// malformada ou futura (digitação errada não vira idade negativa).
export function ageFromBirthDateISO(iso: string | null | undefined): number | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null

  const today = new Date()
  let age = today.getUTCFullYear() - y
  const beforeBirthday =
    today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)
  if (beforeBirthday) age--

  return age >= 0 && age < 130 ? age : null
}
