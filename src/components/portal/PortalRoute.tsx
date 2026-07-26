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
          <div className="w-6 h-6 mx-auto mb-3 rounded-full border-2 border-border border-t-foreground animate-spin" />
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
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
