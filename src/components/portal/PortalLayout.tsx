import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Menu, X, LogOut, MessageCircle, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo-rei-dos-cachos.png'
import CartDrawer from '@/components/CartDrawer'

type NavItem = { label: string; path: string; icon: React.ElementType; external?: boolean }

const navItems: NavItem[] = [
  { label: 'Início',  path: '/portal',       icon: LayoutDashboard },
  { label: 'Pedidos', path: '/meus-pedidos', icon: Package, external: true },
]

// Linha de navegação. Ativo = superfície `accent` + texto ink + spine dourado.
// O dourado aparece só na faixa de 2px: é o único ponto saturado da sidebar,
// e é justamente por ser raro que ele funciona como marca.
const NAV_ROW =
  'relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] tracking-snug transition-colors'

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`${NAV_ROW} ${
        isActive
          ? 'bg-accent text-foreground font-medium'
          : 'text-ink-500 hover:text-foreground hover:bg-muted'
      }`}
    >
      {isActive && <span className="nav-spine" aria-hidden />}
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-foreground' : 'text-ink-400'}`} />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({ profile, onNavClick }: { profile: { name?: string }; onNavClick?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  // O contexto expõe `count`. A sidebar lia `cartCount`, que nunca existiu —
  // o contador do carrinho ficava permanentemente escondido.
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

  return (
    <div className="flex flex-col h-full">
      {/* Marca */}
      <div className="px-3 h-14 flex items-center border-b border-border">
        <Link to="/portal" onClick={onNavClick} className="flex items-center gap-2.5 rounded-md">
          <div className="w-7 h-7 rounded-md border border-border bg-background flex items-center justify-center shrink-0">
            <img src={logo} alt="" className="h-3.5 w-auto" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground leading-none tracking-tight">Rei dos Cachos</p>
            <p className="eyebrow mt-1">Portal do Parceiro</p>
          </div>
        </Link>
      </div>

      {/* Navegação */}
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
          className={`${NAV_ROW} w-full text-ink-500 hover:text-foreground hover:bg-muted`}
        >
          <ShoppingCart className={`w-4 h-4 shrink-0 ${cartCount > 0 ? 'text-foreground' : 'text-ink-400'}`} />
          <span className={cartCount > 0 ? 'text-foreground font-medium' : ''}>Carrinho</span>
          {cartCount > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none numeric">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </button>
      </nav>

      {/* Rodapé — identidade + saída */}
      <div className="px-2 pb-3 pt-2 border-t border-border space-y-0.5">
        <div className="px-3 py-2 mb-1">
          <p className="text-[12px] font-medium text-foreground truncate leading-tight">{displayName}</p>
          <p className="text-[11px] text-ink-400 truncate mt-0.5">{user?.email}</p>
        </div>
        <a
          href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20pedido"
          target="_blank"
          rel="noopener noreferrer"
          className={`${NAV_ROW} text-ink-500 hover:text-foreground hover:bg-muted`}
        >
          <MessageCircle className="w-4 h-4 shrink-0 text-ink-400" />
          <span>Falar com vendedor</span>
        </a>
        <button
          onClick={handleLogout}
          className={`${NAV_ROW} w-full text-ink-500 hover:text-danger hover:bg-danger-subtle`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
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
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-background fixed inset-y-0 left-0 z-40 border-r border-border">
        <SidebarContent profile={profile} />
      </aside>

      {/* Header mobile */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-background h-14 flex items-center justify-between px-3 border-b border-border">
        <Link to="/portal" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md border border-border flex items-center justify-center">
            <img src={logo} alt="" className="h-3.5 w-auto" />
          </div>
          <span className="text-[13px] font-semibold text-foreground tracking-tight">Portal do Parceiro</span>
        </Link>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCartOpen(true)}
            aria-label="Ver carrinho"
            className="relative h-9 w-9 flex items-center justify-center rounded-md text-ink-500 hover:bg-muted hover:text-foreground transition-colors"
          >
            <ShoppingCart className="w-[18px] h-[18px]" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center leading-none numeric">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu de navegação"
            aria-expanded={mobileOpen}
            className="h-9 w-9 flex items-center justify-center rounded-md text-ink-500 hover:bg-muted hover:text-foreground transition-colors"
          >
            {mobileOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </header>

      {/* Menu mobile */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-14 left-0 bottom-0 z-50 bg-background w-72 flex flex-col border-r border-border shadow-xl">
            <SidebarContent profile={profile} onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Conteúdo
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
