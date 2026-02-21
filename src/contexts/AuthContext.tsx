import { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar sessão atual ao montar
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Erro ao recuperar sessão:', error)
        // Se houver erro (ex: Supabase não configurado), continuar como "não autenticado"
        setSession(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initSession()

    // Escutar mudanças na autenticação
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      })

      return () => {
        subscription?.unsubscribe()
      }
    } catch (error) {
      console.error('Erro ao configurar listener de autenticação:', error)
      setLoading(false)
      // Continuar com o app mesmo se não conseguir configurar listener
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  }
  return context
}
