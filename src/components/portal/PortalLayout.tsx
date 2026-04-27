import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Package, Menu, X, LogOut, MessageCircle, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo-rei-dos-cachos.png'
import CartDrawer from '@/components/CartDrawer'

type NavItem = { label: string; path: string; icon: React.ElementType; external?: boolean }

const navItems: NavItem[] = [
  { label: 'Início',   path: '/portal',        icon: LayoutDashboard },
  { label: 'Comprar',  path: '/portal/comprar',  icon: ShoppingBag },
  { label: 'Pedidos',  path: '/meus-pedidos',   icon: Package,        external: true },
]

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-3 rounded-md text-[13px] transition-all duration-150 ${
        isActive
          ? 'bg-amber-50 text-amber-700 font-medium'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100/60 font-normal'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 inset-y-0 flex items-center">
          <span className="w-[2px] h-4 bg-amber-500 rounded-r-full" />
        </span>
      )}
      <Icon className={`w-[15px] h-[15px] flex-shrink-0 ${isActive ? 'text-amber-500' : 'text-gray-300'}`} />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({ profile, onNavClick }: { profile: { name?: string }; onNavClick?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { cartCount, setCartOpen } = useCart()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleCartClick = () => {
    onNavClick?.()
    setCartOpen(true)
  }

  const displayName = profile.name || user?.email?.split('@')[0] || 'Parceiro'

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-4 pb-3.5 border-b border-gray-200">
        <Link to="/portal" onClick={onNavClick} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <img src={logo} alt="Rei dos Cachos" className="h-4 w-auto" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900 leading-tight">Rei dos Cachos</p>
            <p className="text-[10px] text-amber-600 font-medium tracking-[0.15em] uppercase leading-tight mt-[2px]">
              Portal do Parceiro
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
            onClick={onNavClick}
          />
        ))}
        <button
          onClick={handleCartClick}
          className="relative w-full flex items-center gap-3 px-3 py-3 rounded-md text-[13px] transition-all duration-150 text-gray-400 hover:text-gray-700 hover:bg-gray-100/60"
        >
          <ShoppingCart className={`w-[15px] h-[15px] flex-shrink-0 ${cartCount > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
          <span className={cartCount > 0 ? 'text-amber-700 font-medium' : ''}>Carrinho</span>
          {cartCount > 0 && (
            <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center leading-none">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </button>
      </nav>

      {/* Footer — user + logout */}
      <div className="px-2 pb-4 pt-2 border-t border-gray-200 space-y-0.5">
        <div className="px-3 py-2 mb-1.5 rounded-md border border-gray-100">
          <p className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{displayName}</p>
          <p className="text-[10px] text-gray-400 truncate mt-[2px]">{user?.email}</p>
        </div>
        <a
          href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20pedido"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-[13px] text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all duration-150"
        >
          <MessageCircle className="w-[15px] h-[15px] flex-shrink-0" />
          <span>Falar com Vendedor</span>
        </a>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-[13px] text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
        >
          <LogOut className="w-[15px] h-[15px] flex-shrink-0" />
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
  const { cartCount, setCartOpen } = useCart()

  const handleMobileCartClick = () => {
    setCartOpen(true)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white fixed inset-y-0 left-0 z-40 border-r border-gray-200">
        <SidebarContent profile={profile} />
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white h-14 flex items-center justify-between px-4 border-b border-gray-200">
        <Link to="/portal" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
            <img src={logo} alt="Rei dos Cachos" className="h-4 w-auto" />
          </div>
          <span className="text-[13px] font-semibold text-gray-800">Portal do Parceiro</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMobileCartClick}
            aria-label="Ver carrinho"
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-[3px] leading-none">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu de navegação"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
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
          <div className="lg:hidden fixed top-14 left-0 bottom-0 z-50 bg-white w-72 flex flex-col border-r border-gray-200">
            <SidebarContent profile={profile} onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main Content
          min-w-0: flex items podem ter min-width:auto o que impede shrink correto
          overflow-x-hidden: clipa overflow horizontal sem criar scroll container
          (main nunca tem altura fixa, então overflow-y:auto é seguro) */}
      <main className="flex-1 min-w-0 lg:ml-60 pt-14 lg:pt-0 overflow-x-hidden">
        {children}
      </main>

      <CartDrawer />
    </div>
  )
}
