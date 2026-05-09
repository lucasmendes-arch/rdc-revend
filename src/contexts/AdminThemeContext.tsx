import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'rdc-admin-theme'

interface AdminThemeCtx {
  isDark: boolean
  toggle: () => void
}

const AdminThemeContext = createContext<AdminThemeCtx>({ isDark: false, toggle: () => {} })

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'dark' } catch { return false }
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // Remove dark when admin unmounts (user navigates to catalog)
    return () => { root.classList.remove('dark') }
  }, [isDark])

  const toggle = () => {
    setIsDark(prev => {
      const next = !prev
      const value = next ? 'dark' : 'light'
      try {
        localStorage.setItem(STORAGE_KEY, value)
        localStorage.setItem('rdc-theme', value)
      } catch {}
      return next
    })
  }

  return (
    <AdminThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </AdminThemeContext.Provider>
  )
}

export const useAdminTheme = () => useContext(AdminThemeContext)
