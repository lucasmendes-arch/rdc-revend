import { Navigate } from 'react-router-dom'
import { Boxes, TrendingUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import EstoqueLayout from '@/components/estoque/EstoqueLayout'
import StockPivotTable from '@/components/estoque/StockPivotTable'

export default function EstoqueAtual() {
  const { role } = useAuth()

  if (role !== 'admin' && role !== 'administrativo') {
    return <Navigate to="/estoque/contagem" replace />
  }

  return (
    <EstoqueLayout>
      <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-amber-600" />
          <h1 className="text-lg font-bold text-foreground">Estoque atual por unidade</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Cruza a última declaração confirmada de cada loja, produto a produto — mesmo que tenha sido feita numa contagem anterior à mais recente. Não reflete vendas/consumo em tempo real.
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
            99 <TrendingUp className="w-3 h-3 shrink-0" />
          </span>
          estoque da loja mais que o dobro da meta daquela loja
        </p>
      </div>

      <StockPivotTable />
    </EstoqueLayout>
  )
}
