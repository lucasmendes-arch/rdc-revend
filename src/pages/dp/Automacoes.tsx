// Automações do módulo DP (Contratação).
//
// Roda o mesmo painel da tela de RH (src/components/automations/), só que com o
// vocabulário de processo: gatilhos de etapa/data/tempo parado, e ações de
// mudar etapa, mandar WhatsApp ou anotar na linha do tempo.
//
// Modelos de mensagem, variáveis e credenciais de envio NÃO são duplicados aqui
// — são globais e continuam sendo editados na tela de RH, pra onde esta aponta.

import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import AutomationsPanel from '@/components/automations/AutomationsPanel'
import { PROCESS_AUTOMATION_CONFIG } from '@/components/automations/entities'

export default function DpAutomacoes() {
  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Automações da Contratação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Regras que rodam sozinhas quando um processo muda de etapa, chega numa data ou fica parado
            </p>
          </div>
          <Link
            to="/admin/rh/automacoes"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt transition-colors"
            title="Modelos de mensagem, variáveis e credenciais de envio ficam na tela de RH"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">Modelos e variáveis</span>
          </Link>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        <AutomationsPanel config={PROCESS_AUTOMATION_CONFIG} />
      </div>
    </AdminLayout>
  )
}
