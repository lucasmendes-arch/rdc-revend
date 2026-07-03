import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type UserRole = 'user' | 'admin' | 'salao' | null

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  role: UserRole
  storeId: string | null
  isPartner: boolean
  permissions: Record<string, boolean>
  hasPermission: (key: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchAccountMetadata(userId: string): Promise<{role: UserRole, is_partner: boolean, store_id: string | null, permissions: Record<string, boolean>}> {
  // Role fetch — crítico: qualquer erro mantém role='user'
  let role: UserRole = 'user'
  let is_partner = false
  let store_id: string | null = null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, is_partner, customer_segment, store_id')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      role = data.role as UserRole
      is_partner = !!data.is_partner || data.customer_segment === 'network_partner'
      store_id = data.store_id ?? null
    } else if (error) {
      console.warn('fetchRole error:', error.message)
    }
  } catch (e) {
    console.warn('[AUTH] fetchRole exception:', e)
  }

  // Permissions fetch — não-crítico: falha silenciosa se coluna ainda não existe
  let permissions: Record<string, boolean> = {}
  try {
    const { data } = await supabase
      .from('profiles')
      .select('permissions')
      .eq('id', userId)
      .maybeSingle()
    if (data?.permissions) {
      permissions = data.permissions as Record<string, boolean>
    }
  } catch {
    // migration não aplicada ainda — ignora
  }

  return { role, is_partner, store_id, permissions }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [isPartner, setIsPartner] = useState(false)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
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
            setStoreId(meta.store_id)
            setPermissions(meta.permissions)
            roleLoadedRef.current = true
          }).catch(() => {
            setRole('user')
            setIsPartner(false)
            setStoreId(null)
            setPermissions({})
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
        setStoreId(null)
        setPermissions({})
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

  const hasPermission = (key: string) => !!permissions[key]

  return (
    <AuthContext.Provider value={{ user, session, loading, role, storeId, isPartner, permissions, hasPermission }}>
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
