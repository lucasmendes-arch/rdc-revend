// Aviso de WhatsApp quando um contrato é gerado — compartilhado entre
// generate-contract-automation (formação/desligamento, disparo por trigger) e
// generate-contract (geração manual pela tela, incluindo o Contrato de
// Profissional Parceiro).
//
// Nasceu dentro da automation em 2026-07-22; virou módulo em 2026-08-22, para
// que a geração manual avisasse igual — o usuário conta com a mensagem como
// confirmação de que o documento saiu, e ela não pode depender de qual dos
// dois caminhos gerou.
//
// Tudo aqui é best-effort: o contrato JÁ existe quando a notificação roda, e
// falhar em avisar não pode derrubar a geração nem sujar a resposta.

// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(k: string): string | undefined } }

type ServiceClient = ReturnType<typeof createClient>

async function sendWhatsApp(
  serviceClient: ServiceClient,
  storeId: string,
  phone: string,
  candidateName: string,
  docLabel: string,
  link: string | null,
) {
  // Credencial da loja primeiro, global como rede de segurança — mesma ordem
  // de resolução do dispatcher de automações do RH.
  const { data: cred } = await serviceClient
    .from('store_whatsapp_credentials')
    .select('uazapi_url, uazapi_token, is_active')
    .eq('store_id', storeId)
    .maybeSingle()

  const uazapiUrl = cred?.is_active && cred?.uazapi_url ? cred.uazapi_url : Deno.env.get('UAZAPI_URL')
  const uazapiToken = cred?.is_active && cred?.uazapi_token ? cred.uazapi_token : Deno.env.get('UAZAPI_TOKEN')
  if (!uazapiUrl || !uazapiToken) {
    console.warn('Sem credencial Uazapi disponível (nem por loja, nem global) — notificação não enviada')
    return
  }

  // `null` (e não `''`) pra linha ausente: o filtro precisa derrubar só o
  // link inexistente, sem levar junto a linha em branco proposital depois do
  // título — era o que `filter(Boolean)` fazia, deixando a mensagem colada.
  const message = [
    `📄 *${docLabel} gerado*`,
    ``,
    `👤 Candidato: ${candidateName}`,
    link ? `🔗 ${link}` : null,
  ].filter((line) => line !== null).join('\n')

  try {
    const res = await fetch(`${uazapiUrl}/send/text?token=${encodeURIComponent(uazapiToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text: message }),
    })
    if (!res.ok) console.warn('Falha ao enviar WhatsApp (non-blocking):', await res.text())
  } catch (err) {
    console.warn('Erro ao enviar WhatsApp (non-blocking):', err)
  }
}

// Avisa o responsável vinculado ao candidato (`candidates.assignee_id`).
// Sem responsável, ou sem WhatsApp no perfil dele, ninguém é avisado — em
// silêncio, de propósito: é uma confirmação, não uma etapa do processo.
export async function notifyContractGenerated(
  serviceClient: ServiceClient,
  input: {
    assigneeId: string | null | undefined
    storeId: string
    candidateName: string
    docLabel: string
    link: string | null
  },
) {
  const { assigneeId, storeId, candidateName, docLabel, link } = input
  if (!assigneeId) return

  const { data: responsavel } = await serviceClient
    .from('profiles')
    .select('whatsapp_number')
    .eq('id', assigneeId)
    .maybeSingle()
  if (!responsavel?.whatsapp_number) return

  await sendWhatsApp(serviceClient, storeId, responsavel.whatsapp_number, candidateName, docLabel, link)
}
