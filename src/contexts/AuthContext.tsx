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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        setUser(session?.user ?? null)

        // Marcar como admin se for o usuário específico
        if (session?.user?.email === 'lmendescapelini@gmail.com') {
          setRole('admin')
        } else {
          setRole('user')
        }
      } catch (error) {
        console.error('Erro ao recuperar sessão:', error)
        setSession(null)
        setUser(null)
        setRole(null)
      } finally {
        setLoading(false)
      }
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user?.email === 'lmendescapelini@gmail.com') {
        setRole('admin')
      } else if (session?.user) {
        setRole('user')
      } else {
        setRole(null)
      }

      setLoading(false)
    })

    return () => {
      subscription?.unsubscribe()
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
