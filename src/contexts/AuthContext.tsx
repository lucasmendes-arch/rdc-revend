import { createContext, useContext, useEffect, useRef, useState } from 'react'
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

async function fetchRole(userId: string): Promise<UserRole> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('fetchRole error:', error.message)
      return 'user'
    }
    if (!data) return 'user'
    return data.role as UserRole
  } catch (e) {
    console.warn('[AUTH] fetchRole exception:', e)
    return 'user'
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)
  const initialized = useRef(false)

  useEffect(() => {
    // Use onAuthStateChange as the single source of truth.
    // Supabase fires INITIAL_SESSION on mount (replaces getSession).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // console.log('[AUTH] event:', event)

      setSession(session)
      setUser(session?.user ?? null)
      initialized.current = true

      if (session?.user) {
        // Fetch role before finishing loading to avoid route redirects
        fetchRole(session.user.id).then(r => {
          // console.log('[AUTH] role:', r)
          setRole(r)
        }).catch(() => setRole('user')).finally(() => {
          setLoading(false)
        })
      } else {
        setRole(null)
        setLoading(false)
      }
    })

    // Safety: if onAuthStateChange never fires, unblock after 3s
    const timeout = setTimeout(() => {
      if (!initialized.current) {
        console.warn('Auth timeout — forcing loading=false')
        initialized.current = true
        setLoading(false)
      }
    }, 3000)

    return () => {
      subscription?.unsubscribe()
      clearTimeout(timeout)
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
