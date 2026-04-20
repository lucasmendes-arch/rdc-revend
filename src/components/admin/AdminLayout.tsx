import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Package, ShoppingCart, Users, Warehouse, UserCog,
  Menu, X, ExternalLink, Tag, DollarSign, GitBranch,
  Megaphone, UserCheck, History, BadgeDollarSign,
} from 'lucide-react'
import logo from '@/assets/logo-rei-dos-cachos.png'

type NavItem = { label: string; path: string; icon: React.ElementType }

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Comercial',
    items: [
      { label: 'Catálogo', path: '/admin/catalogo', icon: Package },
      { label: 'Pedidos', path: '/admin/pedidos', icon: ShoppingCart },
      { label: 'Financeiro', path: '/admin/financeiro', icon: DollarSign },
    ],
  },
  {
    label: 'Pessoas',
    items: [
      { label: 'Clientes', path: '/admin/clientes', icon: Users },
      { label: 'Vendedores', path: '/admin/vendedores', icon: UserCheck },
      { label: 'Usuários', path: '/admin/usuarios', icon: UserCog },
    ],
  },
  {
    label: 'Operações',
    items: [
      { label: 'Estoque', path: '/admin/estoque', icon: Warehouse },
      { label: 'Categorias', path: '/admin/categorias', icon: Tag },
      { label: 'Tabelas de Preço', path: '/admin/tabelas-preco', icon: BadgeDollarSign },
      { label: 'Marketing', path: '/admin/marketing', icon: Megaphone },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Sync Log', path: '/admin/sync-history', icon: History },
      { label: 'CRM Debug', path: '/admin/crm', icon: GitBranch },
    ],
  },
]

function SidebarNavItem({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] transition-all duration-150 ${
        isActive
          ? 'bg-white/[0.09] text-white font-medium'
          : 'text-white/45 hover:text-white/80 hover:bg-white/[0.05] font-normal'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 inset-y-0 flex items-center">
          <span className="w-[2px] h-4 bg-[hsl(38,90%,58%)] rounded-r-full" />
        </span>
      )}
      <Icon
        className={`w-[15px] h-[15px] flex-shrink-0 transition-colors duration-150 ${
          isActive ? 'text-[hsl(38,90%,58%)]' : 'text-white/30'
        }`}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const location = useLocation()

  return (
    <>
      {/* Brand header */}
      <div className="px-4 py-5 border-b border-white/[0.07]">
        <Link
          to="/admin/catalogo"
          onClick={onNavClick}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0 ring-1 ring-white/[0.08]">
            <img src={logo} alt="Rei dos Cachos" className="h-5 w-auto" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white leading-tight truncate">
              Rei dos Cachos
            </p>
            <p className="text-[10px] text-white/30 leading-tight tracking-[0.15em] uppercase mt-[2px]">
              Admin
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5 scrollbar-none">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/20 select-none">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarNavItem
                  key={item.path}
                  item={item}
                  isActive={location.pathname === item.path}
                  onClick={onNavClick}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-4 pt-2 border-t border-white/[0.07]">
        <Link
          to="/catalogo"
          onClick={onNavClick}
          className="flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all duration-150"
        >
          <ExternalLink className="w-[15px] h-[15px] flex-shrink-0 text-white/20" />
          <span>Ver Site</span>
        </Link>
      </div>
    </>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarBg = 'bg-[hsl(218,18%,11%)]'
  const borderColor = 'border-white/[0.07]'

  return (
    <div className="min-h-screen bg-surface-alt flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col w-60 ${sidebarBg} fixed inset-y-0 left-0 z-40 border-r ${borderColor}`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <header
        className={`lg:hidden fixed top-0 inset-x-0 z-40 ${sidebarBg} text-white h-14 flex items-center justify-between px-4 border-b ${borderColor}`}
      >
        <Link to="/admin/catalogo" className="flex items-center gap-2.5">
          <img src={logo} alt="Rei dos Cachos" className="h-7 w-auto" />
          <span className="text-[13px] font-semibold text-white">Admin</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu de navegação"
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={`lg:hidden fixed top-14 left-0 bottom-0 z-50 ${sidebarBg} text-white w-60 flex flex-col border-r ${borderColor}`}
          >
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
