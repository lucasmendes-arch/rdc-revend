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
import { AdminPage } from '@/components/admin/ui/AdminPage'
import { Button } from '@/components/ui/button'
import AutomationsPanel from '@/components/automations/AutomationsPanel'
import { PROCESS_AUTOMATION_CONFIG } from '@/components/automations/entities'

export default function DpAutomacoes() {
  return (
    <AdminLayout>
      <AdminPage
        title="Automações da contratação"
        description="Regras que rodam sozinhas quando um processo muda de etapa, chega numa data ou fica parado"
        back={{ to: '/admin/dp/contratacao', label: 'Contratação' }}
        width="narrow"
        actions={
          <Button variant="secondary" asChild>
            <Link
              to="/admin/rh/automacoes"
              title="Modelos de mensagem, variáveis e credenciais de envio ficam na tela de RH"
              aria-label="Modelos e variáveis"
            >
              <ExternalLink />
              <span className="hidden sm:inline">Modelos e variáveis</span>
            </Link>
          </Button>
        }
      >
        <AutomationsPanel config={PROCESS_AUTOMATION_CONFIG} />
      </AdminPage>
    </AdminLayout>
  )
}
