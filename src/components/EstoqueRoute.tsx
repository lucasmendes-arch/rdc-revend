import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export const EstoqueRoute = () => {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 mx-auto mb-3 rounded-full border-2 border-border border-t-foreground animate-spin" />
          <p className="text-foreground font-medium">Verificando acesso...</p>
        </div>
      </div>
    )
  }

  // Colaborador de loja física é role='salao' (unificado com o módulo de
  // estoque em 2026-07-02) — admin também acessa, pra supervisionar/testar.
  // administrativo tem acesso completo ao módulo (sem loja fixa, como admin).
  if (role !== 'salao' && role !== 'admin' && role !== 'administrativo') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
