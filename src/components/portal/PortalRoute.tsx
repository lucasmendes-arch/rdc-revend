import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Allowlist de e-mails com acesso ao Portal do Parceiro (fase MVP).
// Para ampliar o rollout: adicionar e-mails aqui ou substituir por flag no perfil.
const PORTAL_ALLOWED_EMAILS = ['lmendescapelini@gmail.com']

export const PortalRoute = () => {
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

  if (!PORTAL_ALLOWED_EMAILS.includes(user.email ?? '')) {
    return <Navigate to="/catalogo" replace />
  }

  return <Outlet />
}
