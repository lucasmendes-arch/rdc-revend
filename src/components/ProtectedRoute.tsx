import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export const ProtectedRoute = () => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full gradient-gold flex items-center justify-center mx-auto mb-4 shadow-gold">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <p className="text-foreground font-medium">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />
  }

  return <Outlet />
}
