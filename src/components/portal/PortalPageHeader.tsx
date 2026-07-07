import { Link } from 'react-router-dom'
import { ClipboardList, Package, Star } from 'lucide-react'

interface Profile {
  full_name: string | null
  business_type: string | null
  customer_segment: string | null
  is_partner: boolean | null
}

interface Props {
  profile: Profile | null | undefined
  loadingProfile: boolean
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className ?? ''}`} />
}

function resolveCommercialLabel(p: Profile | null | undefined): { label: string } {
  if (!p) return { label: 'Parceiro' }
  if (p.customer_segment === 'network_partner') return { label: 'Parceiro de Rede' }
  if (p.is_partner)              return { label: 'Parceiro' }
  if (p.business_type === 'salao')   return { label: 'Salão Parceiro' }
  if (p.business_type === 'revenda') return { label: 'Revendedor' }
  if (p.business_type === 'loja')    return { label: 'Loja Parceira' }
  return { label: 'Parceiro' }
}

export function PortalPageHeader({ profile, loadingProfile }: Props) {
  const h = new Date().getHours()
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const displayName = profile?.full_name ?? 'Parceiro'
  const subtitle = profile?.business_type === 'salao'    ? 'Reabasteça seu salão e pedidos'
                 : profile?.business_type === 'revenda'  ? 'Gerencie seu estoque de revenda'
                 : profile?.business_type === 'loja'     ? 'Gerencie o estoque da sua loja'
                 : 'Pedidos, reposição e catálogo B2B'
  const commercial = resolveCommercialLabel(profile)

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {loadingProfile ? (
            <><Skeleton className="h-6 w-40 mb-1.5" /><Skeleton className="h-3.5 w-28" /></>
          ) : (
            <>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
                {greeting}, {displayName} 👋
              </h1>
              <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>
            </>
          )}
        </div>
        {!loadingProfile && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold whitespace-nowrap">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {commercial.label}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Link to="/meus-pedidos"
          className="flex items-center gap-1.5 h-11 px-4 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all whitespace-nowrap"
        >
          <ClipboardList className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          Pedidos
        </Link>
        <Link to="/meus-pedidos"
          className="flex items-center gap-1.5 h-11 px-4 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-all whitespace-nowrap"
        >
          <Package className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          Histórico
        </Link>
      </div>
    </div>
  )
}
