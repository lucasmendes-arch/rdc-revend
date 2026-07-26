import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export const RhRoute = () => {
  const { role, hasPermission, loading } = useAuth()

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

  // Acesso ao módulo de RH+DP: admin e administrativo sempre; outros papéis
  // via permissão granular can_manage_rh (profiles.permissions), mesmo
  // padrão de can_edit_orders.
  if (role !== 'admin' && role !== 'administrativo' && !hasPermission('can_manage_rh')) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
