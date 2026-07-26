import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Package, ShoppingCart, Users, Warehouse, UserCog,
  Menu, X, ExternalLink, Tag, DollarSign,
  Megaphone, UserCheck, BadgeDollarSign, ChevronRight,
  ClipboardList, Briefcase, KanbanSquare, ListChecks, IdCard, Contact,
  Boxes, FileSignature,
} from 'lucide-react'
import logo from '@/assets/logo-rei-dos-cachos.png'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { AdminThemeProvider } from '@/contexts/AdminThemeContext'
import { useAuth } from '@/contexts/AuthContext'

type NavItem = { label: string; path: string; icon: React.ElementType }

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Comercial',
    items: [
      { label: 'Pedidos', path: '/admin/pedidos', icon: ShoppingCart },
      { label: 'Clientes', path: '/admin/clientes', icon: Users },
      { label: 'Vendedores', path: '/admin/vendedores', icon: UserCheck },
      { label: 'Financeiro', path: '/admin/financeiro', icon: DollarSign },
      { label: 'Tabelas de Preço', path: '/admin/tabelas-preco', icon: BadgeDollarSign },
      { label: 'Marketing', path: '/admin/marketing', icon: Megaphone },
    ],
  },
  {
    label: 'Catálogo & Estoque',
    items: [
      { label: 'Catálogo', path: '/admin/catalogo', icon: Package },
      { label: 'Categorias', path: '/admin/categorias', icon: Tag },
      { label: 'Estoque', path: '/admin/estoque', icon: Warehouse },
      { label: 'Contagem de Estoque', path: '/estoque/relatorio', icon: ClipboardList },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Usuários', path: '/admin/usuarios', icon: UserCog },
    ],
  },
]

// RH+DP tem acesso restrito (admin ou permissão can_manage_rh) — grupo
// separado, só aparece na sidebar pra quem tem acesso. Ordem segue o funil:
// Vagas → Candidatos → Contratação (kanban de admissão) → Parceiros
// (ativos) → itens de configuração (Cargos, Formulário). Automações é
// acessado direto pela tela de Candidatos, não fica na sidebar.
const rhNavGroup: { label: string; items: NavItem[] } = {
  label: 'Recursos Humanos',
  items: [
    { label: 'Vagas', path: '/admin/rh/vagas', icon: Briefcase },
    { label: 'Candidatos', path: '/admin/rh/candidatos', icon: KanbanSquare },
    { label: 'Contratação', path: '/admin/dp/contratacao', icon: ClipboardList },
    { label: 'Parceiros', path: '/admin/dp/colaboradores', icon: Contact },
    { label: 'Gerar Contrato', path: '/admin/dp/contratos', icon: FileSignature },
    { label: 'Cargos', path: '/admin/rh/cargos', icon: IdCard },
    { label: 'Formulário', path: '/admin/rh/formulario', icon: ListChecks },
  ],
}

// Estoque completo (Contagem, Pedidos, Relatório, Estoque Atual, Histórico,
// Config) pra quem tem has_full_stock_access() sem ser admin — hoje só
// role='administrativo'. Admin já enxerga o módulo via navGroups acima.
const estoqueNavGroup: { label: string; items: NavItem[] } = {
  label: 'Estoque',
  items: [
    { label: 'Contagem de Estoque', path: '/estoque/contagem', icon: Boxes },
  ],
}

