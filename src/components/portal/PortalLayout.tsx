import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Menu, X, LogOut, MessageCircle, ShoppingCart, Store } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo-rei-dos-cachos.png'
import CartDrawer from '@/components/CartDrawer'
import { Button } from '@/components/ui/button'

type NavItem = { label: string; path: string; icon: React.ElementType }

const navItems: NavItem[] = [
  { label: 'Início',   path: '/portal',       icon: LayoutDashboard },
  { label: 'Catálogo', path: '/catalogo',     icon: Store },
  { label: 'Pedidos',  path: '/meus-pedidos', icon: Package },
]

// Mesma linguagem do admin: sidebar clara, item ativo em cartão branco com o
// ícone no ouro da logo.
const NAV_ROW =
  'relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium tracking-snug transition-colors'
const NAV_IDLE = 'text-ink-600 hover:text-foreground hover:bg-ink-100'
const NAV_ACTIVE = 'bg-card text-foreground shadow-xs ring-1 ring-border'

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`${NAV_ROW} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand-strong' : 'text-ink-400'}`} />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({ profile, onNavClick }: { profile: { name?: string }; onNavClick?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { count: cartCount, setCartOpen } = useCart()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleCartClick = () => {
    onNavClick?.()
    setCartOpen(true)
  }

  const displayName = profile.name || user?.email?.split('@')[0] || 'Parceiro'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 h-16 flex items-center">
        <Link to="/portal" onClick={onNavClick} className="block rounded-md" aria-label="Rei dos Cachos — início">
          <img src={logo} alt="Rei dos Cachos" className="h-11 w-auto" />
        </Link>
      </div>

      <nav className="flex-1 px-2.5 pt-2 space-y-0.5" aria-label="Portal">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
            onClick={onNavClick}
          />
        ))}
        <button onClick={handleCartClick} className={`${NAV_ROW} w-full ${NAV_IDLE}`}>
          <ShoppingCart className={`w-4 h-4 shrink-0 ${cartCount > 0 ? 'text-brand-strong' : 'text-ink-400'}`} />
          <span>Carrinho</span>
          {cartCount > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none numeric">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </button>
      </nav>

      <div className="px-2.5 pb-3 pt-2 border-t border-border space-y-0.5">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="w-7 h-7 rounded-full bg-brand-subtle text-brand-strong ring-1 ring-brand-border flex items-center justify-center text-[12px] font-semibold shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate leading-tight">{displayName}</p>
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
          </div>
        </div>
        <a
          href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20pedido"
          target="_blank"
          rel="noopener noreferrer"
          className={`${NAV_ROW} ${NAV_IDLE}`}
        >
          <MessageCircle className="w-4 h-4 shrink-0 text-ink-400" />
          <span>Falar com vendedor</span>
        </a>
        <button onClick={handleLogout} className={`${NAV_ROW} w-full ${NAV_IDLE}`}>
          <LogOut className="w-4 h-4 shrink-0 text-ink-400" />
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
  const { count: cartCount, setCartOpen } = useCart()

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex flex-col w-56 bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        <SidebarContent profile={profile} />
      </aside>

      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-background/90 backdrop-blur border-b border-border h-14 flex items-center justify-between px-3">
        <Link to="/portal" className="flex items-center pl-1" aria-label="Rei dos Cachos — início">
          <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCartOpen(true)}
            aria-label={cartCount > 0 ? `Ver carrinho (${cartCount} itens)` : 'Ver carrinho'}
            className="relative"
          >
            <ShoppingCart className="!size-[18px]" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none numeric">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu de navegação"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="!size-5" /> : <Menu className="!size-5" />}
          </Button>
        </div>
      </header>

      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-14 left-0 bottom-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col shadow-xl">
            <SidebarContent profile={profile} onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* min-w-0: flex item com min-width:auto impede o shrink correto.
          overflow-x-hidden: clipa overflow horizontal sem criar scroll container. */}
      <main className="flex-1 min-w-0 lg:ml-56 pt-14 lg:pt-0 overflow-x-hidden">
        {children}
      </main>

      <CartDrawer />
    </div>
  )
}
