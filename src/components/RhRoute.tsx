import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export const RhRoute = () => {
  const { role, hasPermission, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full gradient-gold flex items-center justify-center mx-auto mb-4 shadow-gold">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <p className="text-foreground font-medium">Verificando acesso...</p>
        </div>
      </div>
    )
  }

  // Acesso ao módulo de RH: admin sempre; outros papéis via permissão granular
  // can_manage_rh (profiles.permissions), mesmo padrão de can_edit_orders.
  if (role !== 'admin' && !hasPermission('can_manage_rh')) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
