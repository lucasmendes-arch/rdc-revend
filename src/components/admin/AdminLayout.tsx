import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ShoppingBag, Package, LineChart, Users, Boxes, HeartHandshake,
  Menu, X, ExternalLink, UserCog, LogOut, type LucideIcon,
} from 'lucide-react'
import logo from '@/assets/logo-rei-dos-cachos.png'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { AdminThemeProvider } from '@/contexts/AdminThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

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

// `match`: prefixo que a aba possui além do próprio path (ex.: o módulo de
// estoque inteiro, que tem sub-navegação própria no EstoqueLayout).
type NavItem = { label: string; path: string; match?: string }
type Hub = { key: string; label: string; icon: LucideIcon; items: NavItem[] }

const vendasHub: Hub = {
  key: 'vendas',
  label: 'Vendas Atacado',
  icon: ShoppingBag,
  items: [
    { label: 'Pedidos', path: '/admin/pedidos' },
    { label: 'Clientes', path: '/admin/clientes' },
    { label: 'Vendedores', path: '/admin/vendedores' },
    { label: 'Tabelas de preço', path: '/admin/tabelas-preco' },
    // Financeiro é do atacado (pedidos B2B), não das unidades.
    { label: 'Financeiro', path: '/admin/financeiro' },
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
    { label: 'Estoque', path: '/estoque/contagem', match: '/estoque' },
  ],
}

const resultadosHub: Hub = {
  key: 'resultados',
  label: 'Resultados',
  icon: LineChart,
  items: [
    { label: 'Unidades', path: '/admin/unidades' },
    { label: 'Marketing', path: '/admin/marketing' },
  ],
}

