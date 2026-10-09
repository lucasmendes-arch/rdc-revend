import { type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import {
  ClipboardList, Truck, LogOut, Settings, History, BarChart3, Boxes, LayoutGrid, Store,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo-rei-dos-cachos.png'
import { useMyStore } from '@/hooks/useMyStore'
import { useAuth } from '@/contexts/AuthContext'
import { AdminThemeProvider } from '@/contexts/AdminThemeContext'
import AdminLayout from '@/components/admin/AdminLayout'
import { PAGE_X } from '@/components/admin/ui/AdminPage'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import StyledSelect from '@/components/ui/styled-select'
import { cn } from '@/lib/utils'

/**
 * Casca do módulo de estoque.
 *
 * - admin / administrativo: o módulo vive DENTRO do AdminLayout (sidebar do
 *   sistema). A navegação do estoque vira uma barra de sub-abas (sublinhado
 *   ouro, mesmo desenho do PageTabs) com o seletor de loja à direita. Antes
 *   era uma casca separada, e clicar em "Contagem de estoque" no admin tirava
 *   a pessoa do sistema.
 * - equipe da loja (role='salao'): casca própria, enxuta, pensada pro
 *   celular — header h-14 hairline + a mesma barra de sub-abas.
 *
 * Em ambos os casos o conteúdo de cada página usa `AdminPage` (que só é
 * markup) — esta casca NÃO aplica padding no conteúdo.
 */

interface EstoqueLayoutProps {
  children: ReactNode
}

type EstoqueNavItem = { to: string; label: string; icon: LucideIcon }

function useEstoqueNav(): EstoqueNavItem[] {
  const { isCentral, isAdmin } = useMyStore()
  return [
    { to: '/estoque/contagem', label: 'Contagem', icon: ClipboardList },
    // Central separa/envia; admin supervisiona independente da loja de teste
    ...((isCentral || isAdmin) ? [{ to: '/estoque/pedidos', label: 'Pedidos', icon: Truck }] : []),
    ...(isAdmin
      ? [
          { to: '/estoque/relatorio', label: 'Relatório', icon: BarChart3 },
          { to: '/estoque/atual', label: 'Estoque atual', icon: Boxes },
          { to: '/estoque/historico', label: 'Histórico', icon: History },
          { to: '/estoque/config', label: 'Config', icon: Settings },
        ]
      : []),
  ]
}

function EstoqueTabs({ items }: { items: EstoqueNavItem[] }) {
  return (
    <nav aria-label="Estoque" className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none -mb-px">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => cn(
            'relative h-11 px-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            isActive ? 'text-foreground' : 'text-ink-500 hover:text-foreground',
          )}
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('w-4 h-4', isActive ? 'text-brand-strong' : 'text-ink-400')} />
              {label}
              {isActive && <span aria-hidden className="absolute left-2.5 right-2.5 bottom-0 h-0.5 rounded-full bg-brand" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function AdminStorePicker() {
  const { allStores, adminStoreSlug, setAdminStore } = useMyStore()
  return (
    <StyledSelect
      variant="inline"
      icon={<Store className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
      value={adminStoreSlug ?? ''}
      onChange={setAdminStore}
      placeholder="Selecionar loja"
      options={allStores.map((s) => ({ value: s.slug, label: `${s.name} (${s.type === 'central' ? 'central' : 'satélite'})` }))}
      className="w-full sm:w-64"
    />
  )
}

// ─── admin / administrativo ─────────────────────────────────────────────────

function EstoqueInAdmin({ children }: { children: ReactNode }) {
  const items = useEstoqueNav()
  return (
    <AdminLayout>
      <div className={cn(PAGE_X, 'border-b border-border')}>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-x-4 gap-y-2 pt-3 sm:pt-0">
          <div className="min-w-0 flex-1">
            <EstoqueTabs items={items} />
          </div>
          <div className="shrink-0 sm:py-2">
            <AdminStorePicker />
          </div>
        </div>
      </div>
      {children}
    </AdminLayout>
  )
}

// ─── equipe da loja ─────────────────────────────────────────────────────────

const HEADER_ACTION =
  'h-10 min-w-[2.5rem] px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-ink-500 hover:bg-muted hover:text-foreground transition-colors'

function EstoqueStoreShell({ children }: { children: ReactNode }) {
  const { store } = useMyStore()
  const items = useEstoqueNav()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    // overflow-x-clip: nenhuma tela do módulo pode alargar a página no mobile —
    // conteúdo largo (tabelas) rola dentro do próprio wrapper overflow-x-auto.
    <div className="min-h-screen bg-background overflow-x-clip">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
        <div className={cn(PAGE_X, 'h-14 max-w-6xl mx-auto flex items-center justify-between gap-3')}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto shrink-0" />
            <span className="w-px h-5 bg-border shrink-0" aria-hidden />
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-semibold text-foreground tracking-tight">Estoque</p>
              <p className="text-[12px] text-muted-foreground truncate">{store?.name || 'Carregando loja…'}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Link to="/salao" className={HEADER_ACTION} title="Trocar de módulo" aria-label="Trocar de módulo">
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Módulos</span>
            </Link>
            <ThemeToggle className={HEADER_ACTION} />
            <button type="button" onClick={handleLogout} className={HEADER_ACTION} title="Sair" aria-label="Sair">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Abas fora do header sticky: o header fica com exatamente h-14, que é
          o offset que as barras sticky das páginas usam (useEstoqueStickyTop). */}
      {items.length > 1 && (
        <div className="border-b border-border bg-background">
          <div className={cn(PAGE_X, 'max-w-6xl mx-auto')}>
            <EstoqueTabs items={items} />
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto">{children}</main>
    </div>
  )
}

/**
 * Offset (classe top-*) para barras sticky dentro das páginas do estoque:
 * abaixo do header mobile do admin (h-14, some no lg) ou do header h-14 da
 * casca da loja (sempre visível).
 */
export function useEstoqueStickyTop() {
  const { role } = useAuth()
  return role === 'admin' || role === 'administrativo' ? 'top-14 lg:top-0' : 'top-14'
}

export default function EstoqueLayout({ children }: EstoqueLayoutProps) {
  const { role } = useAuth()

  if (role === 'admin' || role === 'administrativo') {
    // AdminLayout já traz o AdminThemeProvider (tema dark do admin).
    return <EstoqueInAdmin>{children}</EstoqueInAdmin>
  }

  return (
    <AdminThemeProvider>
      <EstoqueStoreShell>{children}</EstoqueStoreShell>
    </AdminThemeProvider>
  )
}
