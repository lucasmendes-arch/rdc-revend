import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PortalLayout from '@/components/portal/PortalLayout'
import { PortalPageHeader } from '@/components/portal/PortalPageHeader'

interface Profile {
  full_name: string | null
  business_type: string | null
  customer_segment: string | null
  is_partner: boolean | null
}

export default function PortalComprar() {
  const { user } = useAuth()

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

  return (
    <PortalLayout profile={{ name: profile?.full_name ?? undefined }}>
      <div className="pt-5 pb-6">
        <div className="px-4 sm:px-6 mb-5">
          <PortalPageHeader
            profile={profile}
            loadingProfile={loadingProfile}
          />
        </div>
      </div>
    </PortalLayout>
  )
}