// CRM das clientes dos salões (dados do Trinks). Separado de Vendas, que é
// a carteira B2B de revendedores.
const crmHub: Hub = {
  key: 'crm',
  label: 'CRM',
  icon: HeartHandshake,
  items: [
    { label: 'Clientes', path: '/admin/crm/clientes' },
    { label: 'Segmentos', path: '/admin/crm/segmentos' },
    { label: 'Campanhas', path: '/admin/crm/campanhas' },
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
  items: [{ label: 'Estoque', path: '/estoque/contagem', match: '/estoque' }],
}

function sectionPrefix(path: string) {
  return path.split('/').slice(0, 3).join('/')
}

function itemMatches(item: NavItem, pathname: string) {
  const base = item.match ?? item.path
  return pathname === base || pathname.startsWith(`${base}/`)
}

function hubOwnsPath(hub: Hub, pathname: string) {
  return hub.items.some((item) => {
    if (itemMatches(item, pathname)) return true
    const prefix = sectionPrefix(item.path)
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}

function useHubs() {
  const { role, hasPermission } = useAuth()
  const canManageRh = role === 'admin' || role === 'administrativo' || hasPermission('can_manage_rh')
  const hubs: Hub[] = role === 'admin'
    ? [resultadosHub, catalogoHub, vendasHub, crmHub, pessoasHub]
    : [
        ...(role === 'administrativo' ? [estoqueHub] : []),
        ...(canManageRh ? [pessoasHub] : []),
      ]
  const homePath = role === 'admin' ? '/admin/unidades' : '/admin/rh/candidatos'
  return { hubs, homePath, isAdmin: role === 'admin' }
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
// A sidebar é parte da MOLDURA do app (mesmo tom do fundo), não um painel.
// O conteúdo vive num painel branco embutido à direita. O ouro da logo
// aparece só no ícone do item ativo — é o único ponto de cor da navegação.

const NAV_ROW =
  'relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium tracking-snug transition-colors'
const NAV_IDLE = 'text-ink-600 hover:text-foreground hover:bg-ink-100'
const NAV_ACTIVE = 'bg-card text-foreground shadow-xs ring-1 ring-border'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  administrativo: 'Administrativo',
}

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

function UserBlock() {
  const { user, role } = useAuth()
  const email = user?.email ?? ''
  const initial = (email[0] ?? '?').toUpperCase()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1.5">
      <span
        aria-hidden
        className="w-7 h-7 shrink-0 rounded-full bg-brand-subtle border border-brand-border text-brand-strong text-[12px] font-semibold flex items-center justify-center"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[12.5px] font-medium text-foreground truncate" title={email}>{email || 'Usuário'}</p>
        <p className="text-[11.5px] text-muted-foreground truncate">{ROLE_LABEL[role ?? ''] ?? 'Equipe'}</p>
      </div>
      <button
        onClick={handleLogout}
        aria-label="Sair"
        title="Sair"
        className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-ink-400 hover:text-foreground hover:bg-ink-100 transition-colors"
      >
        <LogOut className="w-[15px] h-[15px]" />
      </button>
    </div>
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
          <img src={logo} alt="Rei dos Cachos" className="h-10 w-auto" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pt-1 space-y-0.5 scrollbar-none" aria-label="Áreas">
        {hubs.map((hub) => (
          <HubLink key={hub.key} hub={hub} active={hubOwnsPath(hub, location.pathname)} onClick={onNavClick} />
        ))}
      </nav>

      <div className="px-2.5 pb-2.5 pt-2 space-y-0.5">
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
        <div className="pt-2 mt-1.5 border-t border-border">
          <UserBlock />
        </div>
      </div>
    </div>
  )
}

// ─── Abas da área ──────────────────────────────────────────────────────────
// Fixas no topo do painel: a área e as abas ficam sempre à mão, e o
// cabeçalho da página (AdminPage) rola junto com o conteúdo.

function HubTabs() {
  const location = useLocation()
  const { hubs } = useHubs()
  const hub = hubs.find((h) => hubOwnsPath(h, location.pathname))
  if (!hub || hub.items.length < 2) return null
  const HubIcon = hub.icon

  return (
    <div className="sticky top-14 lg:top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border lg:rounded-t-xl">
      <div className="px-4 sm:px-6 lg:px-8 flex items-center gap-4 overflow-x-auto scrollbar-none">
        <p className="hidden md:flex items-center gap-2 text-[13px] font-semibold text-foreground shrink-0">
          <HubIcon className="w-4 h-4 text-ink-400" aria-hidden />
          {hub.label}
        </p>
        <span className="hidden md:block w-px h-4 bg-border shrink-0" aria-hidden />
        <nav className="flex items-center gap-0.5 min-w-0" aria-label={`Páginas de ${hub.label}`}>
          {hub.items.map((item) => {
            const active = itemMatches(item, location.pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`relative h-12 px-2.5 flex items-center text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-foreground' : 'text-ink-500 hover:text-foreground'
                }`}
              >
                {item.label}
                {active && <span aria-hidden className="absolute left-2.5 right-2.5 -bottom-px h-0.5 rounded-full bg-brand" />}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

// ─── Shell ─────────────────────────────────────────────────────────────────
// Canvas embutido: a moldura (sidebar + fundo) é `bg-sidebar`; o conteúdo
// fica num painel `bg-background` com hairline e raio 12 a partir de `lg`.
// No mobile o painel ocupa a tela toda, sem moldura.

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { homePath } = useHubs()

  return (
    <div className="min-h-screen bg-background lg:bg-sidebar">
      <aside className="hidden lg:flex flex-col w-56 fixed inset-y-0 left-0 z-40">
        <SidebarContent />
      </aside>

      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-background/90 backdrop-blur-md border-b border-border h-14 flex items-center justify-between px-4">
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

      {/* overflow-x-clip (não hidden): `hidden` transforma o painel num
          scroll container e quebra todo `sticky` das páginas. O clip ainda
          impede o kanban de RH (13 colunas) de alargar a página. */}
      <div className="pt-14 lg:pt-2 lg:pb-2 lg:pr-2 lg:pl-56">
        <main className="min-w-0 overflow-x-clip bg-background lg:rounded-xl lg:border lg:border-border lg:shadow-xs min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-1rem)]">
          <HubTabs />
          {children}
        </main>
      </div>
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
