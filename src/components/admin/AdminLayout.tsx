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
// Vagas → Candidatos → Contratação (kanban de admissão) → Colaboradores
// (ativos) → itens de configuração (Cargos, Formulário). Automações é
// acessado direto pela tela de Candidatos, não fica na sidebar.
const rhNavGroup: { label: string; items: NavItem[] } = {
  label: 'Recursos Humanos',
  items: [
    { label: 'Vagas', path: '/admin/rh/vagas', icon: Briefcase },
    { label: 'Candidatos', path: '/admin/rh/candidatos', icon: KanbanSquare },
    { label: 'Contratação', path: '/admin/dp/contratacao', icon: ClipboardList },
    { label: 'Colaboradores', path: '/admin/dp/colaboradores', icon: Contact },
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
      className={`relative flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] transition-all duration-150 ${
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-sidebar-foreground/[0.05] font-normal'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 inset-y-0 flex items-center">
          <span className="w-[2px] h-4 bg-[hsl(38,90%,58%)] rounded-r-full" />
        </span>
      )}
      <Icon
        className={`w-[15px] h-[15px] flex-shrink-0 transition-colors duration-150 ${
          isActive ? 'text-[hsl(38,90%,58%)]' : 'text-sidebar-foreground/40'
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
      <div className="px-4 pt-4 pb-3.5 border-b border-sidebar-border">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={homePath}
            onClick={onNavClick}
            className="flex items-center gap-3 min-w-0"
          >
            <div className="w-8 h-8 rounded-lg bg-sidebar-foreground/[0.07] flex items-center justify-center flex-shrink-0 ring-1 ring-sidebar-foreground/[0.08]">
              <img src={logo} alt="Rei dos Cachos" className="h-5 w-auto" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-sidebar-foreground leading-tight truncate">
                Rei dos Cachos
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 leading-tight tracking-[0.15em] uppercase mt-[2px]">
                Admin
              </p>
            </div>
          </Link>
          <ThemeToggle className="flex-shrink-0 p-1.5 rounded-md text-sidebar-foreground/35 hover:text-sidebar-foreground/70 hover:bg-sidebar-foreground/[0.06] transition-all duration-150" />
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all duration-150 ${
                  hasActive && !isOpen
                    ? 'text-[hsl(38,90%,58%)] bg-sidebar-foreground/[0.06]'
                    : 'text-sidebar-foreground/45 hover:text-sidebar-foreground/70 hover:bg-sidebar-foreground/[0.04]'
                }`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                  {group.label}
                </span>
                <ChevronRight
                  className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${
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
      <div className="px-2 pb-4 pt-2 border-t border-sidebar-border">
        <Link
          to="/catalogo"
          onClick={onNavClick}
          className="flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-foreground/[0.05] transition-all duration-150"
        >
          <ExternalLink className="w-[15px] h-[15px] flex-shrink-0 text-sidebar-foreground/30" />
          <span>Ver Site</span>
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
          <img src={logo} alt="Rei dos Cachos" className="h-7 w-auto" />
          <span className="text-[13px] font-semibold text-sidebar-foreground">Admin</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle className="p-2 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 transition-colors" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu de navegação"
            className="p-2 rounded-lg hover:bg-sidebar-foreground/10 transition-colors text-sidebar-foreground"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={`lg:hidden fixed top-14 left-0 bottom-0 z-50 ${sidebarBg} text-sidebar-foreground w-60 flex flex-col border-r ${borderColor}`}
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
