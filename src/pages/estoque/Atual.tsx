import { Navigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import StockPivotTable from '@/components/estoque/StockPivotTable'
import { AdminPage } from '@/components/admin/ui/AdminPage'

export default function EstoqueAtual() {
  const { role } = useAuth()

  if (role !== 'admin' && role !== 'administrativo') {
    return <Navigate to="/estoque/contagem" replace />
  }

  return (
    <EstoqueLayout>
      <AdminPage
        title="Estoque atual por unidade"
        description="Cruza a última declaração confirmada de cada loja, produto a produto — mesmo que tenha sido feita numa contagem anterior à mais recente. Não reflete vendas/consumo em tempo real."
      >
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {/* Chip de unidade/loja em violeta: exceção categórica (design-tokens §8) */}
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30">
              99 <TrendingUp className="w-3 h-3 shrink-0" />
            </span>
            estoque da loja mais que o dobro da meta daquela loja
          </p>
          <StockPivotTable />
        </div>
      </AdminPage>
    </EstoqueLayout>
  )
}
