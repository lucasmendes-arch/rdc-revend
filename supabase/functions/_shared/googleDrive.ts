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

// CNPJ sai do banco só com dígitos (mesma regra do CPF, ver formatCPF) e
// precisa aparecer pontuado no contrato de parceria.
export function formatCNPJ(cnpj: string | null): string {
  if (!cnpj) return ''
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

// Percentual como aparece no contrato: "40%" pra valor redondo, "42,5%" pra
// fracionado (vírgula decimal, não ponto). numeric(5,2) chega do PostgREST
// como string ("40.00"), então normalizar aqui em vez de confiar no tipo.
export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isFinite(n)) return ''
  const rounded = Math.round(n * 100) / 100
  return `${String(rounded).replace('.', ',')}%`
}

// Vigência do contrato de parceria: 12 meses contados da assinatura (cláusula
// 4.1 do template, exigência do SINTRABEL-ES).
export const PARCERIA_TERM_MONTHS = 12

// Soma meses tratando fim de mês: 31/01 + 1 mês vira 28/02 (ou 29/02 em
// bissexto), não 03/03 como faria o rollover automático do Date.
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const targetMonthIndex = m - 1 + months
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDayOfTargetMonth)
  return new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10)
}

// Último dia de vigência: assinado em 22/08/2026, vale até 21/08/2027 — o
// dia seguinte já é o 13º mês, fora do prazo que o contrato estipula.
export function partnerTermEndISO(termStart: string): string {
  const sameDayNextTerm = addMonthsISO(termStart, PARCERIA_TERM_MONTHS)
  const [y, m, d] = sameDayNextTerm.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

// Razão social de MEI segue uma regra fixa da Receita: raiz do CNPJ (os 8
// primeiros dígitos, pontuados) + nome civil em maiúsculas — ex.
// "68.727.533 JAMILY TAVARES DA SILVA". Por isso `employee_contract_data.
// legal_name` é opcional: vazio, o contrato usa o valor derivado daqui, e
// só cai no nome puro quando nem CNPJ existe.
//
// Espelha meiLegalName() em src/lib/dpConstants.ts (Deno não compartilha
// build com o Vite) — mudou uma, mude a outra.
export function meiLegalName(cnpj: string | null | undefined, name: string): string {
  const digits = (cnpj || '').replace(/\D/g, '')
  const upperName = name.trim().toUpperCase()
  if (digits.length < 8) return upperName
  const root = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}`
  return `${root} ${upperName}`
}

// Pasta que contém um arquivo. Usada pra descobrir onde moram os modelos de
// contrato a partir do template padrão já cadastrado em contract_templates —
// evita um secret novo só pra guardar o ID de uma pasta que o próprio doc já
// sabe apontar.
export async function getParentFolderId(accessToken: string, fileId: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Falha ao ler a pasta do template: ${await res.text()}`)
  const data = await res.json()
  return (data.parents?.[0] as string) ?? null
}

export interface DriveDoc { id: string; name: string }

// Google Docs dentro de uma pasta, em ordem alfabética. É a lista de modelos
// base oferecida na hora de gerar o contrato: adicionar um modelo é jogar um
// doc na pasta, sem cadastro no banco.
export async function listDocsInFolder(accessToken: string, folderId: string): Promise<DriveDoc[]> {
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&orderBy=name&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Falha ao listar modelos no Drive: ${await res.text()}`)
  const data = await res.json()
  return (data.files ?? []) as DriveDoc[]
}

// Fecho dos contratos ("{{local}}, Data: 22/08/2026") — cidade/UF, não só o
// nome da unidade. A UF vem do banco em vez de fixa no código porque nem
// todas as unidades são do mesmo estado (Teixeira de Freitas é BA). Sem UF
// cadastrada, degrada pro nome puro em vez de imprimir uma barra solta.
export function resolveContractLocal(store: { name: string; uf?: string | null }): string {
  return store.uf ? `${store.name}/${store.uf}` : store.name
}
