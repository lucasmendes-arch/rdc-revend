import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ShoppingBag, Package, LineChart, Users, Boxes,
  Menu, X, ExternalLink, UserCog, type LucideIcon,
} from 'lucide-react'
import logo from '@/assets/logo-rei-dos-cachos.png'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { AdminThemeProvider } from '@/contexts/AdminThemeContext'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Navegação do admin em DUAS camadas.
 *
 * Antes eram ~20 links soltos em 4 grupos sanfonados na sidebar. Agora:
 *   1. Sidebar = poucas ÁREAS (Vendas, Catálogo, Resultados, Pessoas).
 *   2. Dentro da área, as páginas viram ABAS no topo do conteúdo.
 *
 * Uma área "possui" uma rota quando a rota começa com o prefixo de seção
 * (dois primeiros segmentos) de algum dos seus itens — é o que mantém
 * `/admin/pedidos/novo` dentro de Vendas e `/admin/rh/automacoes` dentro de
 * Pessoas mesmo sem aba própria.
 */

type NavItem = { label: string; path: string }
type Hub = { key: string; label: string; icon: LucideIcon; items: NavItem[] }

const vendasHub: Hub = {
  key: 'vendas',
  label: 'Vendas',
  icon: ShoppingBag,
  items: [
    { label: 'Pedidos', path: '/admin/pedidos' },
    { label: 'Clientes', path: '/admin/clientes' },
    { label: 'Vendedores', path: '/admin/vendedores' },
    { label: 'Tabelas de preço', path: '/admin/tabelas-preco' },
  ],
}

const catalogoHub: Hub = {
  key: 'catalogo',
  label: 'Catálogo',
  icon: Package,
  items: [
    { label: 'Produtos', path: '/admin/catalogo' },
    { label: 'Categorias', path: '/admin/categorias' },
    { label: 'Disponibilidade', path: '/admin/estoque' },
    { label: 'Contagem de estoque', path: '/estoque/relatorio' },
  ],
}

const resultadosHub: Hub = {
  key: 'resultados',
  label: 'Resultados',
  icon: LineChart,
  items: [
    { label: 'Financeiro', path: '/admin/financeiro' },
    { label: 'Unidades', path: '/admin/unidades' },
    { label: 'Marketing', path: '/admin/marketing' },
  ],
}

// Ordem segue o funil: Vagas → Candidatos → Contratação → Parceiros, depois
// o que é configuração. Automações abre pela tela de Candidatos.
const pessoasHub: Hub = {
  key: 'pessoas',
  label: 'Pessoas',
  icon: Users,
  items: [
    { label: 'Vagas', path: '/admin/rh/vagas' },
    { label: 'Candidatos', path: '/admin/rh/candidatos' },
    { label: 'Contratação', path: '/admin/dp/contratacao' },
    { label: 'Parceiros', path: '/admin/dp/colaboradores' },
    { label: 'Contratos', path: '/admin/dp/contratos' },
    { label: 'Cargos', path: '/admin/rh/cargos' },
    { label: 'Formulário', path: '/admin/rh/formulario' },
  ],
}

// Estoque completo para role='administrativo' (admin chega pelo Catálogo).
const estoqueHub: Hub = {
  key: 'estoque',
  label: 'Estoque',
  icon: Boxes,
  items: [{ label: 'Contagem de estoque', path: '/estoque/contagem' }],
}

function sectionPrefix(path: string) {
  return path.split('/').slice(0, 3).join('/')
}

