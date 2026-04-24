import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Package, Menu, X, LogOut, MessageCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo-rei-dos-cachos.png'

type NavItem = { label: string; path: string; icon: React.ElementType; external?: boolean }

const navItems: NavItem[] = [
  { label: 'Início',   path: '/portal',        icon: LayoutDashboard },
  { label: 'Comprar',  path: '/catalogo',       icon: ShoppingBag,    external: true },
  { label: 'Pedidos',  path: '/meus-pedidos',   icon: Package,        external: true },
]

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
        isActive
          ? 'bg-amber-50 text-amber-700'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 inset-y-0 flex items-center">
          <span className="w-[3px] h-5 bg-amber-500 rounded-r-full" />
        </span>
      )}
      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-500' : 'text-gray-400'}`} />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({ profile, onNavClick }: { profile: { name?: string }; onNavClick?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const displayName = profile.name || user?.email?.split('@')[0] || 'Parceiro'

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100">
        <Link to="/portal" onClick={onNavClick} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <img src={logo} alt="Rei dos Cachos" className="h-5 w-auto" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-800 leading-tight">Rei dos Cachos</p>
            <p className="text-[10px] text-amber-600 font-semibold tracking-wide uppercase leading-tight mt-[1px]">
              Portal do Parceiro
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* Footer — user + logout */}
      <div className="px-3 pb-4 pt-3 border-t border-gray-100">
        <div className="px-3 py-2 mb-1">
          <p className="text-[12px] font-semibold text-gray-800 truncate">{displayName}</p>
          <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
        </div>
        <a
          href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20pedido"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all duration-150"
        >
          <MessageCircle className="w-4 h-4 flex-shrink-0" />
          <span>Falar com Vendedor</span>
        </a>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  )
}

interface PortalLayoutProps {
  children: React.ReactNode
  profile?: { name?: string }
}

export default function PortalLayout({ children, profile = {} }: PortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white fixed inset-y-0 left-0 z-40 border-r border-gray-100 shadow-sm">
        <SidebarContent profile={profile} />
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white h-14 flex items-center justify-between px-4 border-b border-gray-100 shadow-sm">
        <Link to="/portal" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
            <img src={logo} alt="Rei dos Cachos" className="h-4 w-auto" />
          </div>
          <span className="text-[13px] font-bold text-gray-800">Portal do Parceiro</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu de navegação"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-14 left-0 bottom-0 z-50 bg-white w-64 flex flex-col border-r border-gray-100 shadow-xl">
            <SidebarContent profile={profile} onNavClick={() => setMobileOpen(false)} />
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
