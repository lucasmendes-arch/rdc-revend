import { useLayoutEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const THEME_KEY = 'rdc-admin-theme'

export const SalaoRoute = () => {
  const { role, loading } = useAuth()

  useLayoutEffect(() => {
    const isDark = (() => { try { return localStorage.getItem(THEME_KEY) === 'dark' } catch { return false } })()
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [])

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

  if (role !== 'salao') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
