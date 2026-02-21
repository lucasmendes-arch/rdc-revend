import { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type UserRole = 'user' | 'admin' | null

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  role: UserRole
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchUserRole(userId: string): Promise<UserRole> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !data) {
      return null
    }

    return data.role as UserRole
  } catch (error) {
    console.error('Erro ao buscar role do usuário:', error)
    return null
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)

  useEffect(() => {
    // Verificar sessão atual ao montar
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        setUser(session?.user ?? null)

        // Se há usuário, buscar seu role
        if (session?.user?.id) {
          const userRole = await fetchUserRole(session.user.id)
          setRole(userRole)
        } else {
          setRole(null)
        }
      } catch (error) {
        console.error('Erro ao recuperar sessão:', error)
        // Se houver erro (ex: Supabase não configurado), continuar como "não autenticado"
        setSession(null)
        setUser(null)
        setRole(null)
      } finally {
        setLoading(false)
      }
    }

    initSession()

    // Escutar mudanças na autenticação
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        // Buscar role do novo usuário
        if (session?.user?.id) {
          const userRole = await fetchUserRole(session.user.id)
          setRole(userRole)
        } else {
          setRole(null)
        }

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
    <AuthContext.Provider value={{ user, session, loading, role }}>
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