function hubOwnsPath(hub: Hub, pathname: string) {
  return hub.items.some((item) => {
    if (pathname === item.path || pathname.startsWith(`${item.path}/`)) return true
    const prefix = sectionPrefix(item.path)
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}

function useHubs() {
  const { role, hasPermission } = useAuth()
  const canManageRh = role === 'admin' || role === 'administrativo' || hasPermission('can_manage_rh')
  const hubs: Hub[] = role === 'admin'
    ? [vendasHub, catalogoHub, resultadosHub, pessoasHub]
    : [
        ...(role === 'administrativo' ? [estoqueHub] : []),
        ...(canManageRh ? [pessoasHub] : []),
      ]
  const homePath = role === 'admin' ? '/admin/pedidos' : '/admin/rh/candidatos'
  return { hubs, homePath, isAdmin: role === 'admin' }
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
// Clara e densa, no padrão Linear/Lightfield. O ouro da logo aparece só no
// item ativo (ícone + traço de 2px) — é o único ponto de cor da navegação.

const NAV_ROW =
  'relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium tracking-snug transition-colors'
const NAV_IDLE = 'text-ink-600 hover:text-foreground hover:bg-ink-100'
const NAV_ACTIVE = 'bg-card text-foreground shadow-xs ring-1 ring-border'

function HubLink({ hub, active, onClick }: { hub: Hub; active: boolean; onClick?: () => void }) {
  const Icon = hub.icon
  return (
    <Link
      to={hub.items[0].path}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`${NAV_ROW} ${active ? NAV_ACTIVE : NAV_IDLE}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-strong' : 'text-ink-400'}`} />
      <span className="truncate">{hub.label}</span>
    </Link>
  )
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const location = useLocation()
  const { hubs, homePath, isAdmin } = useHubs()
  const onUsers = location.pathname === '/admin/usuarios'

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 h-16 flex items-center">
        <Link to={homePath} onClick={onNavClick} className="block rounded-md" aria-label="Rei dos Cachos — início">
          <img src={logo} alt="Rei dos Cachos" className="h-11 w-auto" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pt-2 space-y-0.5 scrollbar-none" aria-label="Áreas">
        {hubs.map((hub) => (
          <HubLink key={hub.key} hub={hub} active={hubOwnsPath(hub, location.pathname)} onClick={onNavClick} />
        ))}
      </nav>

      <div className="px-2.5 pb-3 pt-2 border-t border-border space-y-0.5">
        {isAdmin && (
          <Link
            to="/admin/usuarios"
            onClick={onNavClick}
            aria-current={onUsers ? 'page' : undefined}
            className={`${NAV_ROW} ${onUsers ? NAV_ACTIVE : NAV_IDLE}`}
          >
            <UserCog className={`w-4 h-4 shrink-0 ${onUsers ? 'text-brand-strong' : 'text-ink-400'}`} />
            Usuários
          </Link>
        )}
        <div className="flex items-center gap-0.5">
          <Link to="/catalogo" onClick={onNavClick} className={`flex-1 ${NAV_ROW} ${NAV_IDLE}`}>
            <ExternalLink className="w-4 h-4 shrink-0 text-ink-400" />
            Ver loja
          </Link>
          <ThemeToggle className="shrink-0 h-8 w-8 rounded-md text-ink-400 hover:text-foreground hover:bg-ink-100" />
        </div>
      </div>
    </div>
  )
}

// ─── Abas da área ──────────────────────────────────────────────────────────

function HubTabs() {
  const location = useLocation()
  const { hubs } = useHubs()
  const hub = hubs.find((h) => hubOwnsPath(h, location.pathname))
  if (!hub || hub.items.length < 2) return null

  return (
    <div className="bg-background border-b border-border">
      <div className="px-4 sm:px-6 lg:px-8 flex items-center gap-5 overflow-x-auto scrollbar-none">
        <p className="hidden md:block text-[13px] font-semibold text-foreground shrink-0">{hub.label}</p>
        <span className="hidden md:block w-px h-4 bg-border shrink-0" aria-hidden />
        <nav className="flex items-center gap-1 min-w-0" aria-label={`Páginas de ${hub.label}`}>
          {hub.items.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`relative h-11 px-2.5 flex items-center text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-foreground' : 'text-ink-500 hover:text-foreground'
                }`}
              >
                {item.label}
                {active && <span aria-hidden className="absolute left-2.5 right-2.5 bottom-0 h-0.5 rounded-full bg-brand" />}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

// ─── Shell ─────────────────────────────────────────────────────────────────

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { homePath } = useHubs()

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex flex-col w-56 bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        <SidebarContent />
      </aside>

      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-background/90 backdrop-blur border-b border-border h-14 flex items-center justify-between px-4">
        <Link to={homePath} className="flex items-center" aria-label="Rei dos Cachos — início">
          <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto" />
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu de navegação"
          aria-expanded={mobileOpen}
          className="h-9 w-9 flex items-center justify-center rounded-md text-ink-600 hover:bg-muted hover:text-foreground transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-14 left-0 bottom-0 z-50 w-64 bg-sidebar border-r border-sidebar-border shadow-xl">
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* min-w-0 + overflow-x-hidden: sem isso o kanban de RH (13 colunas)
          alarga a página inteira em vez de rolar por dentro. */}
      <main className="flex-1 min-w-0 overflow-x-hidden lg:ml-56 pt-14 lg:pt-0">
        <HubTabs />
        {children}
      </main>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminThemeProvider>
  )
}
