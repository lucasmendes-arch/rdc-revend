import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import PortalLayout from '@/components/portal/PortalLayout'
import { PortalPageHeader } from '@/components/portal/PortalPageHeader'
import Catalogo from '@/pages/Catalogo'

interface Profile {
  full_name: string | null
  business_type: string | null
  customer_segment: string | null
  is_partner: boolean | null
}

interface Order { id: string }

export default function PortalComprar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { cartCount } = useCart()

  const { data: profile, isLoading: loadingProfile } = useQuery<Profile | null>({
    queryKey: ['portal-profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('full_name, business_type, customer_segment, is_partner')
        .eq('id', user.id)
        .maybeSingle()
      return data ?? null
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  const { data: orders = [], isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: ['my-orders', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      if (error) throw new Error(error.message)
      return (data ?? []) as Order[]
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return (
    <PortalLayout profile={{ name: profile?.full_name ?? undefined }}>
      <div className="pt-5 pb-6">
        <div className="px-4 sm:px-6 mb-5">
          <PortalPageHeader
            profile={profile}
            loadingProfile={loadingProfile}
            orders={orders}
            loadingOrders={loadingOrders}
          />
        </div>
        <Catalogo portalMode />
      </div>

      {/* FAB do carrinho — aparece quando há itens, navega direto para checkout */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 right-4 z-50 lg:bottom-8 lg:right-8">
          <button
            onClick={() => navigate('/checkout')}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-[13px] shadow-lg shadow-amber-500/40 active:scale-[0.98] transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            {cartCount} {cartCount === 1 ? 'item' : 'itens'} · Ver pedido
          </button>
        </div>
      )}
    </PortalLayout>
  )
}
