import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type UserRole = 'user' | 'admin' | 'salao' | null

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  role: UserRole
  isPartner: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchAccountMetadata(userId: string): Promise<{role: UserRole, is_partner: boolean}> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, is_partner, customer_segment')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('fetchRole error:', error.message)
      return { role: 'user', is_partner: false }
    }
    if (!data) return { role: 'user', is_partner: false }
    // isPartner = true if legacy boolean OR new segment field
    const is_partner = !!data.is_partner || data.customer_segment === 'network_partner'
    return { role: data.role as UserRole, is_partner }
  } catch (e) {
    console.warn('[AUTH] fetchRole exception:', e)
    return { role: 'user', is_partner: false }
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)
  const [isPartner, setIsPartner] = useState(false)
  const initialized = useRef(false)
  // Garante que loading=true só acontece UMA VEZ (na carga inicial).
  // Após o role ser conhecido, nenhum evento de auth (inclusive SIGNED_IN
  // disparado em renovação de token no alt-tab) volta a bloquear as rotas.
  const roleLoadedRef = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      initialized.current = true

      if (session?.user) {
        if (!roleLoadedRef.current) {
          // Primeira carga: busca o role e bloqueia as rotas até ter resposta.
          setLoading(true)
          fetchAccountMetadata(session.user.id).then(meta => {
            setRole(meta.role)
            setIsPartner(meta.is_partner)
            roleLoadedRef.current = true
          }).catch(() => {
            setRole('user')
            setIsPartner(false)
            roleLoadedRef.current = true
          }).finally(() => {
            setLoading(false)
          })
        }
        // Role já carregado: apenas atualiza session/user em background.
        // NÃO toca loading nem role — evita desmontar formulários no alt-tab.
      } else {
        roleLoadedRef.current = false
        setRole(null)
        setIsPartner(false)
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
    <AuthContext.Provider value={{ user, session, loading, role, isPartner }}>
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
