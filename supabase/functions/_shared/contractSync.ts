// Devolve pro card de Contratação o que só o gerador de contrato sabe.
//
// Três dados nascem na geração e, sem isto, ficam presos nela: a pasta que
// acabou de ser criada no Drive, a idade (que sai da data de nascimento usada
// no próprio contrato) e a vigência do curso. A tela não tem como calcular
// nenhum dos três sozinha — o resultado era campo vazio no card com a
// informação existindo no Google Drive e em employee_contract_data.
//
// Vale pros dois caminhos de geração (automática pelo trigger e manual em
// /admin/dp/contratos), por isso mora aqui e não dentro de uma delas.

// @ts-expect-error Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ageFromBirthDateISO } from './googleDrive.ts'

type ServiceClient = ReturnType<typeof createClient>

export interface ContractCardSync {
  processId: string
  candidateId: string | null
  /** drive_folder_url que já está gravado no processo — não sobrescrevemos. */
  currentDriveFolderUrl: string | null
  /** Link da pasta da pessoa no Drive, recém-criada ou reaproveitada. */
  folderUrl: string | null
  /** Só pra contrato de formação: alimenta idade e vigência no card. */
  formacao: { birthDate: string | null; termStart: string | null; termEnd: string | null } | null
}

/**
 * Best-effort: qualquer falha vira console.warn e a geração segue. O contrato
 * já existe nesse ponto — derrubar a resposta por causa da sincronia faria o
 * chamador (trigger do Postgres ou a tela) concluir que a geração falhou.
 */
export async function syncContractDataToCard(client: ServiceClient, input: ContractCardSync): Promise<void> {
  // Link colado à mão é escolha de alguém: só preenchemos quando está vazio.
  if (input.folderUrl && !input.currentDriveFolderUrl) {
    const { error } = await client
      .from('employee_processes')
      .update({ drive_folder_url: input.folderUrl })
      .eq('id', input.processId)
    if (error) console.warn('Não gravou drive_folder_url (non-blocking):', error.message)
  }

  if (!input.formacao || !input.candidateId) return

  const patch: Record<string, string | number> = {}

  // A idade vem da data de nascimento que o contrato acabou de usar — dado
  // mais confiável que um número digitado meses antes, na triagem.
  const age = ageFromBirthDateISO(input.formacao.birthDate)
  if (age !== null) patch.age = age

  // "Data início" e "Data fim" do card passam a ser exatamente a vigência do
  // contrato, em vez de duas datas soltas herdadas do recrutamento.
  if (input.formacao.termStart) patch.start_date = input.formacao.termStart
  if (input.formacao.termEnd) patch.due_date = input.formacao.termEnd

  if (Object.keys(patch).length === 0) return

  const { error } = await client.from('candidates').update(patch).eq('id', input.candidateId)
  if (error) console.warn('Não sincronizou idade/vigência com o card (non-blocking):', error.message)
}