function SidebarNavItem({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      // Mesma linha de navegação do PortalLayout: h-9, ícone 16, spine dourado.
      // Admin e portal deixaram de ter duas sidebars com regras próprias.
      className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] tracking-snug transition-colors ${
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60'
      }`}
    >
      {isActive && <span className="nav-spine" aria-hidden />}
      <Icon
        className={`w-4 h-4 shrink-0 transition-colors ${
          isActive ? 'text-sidebar-accent-foreground' : 'text-ink-400'
        }`}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const location = useLocation()
  const { role, hasPermission } = useAuth()
  const canManageRh = role === 'admin' || role === 'administrativo' || hasPermission('can_manage_rh')
  const hasFullStockAccess = role === 'admin' || role === 'administrativo'

  // admin enxerga tudo (navGroups já inclui Estoque); administrativo (e um
  // eventual can_manage_rh-only sem ser admin) só vê RH+DP e/ou Estoque —
  // nada do Comercial/Catálogo/Sistema, que continuam admin-only.
  const groups = role === 'admin'
    ? [...navGroups, rhNavGroup]
    : [
        ...(hasFullStockAccess ? [estoqueNavGroup] : []),
        ...(canManageRh ? [rhNavGroup] : []),
      ]

  const homePath = role === 'admin' ? '/admin/catalogo' : '/admin/rh/candidatos'

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    groups.forEach((group) => {
      if (group.items.some((item) => item.path === location.pathname)) {
        initial.add(group.label)
      }
    })
    return initial
  })

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  return (
    <>
      {/* Brand header */}
      <div className="px-3 h-14 flex items-center border-b border-sidebar-border">
        <div className="flex items-center justify-between gap-2 w-full">
          <Link
            to={homePath}
            onClick={onNavClick}
            className="flex items-center gap-2.5 min-w-0 rounded-md"
          >
            <div className="w-7 h-7 rounded-md border border-sidebar-border bg-background flex items-center justify-center shrink-0">
              <img src={logo} alt="" className="h-3.5 w-auto" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-sidebar-accent-foreground leading-none tracking-tight truncate">
                Rei dos Cachos
              </p>
              <p className="eyebrow mt-1">Admin</p>
            </div>
          </Link>
          <ThemeToggle className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-ink-400 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-none">
        {groups.map((group) => {
          const isOpen = expanded.has(group.label)
          const hasActive = group.items.some((item) => item.path === location.pathname)

          return (
            <div key={group.label} className="mb-0.5">
              <button
                onClick={() => toggle(group.label)}
                aria-expanded={isOpen}
                className={`w-full flex items-center justify-between h-8 px-3 rounded-md transition-colors ${
                  hasActive && !isOpen
                    ? 'text-sidebar-accent-foreground bg-sidebar-accent'
                    : 'text-ink-400 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60'
                }`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-eyebrow">
                  {group.label}
                </span>
                <ChevronRight
                  className={`w-3 h-3 shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="mt-0.5 mb-1 space-y-0.5">
                  {group.items.map((item) => (
                    <SidebarNavItem
                      key={item.path}
                      item={item}
                      isActive={location.pathname === item.path}
                      onClick={onNavClick}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3 pt-2 border-t border-sidebar-border">
        <Link
          to="/catalogo"
          onClick={onNavClick}
          className="flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] tracking-snug text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 transition-colors"
        >
          <ExternalLink className="w-4 h-4 shrink-0 text-ink-400" />
          <span>Ver site</span>
        </Link>
      </div>
    </>
  )
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { role } = useAuth()
  const homePath = role === 'admin' ? '/admin/catalogo' : '/admin/rh/candidatos'

  const sidebarBg = 'bg-sidebar'
  const borderColor = 'border-sidebar-border'

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col w-60 ${sidebarBg} fixed inset-y-0 left-0 z-40 border-r ${borderColor}`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <header
        className={`lg:hidden fixed top-0 inset-x-0 z-40 ${sidebarBg} text-sidebar-foreground h-14 flex items-center justify-between px-4 border-b ${borderColor}`}
      >
        <Link to={homePath} className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md border border-sidebar-border flex items-center justify-center">
            <img src={logo} alt="" className="h-3.5 w-auto" />
          </div>
          <span className="text-[13px] font-semibold text-sidebar-accent-foreground tracking-tight">Admin</span>
        </Link>
        <div className="flex items-center gap-0.5">
          <ThemeToggle className="h-9 w-9 flex items-center justify-center rounded-md text-ink-400 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu de navegação"
            aria-expanded={mobileOpen}
            className="h-9 w-9 flex items-center justify-center rounded-md text-ink-500 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {mobileOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={`lg:hidden fixed top-14 left-0 bottom-0 z-50 ${sidebarBg} text-sidebar-foreground w-60 flex flex-col border-r ${borderColor} shadow-xl`}
          >
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main Content */}
      {/* min-w-0 + overflow-x-hidden: sem isso, um item flex sem largura mínima
          definida cresce pra caber o conteúdo mais largo (ex: kanban de RH com
          13 colunas) e alarga a página inteira em vez de rolar só por dentro —
          mesma proteção que EstoqueLayout já tem. */}
      <main className="flex-1 min-w-0 overflow-x-hidden lg:ml-60 pt-14 lg:pt-0">
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
