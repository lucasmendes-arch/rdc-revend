import { Link } from 'react-router-dom'
import { ShoppingCart, Warehouse, LogOut, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AdminThemeProvider } from '@/contexts/AdminThemeContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

import logo from '@/assets/logo-rei-dos-cachos.png'

const HEADER_ACTION =
  'h-10 min-w-[2.5rem] px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-ink-500 hover:bg-muted hover:text-foreground transition-colors'

const MODULE_CARD =
  'group flex items-center gap-4 p-4 sm:p-5 rounded-lg border border-border bg-card shadow-xs transition-colors'

function SalaoInicioInner() {
  const { storeId } = useAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="h-14 px-4 sm:px-6 max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto shrink-0" />
            <span className="w-px h-5 bg-border shrink-0" aria-hidden />
            <span className="text-[13px] font-semibold text-foreground tracking-tight truncate">Área do salão</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <ThemeToggle className={HEADER_ACTION} />
            <button type="button" onClick={handleLogout} className={HEADER_ACTION} title="Sair" aria-label="Sair">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 pt-8 sm:pt-12 pb-12 max-w-3xl mx-auto">
        <h1 className="text-[22px] sm:text-[26px] leading-[1.15] text-foreground">O que você quer fazer?</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Escolha um módulo para continuar</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to="/salao/pedido" className={`${MODULE_CARD} hover:border-ink-300`}>
            <ShoppingCart className="w-6 h-6 text-ink-400 group-hover:text-brand-strong shrink-0 transition-colors" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">Lançamento de venda</p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">Criar um novo pedido para um cliente</p>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-400 shrink-0" />
          </Link>

          {storeId ? (
            <Link to="/estoque/contagem" className={`${MODULE_CARD} hover:border-ink-300`}>
              <Warehouse className="w-6 h-6 text-ink-400 group-hover:text-brand-strong shrink-0 transition-colors" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground">Contagem de estoque</p>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">Lançar a contagem física da loja</p>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-400 shrink-0" />
            </Link>
          ) : (
            <div className={`${MODULE_CARD} opacity-60 cursor-not-allowed`} aria-disabled>
              <Warehouse className="w-6 h-6 text-ink-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-muted-foreground">Contagem de estoque</p>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">Peça ao admin para vincular sua loja</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// Tema claro/escuro compartilhado com o admin e o estoque (mesma chave
// `rdc-admin-theme`), via AdminThemeProvider — antes cada casca tinha o seu
// próprio efeito duplicado.
export default function SalaoInicio() {
  return (
    <AdminThemeProvider>
      <SalaoInicioInner />
    </AdminThemeProvider>
  )
}
