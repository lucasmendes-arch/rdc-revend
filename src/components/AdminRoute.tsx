import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export const AdminRoute = () => {
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

  if (role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
