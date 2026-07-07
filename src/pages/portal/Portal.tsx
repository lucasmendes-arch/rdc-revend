import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Package, ShoppingCart, ArrowRight,
  ChevronLeft, ChevronRight, MessageCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PortalLayout from '@/components/portal/PortalLayout'
import { PortalPageHeader } from '@/components/portal/PortalPageHeader'

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

interface PortalBanner {
  id: string; title: string; badge_text: string
  image_url: string | null; redirect_url: string
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

// ─── EditorialBanner — Lançamentos ────────────────────────────────────────────
// Estilo magazine/story: foto full-bleed + gradiente + texto overlay, sem preço.

const UNSPLASH_FALLBACKS = [
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1607748862156-7c548e7e98f4?w=600&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=600&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=600&fit=crop&auto=format',
]

function EditorialBanner({ banners, loading }: { banners: PortalBanner[]; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  if (!loading && banners.length === 0) return null

  return (
    <section>
      <div className="px-4 sm:px-6 flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em]">Lançamentos</h2>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">Novo</span>
        </div>
        <Link to="/catalogo" className="text-[11px] text-amber-600 font-semibold hover:underline">Ver tudo</Link>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden px-4 sm:px-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="flex-shrink-0 w-[82vw] sm:w-80 h-52 rounded-2xl" />)}
        </div>
      ) : (
        <div
          ref={ref}
          className="overflow-x-auto scrollbar-none pb-2"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingInlineStart: '1rem' }}
        >
          <div className="flex gap-3 px-4 sm:px-6">
            {banners.map((banner, i) => {
              const photo = banner.image_url || UNSPLASH_FALLBACKS[i % UNSPLASH_FALLBACKS.length]
              const isExternal = banner.redirect_url.startsWith('http')
              const cardClass = "relative flex-shrink-0 w-[82vw] sm:w-80 h-52 sm:h-56 rounded-2xl overflow-hidden group"
              const cardContent = (
                <>
                  <img
                    src={photo}
                    alt={banner.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-400/90 text-white uppercase tracking-widest mb-2">
                      ✦ {banner.badge_text}
                    </span>
                    <p className="text-white font-bold text-[15px] leading-snug line-clamp-2 mb-2">
                      {banner.title}
                    </p>
                    <p className="text-amber-300 text-[12px] font-semibold flex items-center gap-1">
                      Descobrir <ArrowRight className="w-3 h-3" />
                    </p>
                  </div>
                </>
              )
              return isExternal ? (
                <a
                  key={banner.id}
                  href={banner.redirect_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ scrollSnapAlign: 'start' }}
                  className={cardClass}
                >{cardContent}</a>
              ) : (
                <Link
                  key={banner.id}
                  to={banner.redirect_url}
                  style={{ scrollSnapAlign: 'start' }}
                  className={cardClass}
                >{cardContent}</Link>
              )
            })}
            <div className="flex-shrink-0 w-4 sm:w-6" aria-hidden />
          </div>
        </div>
      )}
    </section>
  )
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
    ref.current?.scrollBy({ left: dir * 216, behavior: 'smooth' })

  return (
    <section>
      {/* cabeçalho da seção */}
      <div className="px-4 sm:px-6 flex items-center justify-between mb-2.5">
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
          <span className="hidden sm:inline-flex items-center gap-0.5">
            <button onClick={() => scroll(-1)} className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scroll(1)} className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Próximo">
              <ChevronRight className="w-4 h-4" />
            </button>
          </span>
          <Link to="/catalogo" className="text-[11px] text-amber-600 font-semibold hover:underline sm:ml-1">
            Ver tudo
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-hidden px-4 sm:px-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="flex-shrink-0 w-[280px] h-[300px]" />)}
        </div>
      ) : products.length === 0 ? (
        <p className="px-4 sm:px-6 text-[12px] text-gray-400 py-1">Nenhum produto disponível.</p>
      ) : (
        <div
          ref={ref}
          className="overflow-x-auto scrollbar-none pb-2"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingInlineStart: '1rem' }}
        >
          <div className="flex gap-4 px-4 sm:px-6">
            {products.map(product => {
              const cost   = getCostPrice(product.price, product.partner_price)
              const resale = product.price != null
                ? getSuggestedPrice(product.price, product.compare_at_price)
                : null
              const margin = cost > 0 && resale != null
                ? Math.round(((resale - cost) / cost) * 100)
                : null

              return (
                <div
                  key={product.key}
                  style={{ scrollSnapAlign: 'start' }}
                  className="flex-shrink-0 w-[200px] bg-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:border-amber-300 hover:shadow-md transition-all group flex flex-col"
                >
                  {/* ── Zona clicável: imagem + info ── */}
                  <Link to="/catalogo" className="block flex-1">
                    <div className="h-[130px] bg-gray-50 flex items-center justify-center overflow-hidden">
                      {product.main_image ? (
                        <img
                          src={product.main_image}
                          alt={product.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
                          <span className="text-3xl font-black text-amber-200 select-none leading-none">
                            {product.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-[8px] text-amber-300 font-bold uppercase tracking-widest mt-1">RDC</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 pb-2">
                      <p className="text-[12px] font-semibold text-gray-800 line-clamp-2 leading-snug min-h-[32px]">
                        {product.name}
                      </p>

                      {product.price != null && (
                        <div className="mt-2 space-y-0.5">
                          <p className="text-[17px] font-bold text-gray-900 leading-none">
                            R$ {cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          {margin != null && (
                            <p className="text-[11px] font-bold text-emerald-600 leading-none flex items-center gap-0.5">
                              <span>↑</span>{margin}% margem
                            </p>
                          )}
                          {resale != null && (
                            <p className="text-[10px] text-gray-400 leading-none">
                              Venda: R$ {resale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* ── CTA ── */}
                  <div className="px-3 pb-3">
                    <Link
                      to="/catalogo"
                      className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-[11px] font-bold transition-colors"
                    >
                      <ShoppingCart className="w-3 h-3" />
                      Pedir agora
                    </Link>
                  </div>
                </div>
              )
            })}
            {/* spacer — garante visibilidade total do último card ao scrollar */}
            <div className="flex-shrink-0 w-4 sm:w-8" aria-hidden />
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

  const { data: banners = [], isLoading: loadingBanners } = useQuery<PortalBanner[]>({
    queryKey: ['portal-banners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('portal_banners')
        .select('id, title, badge_text, image_url, redirect_url')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(10)
      return (data ?? []) as PortalBanner[]
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
  const recommendedCarousel = useMemo<CarouselProduct[]>(() => recommended.map(toCarousel), [recommended])

  const recentOrders = orders.slice(0, 3)
  const hasOrders    = !loadingOrders && orders.length > 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PortalLayout profile={{ name: profile?.full_name ?? undefined }}>
      {/* Sem padding horizontal no container raiz — cada seção define o próprio px-4 sm:px-6.
          Carrosséis ficam naturalmente full-width sem math de negative margin. */}
      <div className="pt-5 pb-28 sm:pb-10 space-y-5 sm:space-y-6">

          {/* ── 1 + 2. Header + atalhos ─────────────────────────────────── */}
          <div className="px-4 sm:px-6">
            <PortalPageHeader
              profile={profile}
              loadingProfile={loadingProfile}
            />
          </div>

          {/* ── 3. Resumo do mês — omitido quando vazio ─────────────────── */}
          {loadingOrders ? (
            <section className="px-4 sm:px-6">
              <Skeleton className="h-3 w-24 mb-3" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            </section>
          ) : hasOrders && (
            <section className="px-4 sm:px-6">
              <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] mb-2.5">
                Resumo do mês
              </h2>
              {/* 3 colunas sempre — cards compactos no mobile */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-xl border border-gray-200 border-t-2 border-t-indigo-300 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-none mb-1">Pedidos</p>
                  <p className="text-xl font-bold text-gray-900 leading-none">{thisMonthOrders.length}</p>
                  {activeOrders.length > 0 && (
                    <p className="text-[10px] text-indigo-600 font-medium mt-1 leading-none">{activeOrders.length} em aberto</p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 border-t-2 border-t-amber-300 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-none mb-1">Investido</p>
                  <p className="text-sm font-bold text-gray-900 leading-tight">
                    R$ {thisMonthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 border-t-2 border-t-emerald-300 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-none mb-1">Último</p>
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

          {/* ── 4. Lançamentos — editorial/magazine, sem preço ─────────── */}
          <EditorialBanner banners={banners} loading={loadingBanners} />

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
            <section className="px-4 sm:px-6">
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
            <section className="px-4 sm:px-6">
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

          {/* ── 9. Falar com Vendedor — WhatsApp ──────────────────────── */}
          <section className="px-4 sm:px-6">
            <a
              href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20pedido"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-green-500 hover:bg-green-600 active:bg-green-700 rounded-xl transition-colors group"
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white leading-tight">Falar com Vendedor</p>
                <p className="text-[11px] text-green-100 mt-px">Tire dúvidas ou faça seu pedido pelo WhatsApp</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/70 group-hover:text-white flex-shrink-0 transition-colors" />
            </a>
          </section>

      </div>{/* fim conteúdo */}

    </PortalLayout>
  )
}
