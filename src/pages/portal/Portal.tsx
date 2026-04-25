import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Package, ShoppingBag, ClipboardList, ArrowRight, Star,
  ChevronLeft, ChevronRight, TrendingUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PortalLayout from '@/components/portal/PortalLayout'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem { product_name_snapshot: string; qty: number }

interface Order {
  id: string; status: string; total: number
  created_at: string; order_items: OrderItem[]
}

interface Profile {
  full_name: string | null; business_type: string | null
  customer_segment: string | null; is_partner: boolean | null
}

interface CatalogProduct {
  id: string; name: string; main_image: string | null
  price: number; partner_price: number | null; compare_at_price: number | null
}

interface CarouselProduct {
  key: string; name: string; main_image: string | null
  price: number | null; partner_price: number | null; compare_at_price: number | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string }> = {
  recebido:             { label: 'Recebido',     color: 'bg-blue-100 text-blue-700' },
  aguardando_pagamento: { label: 'Aguard. Pgto', color: 'bg-yellow-100 text-yellow-700' },
  pago:                 { label: 'Pago',          color: 'bg-emerald-100 text-emerald-700' },
  separacao:            { label: 'Separação',     color: 'bg-purple-100 text-purple-700' },
  enviado:              { label: 'Enviado',        color: 'bg-indigo-100 text-indigo-700' },
  entregue:             { label: 'Entregue',       color: 'bg-teal-100 text-teal-700' },
  concluido:            { label: 'Concluído',      color: 'bg-gray-100 text-gray-600' },
  cancelado:            { label: 'Cancelado',      color: 'bg-red-100 text-red-600' },
}

const ACTIVE_STATUSES = ['recebido', 'aguardando_pagamento', 'pago', 'separacao', 'enviado', 'entregue']

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr), now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

// FUTURAMENTE: gamificação com níveis Bronze/Prata/Ouro por volume mensal.
function resolveCommercialLabel(p: Profile | null | undefined): { label: string; description: string } {
  if (!p) return { label: 'Parceiro', description: 'Acesse seu catálogo exclusivo' }
  if (p.customer_segment === 'network_partner') return { label: 'Parceiro de Rede', description: 'Preços de rede e entrega exclusiva' }
  if (p.is_partner)             return { label: 'Parceiro',       description: 'Preços e condições especiais' }
  if (p.business_type === 'salao')  return { label: 'Salão Parceiro', description: 'Produtos profissionais para salão' }
  if (p.business_type === 'revenda') return { label: 'Revendedor',    description: 'Catálogo completo para revenda' }
  if (p.business_type === 'loja')    return { label: 'Loja Parceira', description: 'Condições para lojistas parceiros' }
  return { label: 'Parceiro', description: 'Acesse seu catálogo exclusivo' }
}

// Preço de revenda sugerido — mesmo cálculo do Catalogo.tsx
function getSuggestedPrice(price: number, compareAt: number | null): number {
  if (compareAt != null && compareAt > 0) return compareAt
  return Math.round(price * 2 * 100) / 100
}

