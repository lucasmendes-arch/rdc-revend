import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Warehouse, LogOut, Sun, Moon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

import logo from '@/assets/logo-rei-dos-cachos.png'

const THEME_KEY = 'rdc-admin-theme'

export default function SalaoInicio() {
  const { storeId } = useAuth()
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark' } catch { return false }
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light') } catch { /* ignore */ }
    return () => { root.classList.remove('dark') }
  }, [isDark])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-surface-alt">
      <header className="bg-gold border-b border-amber-600 px-4 sm:px-6 h-14 flex items-center sticky top-0 z-40">
        <div className="w-full max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Rei dos Cachos" className="h-8 w-auto brightness-0 invert" />
            <span className="text-white font-bold text-sm leading-tight">Área do Salão</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsDark(v => !v)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-1.5 text-sm"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-12 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-foreground mb-1 text-center">O que você quer fazer?</h1>
        <p className="text-sm text-muted-foreground mb-8 text-center">Escolha um módulo para continuar</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/salao/pedido"
            className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-white border border-border shadow-card hover:border-amber-300 hover:shadow-lg transition-all"
          >
            <div className="w-14 h-14 rounded-2xl gradient-gold flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-white" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground">Lançamento de Venda</p>
              <p className="text-xs text-muted-foreground mt-1">Criar um novo pedido pra um cliente</p>
            </div>
          </Link>

          {storeId ? (
            <Link
              to="/estoque/contagem"
              className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-white border border-border shadow-card hover:border-amber-300 hover:shadow-lg transition-all"
            >
              <div className="w-14 h-14 rounded-2xl gradient-gold flex items-center justify-center">
                <Warehouse className="w-7 h-7 text-white" />
              </div>
              <div className="text-center">
                <p className="font-bold text-foreground">Contagem de Estoque</p>
                <p className="text-xs text-muted-foreground mt-1">Lançar a contagem física da loja</p>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-white border border-border opacity-50 cursor-not-allowed">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Warehouse className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-bold text-muted-foreground">Contagem de Estoque</p>
                <p className="text-xs text-muted-foreground mt-1">Peça pro admin vincular sua loja</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
