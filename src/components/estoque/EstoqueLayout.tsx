import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { ClipboardList, Truck, LogOut, Sun, Moon, Warehouse, Settings, History, BarChart3, LayoutGrid } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMyStore } from '@/hooks/useMyStore'

const THEME_KEY = 'rdc-admin-theme'

interface EstoqueLayoutProps {
  children: ReactNode
}

export default function EstoqueLayout({ children }: EstoqueLayoutProps) {
  const { store, isCentral, isAdmin, allStores, adminStoreSlug, setAdminStore } = useMyStore()

  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark' } catch { return false }
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light') } catch { /* ignore */ }
    return () => { root.classList.remove('dark') }
  }, [isDark])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-surface-alt">
      <header className="bg-gold border-b border-amber-600 px-4 sm:px-6 h-14 flex items-center sticky top-0 z-40">
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <Warehouse className="w-6 h-6 text-white" />
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm leading-tight">Estoque</span>
              {isAdmin ? (
                <select
                  value={adminStoreSlug ?? ''}
                  onChange={(e) => setAdminStore(e.target.value)}
                  className="text-[10px] bg-transparent text-white/90 border-b border-white/30 leading-tight focus:outline-none max-w-[140px]"
                >
                  <option value="" disabled className="text-black">Selecionar loja (teste)</option>
                  {allStores.map((s) => (
                    <option key={s.id} value={s.slug} className="text-black">
                      {s.name} ({s.type === 'central' ? 'central' : 'satélite'})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-white/70 text-[10px] leading-tight">{store?.name || 'Carregando loja…'}</span>
              )}
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink to="/estoque/contagem" className={navLinkClass}>
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Contagem</span>
            </NavLink>
            {isCentral && (
              <NavLink to="/estoque/pedidos" className={navLinkClass}>
                <Truck className="w-4 h-4" />
                <span className="hidden sm:inline">Pedidos</span>
              </NavLink>
            )}
            {isAdmin && (
              <>
                <NavLink to="/estoque/relatorio" className={navLinkClass}>
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Relatório</span>
                </NavLink>
                <NavLink to="/estoque/historico" className={navLinkClass}>
                  <History className="w-4 h-4" />
                  <span className="hidden sm:inline">Histórico</span>
                </NavLink>
                <NavLink to="/estoque/config" className={navLinkClass}>
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Config</span>
                </NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            {isAdmin ? (
              <Link
                to="/admin/catalogo"
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-1.5 text-sm"
                title="Voltar ao Admin"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            ) : (
              <Link
                to="/salao"
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-1.5 text-sm"
                title="Trocar de módulo"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Módulos</span>
              </Link>
            )}
            <button
              onClick={() => setIsDark(v => !v)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-1.5 text-sm"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        {children}
      </div>
    </div>
  )
}
