import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { ClipboardList, Truck, LogOut, Sun, Moon, Settings, History, BarChart3, Boxes, LayoutGrid } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo-rei-dos-cachos.png'
import { useMyStore } from '@/hooks/useMyStore'
import { useAuth } from '@/contexts/AuthContext'
import StyledSelect from '@/components/ui/styled-select'

const THEME_KEY = 'rdc-admin-theme'

interface EstoqueLayoutProps {
  children: ReactNode
}

export default function EstoqueLayout({ children }: EstoqueLayoutProps) {
  const { store, isCentral, isAdmin, allStores, adminStoreSlug, setAdminStore } = useMyStore()
  const { role } = useAuth()

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
      isActive ? 'bg-muted text-foreground [&_svg]:text-brand-strong' : 'text-ink-500 hover:bg-muted hover:text-foreground'
    }`

  return (
    // overflow-x-clip: nenhuma tela do módulo pode alargar a página no mobile —
    // conteúdo largo (tabelas) rola dentro do próprio wrapper overflow-x-auto.
    <div className="min-h-screen bg-surface-alt overflow-x-clip">
      <header className="bg-background/90 backdrop-blur border-b border-border px-3 sm:px-6 h-14 flex items-center sticky top-0 z-40">
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto shrink-0" />
            <div className="flex flex-col">
              <span className="text-foreground font-semibold text-[13px] tracking-tight leading-tight">Estoque</span>
              {isAdmin ? (
                <StyledSelect
                  variant="bare"
                  value={adminStoreSlug ?? ''}
                  onChange={setAdminStore}
                  placeholder="Selecionar loja (teste)"
                  options={allStores.map((s) => ({ value: s.slug, label: `${s.name} (${s.type === 'central' ? 'central' : 'satélite'})` }))}
                  className="text-[10px] text-muted-foreground border-b border-border leading-tight max-w-[140px]"
                />
              ) : (
                <span className="text-muted-foreground text-[10px] leading-tight">{store?.name || 'Carregando loja…'}</span>
              )}
            </div>
          </div>

          {/* No mobile o nav rola horizontal em vez de empurrar a largura da página */}
          <nav className="flex items-center gap-1 min-w-0 overflow-x-auto">
            <NavLink to="/estoque/contagem" className={navLinkClass}>
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Contagem</span>
            </NavLink>
            {/* Central separa/envia; admin supervisiona independente da loja de teste */}
            {(isCentral || isAdmin) && (
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
                <NavLink to="/estoque/atual" className={navLinkClass}>
                  <Boxes className="w-4 h-4" />
                  <span className="hidden sm:inline">Estoque Atual</span>
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
            {role === 'admin' ? (
              <Link
                to="/admin/catalogo"
                className="p-2 hover:bg-muted hover:text-foreground rounded-lg transition-colors text-ink-500 flex items-center gap-1.5 text-sm"
                title="Voltar ao Admin"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            ) : role === 'administrativo' ? (
              <Link
                to="/admin/rh/candidatos"
                className="p-2 hover:bg-muted hover:text-foreground rounded-lg transition-colors text-ink-500 flex items-center gap-1.5 text-sm"
                title="Voltar ao RH"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">RH</span>
              </Link>
            ) : (
              <Link
                to="/salao"
                className="p-2 hover:bg-muted hover:text-foreground rounded-lg transition-colors text-ink-500 flex items-center gap-1.5 text-sm"
                title="Trocar de módulo"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Módulos</span>
              </Link>
            )}
            <button
              onClick={() => setIsDark(v => !v)}
              className="p-2 hover:bg-muted hover:text-foreground rounded-lg transition-colors text-ink-500"
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-muted hover:text-foreground rounded-lg transition-colors text-ink-500 flex items-center gap-1.5 text-sm"
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