// Custo do produto: partner_price se preenchido (> 0), senão price
function getCostPrice(price: number | null, partnerPrice: number | null): number {
  if (price == null) return 0
  return partnerPrice != null && partnerPrice > 0 ? partnerPrice : price
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className ?? ''}`} />
}

// ─── ProductCarousel ───────────────────────────────────────────────────────────
// Full-bleed mobile pattern:
// -mx-4 sm:-mx-6 → scroll container = viewport width → iOS Safari reconhece
// px-4 sm:px-6   → inner flex alinha cards com o conteúdo da página
// spacer final   → último card fica completamente visível após scroll

function ProductCarousel({ title, products, loading, badge }: {
  title: string
  products: CarouselProduct[]
  loading?: boolean
  badge?: string // ex: "Novo" | "Top"
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: -1 | 1) =>
    ref.current?.scrollBy({ left: dir * 176, behavior: 'smooth' })

  return (
    <section>
      {/* cabeçalho da seção */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em]">
            {title}
          </h2>
          {badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => scroll(-1)} className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll(1)} className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Próximo">
            <ChevronRight className="w-4 h-4" />
          </button>
          <Link to="/catalogo" className="text-[11px] text-amber-600 font-semibold hover:underline ml-1">
            Ver tudo
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-2.5 overflow-hidden">
          {[1, 2, 3].map(i => <Skeleton key={i} className="flex-shrink-0 w-40 h-52" />)}
        </div>
      ) : products.length === 0 ? (
        <p className="text-[12px] text-gray-400 py-1">Nenhum produto disponível.</p>
      ) : (
        <div
          ref={ref}
          className="-mx-4 sm:-mx-6 overflow-x-auto scrollbar-none pb-2"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingInlineStart: '1rem' }}
        >
          <div className="flex gap-2.5 px-4 sm:px-6">
            {products.map(product => {
              const cost = getCostPrice(product.price, product.partner_price)
              const resale = product.price != null
                ? getSuggestedPrice(product.price, product.compare_at_price)
                : null

              return (
                <Link
                  key={product.key}
                  to="/catalogo"
                  style={{ scrollSnapAlign: 'start' }}
                  className="flex-shrink-0 w-[152px] bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-amber-300 hover:shadow-md transition-all group"
                >
                  {/* Imagem — lazy loading nativo (HTML5) */}
                  <div className="relative h-[120px] bg-gray-50 overflow-hidden">
                    {product.main_image ? (
                      <img
                        src={product.main_image}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
                        <span className="text-3xl font-black text-amber-200 select-none leading-none">
                          {product.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-[8px] text-amber-300 font-bold uppercase tracking-widest mt-1">RDC</span>
                      </div>
                    )}
                    {/* overlay de CTA no hover — desktop */}
                    <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/10 transition-colors duration-200 hidden sm:block" />
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-[12px] font-semibold text-gray-800 line-clamp-2 leading-snug min-h-[32px]">
                      {product.name}
                    </p>

                    {product.price != null && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                        {/* custo — menor, secundário */}
                        <p className="text-[10px] text-gray-500 leading-none">
                          Custo: <span className="font-semibold text-gray-700">
                            R$ {cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </p>
                        {/* revenda — destaque principal */}
                        {resale != null && (
                          <p className="text-[14px] font-bold text-emerald-700 leading-tight mt-0.5">
                            R$ {resale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            <span className="text-[9px] font-normal text-emerald-600 ml-1">revenda</span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* CTA mobile — sempre visível, pequeno */}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-amber-600 font-semibold">Pedir →</span>
                    </div>
                  </div>
                </Link>
              )
            })}
            {/* spacer — garante visibilidade do último card */}
            <div className="flex-shrink-0 w-4 sm:w-6" aria-hidden />
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function Portal() {
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

  const { data: orders = [], isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: ['my-orders', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total, created_at, order_items(product_name_snapshot, qty)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Order[]
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: false,
  })

  const { data: topSoldRaw = [], isLoading: loadingTopSold } = useQuery<Array<{
    product_name: string; total_qty: number; total_revenue: number
    product_id: string | null; main_image: string | null
    price: number | null; partner_price: number | null; compare_at_price: number | null
  }>>({
    queryKey: ['portal-top-sold'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_top_sold_products', { limit_n: 10 })
      return (data ?? []) as typeof topSoldRaw
    },
    staleTime: 15 * 60 * 1000,
  })

  const { data: newArrivals = [], isLoading: loadingNewArrivals } = useQuery<CatalogProduct[]>({
    queryKey: ['portal-new-arrivals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('catalog_products')
        .select('id, name, main_image, price, partner_price, compare_at_price')
        .eq('is_new_arrival', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10)
      return (data ?? []) as CatalogProduct[]
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: recommended = [], isLoading: loadingRecommended } = useQuery<CatalogProduct[]>({
    queryKey: ['portal-recommended'],
    queryFn: async () => {
      const { data } = await supabase
        .from('catalog_products')
        .select('id, name, main_image, price, partner_price, compare_at_price')
        .eq('is_highlight', true)
        .eq('is_active', true)
        .limit(10)
      return (data ?? []) as CatalogProduct[]
    },
    staleTime: 10 * 60 * 1000,
  })

  // ── Derivações ──────────────────────────────────────────────────────────────

  const thisMonthOrders = useMemo(() => orders.filter(o => isThisMonth(o.created_at)), [orders])
  const thisMonthTotal  = useMemo(() => thisMonthOrders.reduce((s, o) => s + o.total, 0), [thisMonthOrders])
  const activeOrders    = useMemo(() => orders.filter(o => ACTIVE_STATUSES.includes(o.status)), [orders])
  const lastOrder       = orders[0] ?? null

  const topBoughtProducts = useMemo(() => {
    const map = new Map<string, number>()
    for (const order of orders)
      for (const item of order.order_items)
        map.set(item.product_name_snapshot, (map.get(item.product_name_snapshot) ?? 0) + item.qty)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name, qty }))
  }, [orders])

  const toCarousel = (p: CatalogProduct): CarouselProduct => ({
    key: p.id, name: p.name, main_image: p.main_image,
    price: p.price, partner_price: p.partner_price, compare_at_price: p.compare_at_price,
  })

  const topSoldProducts    = useMemo<CarouselProduct[]>(() => topSoldRaw.map(p => ({ key: p.product_name, name: p.product_name, main_image: p.main_image, price: p.price, partner_price: p.partner_price, compare_at_price: p.compare_at_price })), [topSoldRaw])
  const newArrivalsCarousel = useMemo<CarouselProduct[]>(() => newArrivals.map(toCarousel), [newArrivals])
  const recommendedCarousel = useMemo<CarouselProduct[]>(() => recommended.map(toCarousel), [recommended])

  const commercial  = resolveCommercialLabel(profile)
  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'Parceiro'
  const subtitle    = profile?.business_type === 'salao'   ? 'Reabasteça seu salão e pedidos'
                    : profile?.business_type === 'revenda' ? 'Gerencie seu estoque de revenda'
                    : profile?.business_type === 'loja'    ? 'Gerencie o estoque da sua loja'
                    : 'Pedidos, reposição e catálogo B2B'
  const greeting    = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const recentOrders = orders.slice(0, 3)
  const hasOrders    = !loadingOrders && orders.length > 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PortalLayout profile={{ name: profile?.full_name ?? undefined }}>
      {/* overflow-x:clip clipa page-level overflow sem criar scroll container */}
      <div className="[overflow-x:clip]">

        {/* padding-bottom extra no mobile para não cobrir conteúdo com o CTA fixo */}
        <div className="px-4 sm:px-6 pt-5 pb-24 sm:pb-10 max-w-4xl mx-auto space-y-6">

          {/* ── 1. Header ──────────────────────────────────────────────── */}
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

          {/* ── 2. Atalhos — 3 colunas compactas no mobile ─────────────── */}
          <section>
            <div className="grid grid-cols-3 gap-2">
              {/* Comprar */}
              <Link to="/catalogo" className="flex flex-col items-center gap-1.5 p-3 sm:p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-200 hover:shadow-sm transition-all group">
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                  <ShoppingBag className="w-4 h-4 text-amber-500" />
                </div>
                <span className="text-[11px] sm:text-[12px] font-semibold text-gray-700 text-center leading-tight">
                  {orders.length === 0 && !loadingOrders ? 'Comprar' : 'Repor'}
                </span>
              </Link>

              {/* Acompanhar */}
              <Link to="/meus-pedidos" className="flex flex-col items-center gap-1.5 p-3 sm:p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-200 hover:shadow-sm transition-all group">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <ClipboardList className="w-4 h-4 text-indigo-500" />
                </div>
                <span className="text-[11px] sm:text-[12px] font-semibold text-gray-700 text-center leading-tight">Pedidos</span>
              </Link>

              {/* Histórico */}
              <Link to="/meus-pedidos" className="flex flex-col items-center gap-1.5 p-3 sm:p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-200 hover:shadow-sm transition-all group">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <Package className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-[11px] sm:text-[12px] font-semibold text-gray-700 text-center leading-tight">Histórico</span>
              </Link>
            </div>
          </section>

          {/* ── 3. Resumo do mês — omitido quando vazio ─────────────────── */}
          {loadingOrders ? (
            <section>
              <Skeleton className="h-3 w-24 mb-3" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            </section>
          ) : hasOrders && (
            <section>
              <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] mb-2.5">
                Resumo do mês
              </h2>
              {/* 3 colunas sempre — cards compactos no mobile */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-xl border border-gray-200 border-t-2 border-t-indigo-300 p-3">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-none mb-1">Pedidos</p>
                  <p className="text-xl font-bold text-gray-900 leading-none">{thisMonthOrders.length}</p>
                  {activeOrders.length > 0 && (
                    <p className="text-[9px] text-indigo-600 font-medium mt-1 leading-none">{activeOrders.length} em aberto</p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 border-t-2 border-t-amber-300 p-3">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-none mb-1">Investido</p>
                  <p className="text-sm font-bold text-gray-900 leading-tight">
                    R$ {thisMonthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 border-t-2 border-t-emerald-300 p-3">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-none mb-1">Último</p>
                  {lastOrder ? (
                    <>
                      <p className="text-[11px] font-bold text-gray-800 leading-none">
                        #{lastOrder.id.slice(0, 6).toUpperCase()}
                      </p>
                      <span className={`inline-block mt-1 px-1.5 py-px rounded-full text-[9px] font-semibold ${statusConfig[lastOrder.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig[lastOrder.status]?.label ?? lastOrder.status}
                      </span>
                    </>
                  ) : <p className="text-sm text-gray-400">—</p>}
                </div>
              </div>
            </section>
          )}

          {/* ── 4. Lançamentos ─────────────────────────────────────────── */}
          <ProductCarousel
            title="Lançamentos"
            products={newArrivalsCarousel}
            loading={loadingNewArrivals}
            badge="Novo"
          />

          {/* ── 5. Mais Vendidos ───────────────────────────────────────── */}
          <ProductCarousel
            title="Mais Vendidos"
            products={topSoldProducts}
            loading={loadingTopSold}
            badge="Top"
          />

          {/* ── 6. Produtos Recomendados ───────────────────────────────── */}
          <ProductCarousel
            title="Produtos Recomendados"
            products={recommendedCarousel}
            loading={loadingRecommended}
          />

          {/* ── 7. Pedidos recentes ────────────────────────────────────── */}
          {!loadingOrders && recentOrders.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em]">
                  Pedidos recentes
                </h2>
                <Link to="/meus-pedidos" className="text-[11px] text-amber-600 font-semibold hover:underline">
                  Ver todos
                </Link>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {recentOrders.map(order => {
                  const st = statusConfig[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }
                  const date = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                  return (
                    <Link key={order.id} to="/meus-pedidos"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-[10px] text-gray-500">{date} · {order.order_items.length} iten{order.order_items.length !== 1 ? 's' : 's'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${st.color}`}>
                        {st.label}
                      </span>
                      <p className="text-[13px] font-bold text-gray-900 whitespace-nowrap">
                        R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── 8. Reabastecimento rápido ──────────────────────────────── */}
          {topBoughtProducts.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em]">
                  Reabastecimento rápido
                </h2>
                <Link to="/catalogo" className="text-[11px] text-amber-600 font-semibold hover:underline">
                  Ver catálogo
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {topBoughtProducts.map(({ name, qty }) => (
                  <Link key={name} to="/catalogo"
                    className="flex items-center gap-3 px-3 py-3 bg-white rounded-xl border border-gray-200 hover:border-amber-200 hover:shadow-sm transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-gray-800 truncate">{name}</p>
                      <p className="text-[10px] text-gray-500">Comprado {qty}x</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-400 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── 9. Nível comercial — compacto, sem CTA (está no FAB) ──── */}
          {!loadingProfile && (
            <section>
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-amber-900">{commercial.label}</p>
                  <p className="text-[11px] text-amber-700 mt-px">{commercial.description}</p>
                  {/* FUTURAMENTE: barra de progresso Bronze/Prata/Ouro por volume mensal */}
                </div>
              </div>
            </section>
          )}

        </div>{/* fim conteúdo */}
      </div>{/* fim clip wrapper */}

      {/* ── FAB — CTA fixo no mobile ──────────────────────────────────────
           lg:hidden — no desktop o CTA está na sidebar e nos atalhos
           shadow-amber garante destaque sobre o conteúdo                */}
      <div className="fixed bottom-0 inset-x-0 px-4 pb-4 pt-2 z-50 lg:hidden bg-gradient-to-t from-gray-100 via-gray-100/95 to-transparent pointer-events-none">
        <Link
          to="/catalogo"
          className="pointer-events-auto flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-amber-500 active:bg-amber-600 text-white font-bold text-[14px] shadow-lg shadow-amber-500/40 active:scale-[0.98] transition-all"
        >
          <ShoppingBag className="w-4 h-4" />
          {orders.length === 0 && !loadingOrders ? 'Comprar agora' : 'Fazer novo pedido'}
        </Link>
      </div>

    </PortalLayout>
  )
}
