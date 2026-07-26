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
          <div className="w-6 h-6 mx-auto mb-3 rounded-full border-2 border-border border-t-foreground animate-spin" />
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
