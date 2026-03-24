import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Package, ShoppingCart, Users, Warehouse, UserCog, Menu, X, ExternalLink, Tag, Zap, DollarSign, GitBranch, Megaphone, UserCheck } from 'lucide-react'
import logo from '@/assets/logo-rei-dos-cachos.png'

const navItems = [
  { label: 'Catálogo', path: '/admin/catalogo', icon: Package },
  { label: 'Pedidos', path: '/admin/pedidos', icon: ShoppingCart },
  { label: 'Financeiro', path: '/admin/financeiro', icon: DollarSign },
  { label: 'Clientes', path: '/admin/clientes', icon: Users },
  { label: 'Estoque', path: '/admin/estoque', icon: Warehouse },
  { label: 'Categorias', path: '/admin/categorias', icon: Tag },
  { label: 'Marketing', path: '/admin/marketing', icon: Megaphone },
  { label: 'Vendedores', path: '/admin/vendedores', icon: UserCheck },
  { label: 'Usuários', path: '/admin/usuarios', icon: UserCog },
  { label: 'CRM Debug', path: '/admin/crm', icon: GitBranch },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface-alt flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-foreground text-white fixed inset-y-0 left-0 z-40">
        <div className="p-5 border-b border-white/10">
          <Link to="/admin/catalogo" className="flex items-center gap-3">
            <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto" />
            <span className="text-sm font-bold">Painel Admin</span>
          </Link>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'gradient-gold text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Ver Site
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-foreground text-white h-14 flex items-center justify-between px-4">
        <Link to="/admin/catalogo" className="flex items-center gap-2">
          <img src={logo} alt="Rei dos Cachos" className="h-7 w-auto" />
          <span className="text-sm font-bold">Admin</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu de navegação"
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-14 right-0 z-50 bg-foreground text-white w-64 rounded-bl-2xl shadow-lg py-3 px-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'gradient-gold text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </Link>
              )
            })}
            <div className="border-t border-white/10 pt-2 mt-2">
              <Link
                to="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver Site
              </Link>
            </div>
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
