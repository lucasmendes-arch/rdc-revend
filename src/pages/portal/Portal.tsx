import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Package, ArrowRight, ArrowUpRight, AlertCircle,
  ChevronLeft, ChevronRight, MessageCircle, ShoppingBag,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PortalLayout from '@/components/portal/PortalLayout'
import { PortalPage, PortalSection } from '@/components/portal/PortalPage'
import {
  getGreeting, firstName, resolveSubtitle, resolveCommercialLabel,
  type PortalProfile,
} from '@/components/portal/portalIdentity'
import { Badge } from '@/components/ui/badge'
import { getOrderStatus, ACTIVE_ORDER_STATUSES } from '@/lib/design/orderStatus'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem { product_name_snapshot: string; qty: number }

interface Order {
  id: string; status: string; total: number
  created_at: string; order_items: OrderItem[]
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

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

// ─── Skeletons ─────────────────────────────────────────────────────────────────
// Skeleton tem que ter a forma do conteúdo que substitui. Bloco cinza de altura
// arbitrária faz a página "pular" quando os dados chegam.

function Bar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className ?? ''}`} />
}

function MetricSkeleton() {
  return (
    <div className="surface-card p-3.5">
      <Bar className="h-2.5 w-14 mb-3" />
      <Bar className="h-5 w-10" />
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className="shrink-0 w-[200px] surface-card overflow-hidden">
      <div className="h-[130px] bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-2/3" />
        <Bar className="h-4 w-20 mt-3" />
      </div>
      <div className="px-3 pb-3"><Bar className="h-8 w-full" /></div>
    </div>
  )
}

// ─── Peças de UI ───────────────────────────────────────────────────────────────

const ARROW_BTN =
  'h-7 w-7 flex items-center justify-center rounded-md text-ink-400 hover:text-foreground hover:bg-muted transition-colors'

function SeeAll({ to, children = 'Ver tudo' }: { to: string; children?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink-500 hover:text-foreground transition-colors"
    >
      {children}
      <ArrowUpRight className="w-3.5 h-3.5" />
    </Link>
  )
}

/** Controle segmentado — substitui dois carrosséis empilhados por um só. */
function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div role="tablist" className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 rounded-md text-[12px] font-medium tracking-snug transition-colors ${
              active
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-3.5">
      <p className="eyebrow mb-2">{label}</p>
      {children}
    </div>
  )
}

// ─── Carrossel de produtos ─────────────────────────────────────────────────────

function ProductRow({ products, loading }: { products: CarouselProduct[]; loading?: boolean; }) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden px-4 sm:px-0">
        {[1, 2, 3, 4].map(i => <ProductSkeleton key={i} />)}
      </div>
    )
  }

  if (products.length === 0) {
    return <p className="px-4 sm:px-0 text-[13px] text-muted-foreground">Nenhum produto disponível.</p>
  }

  return (
    <div className="flex gap-3 px-4 sm:px-0">
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
            className="shrink-0 w-[200px] surface-card surface-card-interactive overflow-hidden flex flex-col"
          >
            <Link to="/catalogo" className="block flex-1">
              <div className="h-[130px] bg-surface-alt flex items-center justify-center overflow-hidden">
                {product.main_image ? (
                  <img
                    src={product.main_image}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <span className="text-2xl font-semibold text-ink-300 select-none">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="p-3">
                <p className="text-[12px] font-medium text-foreground line-clamp-2 leading-snug min-h-[32px]">
                  {product.name}
                </p>

                {product.price != null && (
                  <div className="mt-2.5 space-y-1">
                    <p className="text-[17px] font-semibold text-foreground leading-none numeric">
                      R$ {brl(cost)}
                    </p>
                    <div className="flex items-baseline gap-1.5 text-[11px] leading-none">
                      {margin != null && (
                        <span className="font-medium text-success numeric">+{margin}% margem</span>
                      )}
                      {resale != null && (
                        <span className="text-ink-400 numeric">venda R$ {brl(resale)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Link>

            <div className="px-3 pb-3">
              <Link
                to="/catalogo"
                className="flex items-center justify-center w-full h-8 rounded-md btn-primary text-[12px]"
              >
                Pedir agora
              </Link>
            </div>
          </div>
        )
      })}
      <div className="shrink-0 w-4 sm:w-0" aria-hidden />
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

type ProductTab = 'vendidos' | 'recomendados'

export default function Portal() {
  const { user } = useAuth()
  const [productTab, setProductTab] = useState<ProductTab>('vendidos')
  const productScroller = useRef<HTMLDivElement>(null)
  const bannerScroller = useRef<HTMLDivElement>(null)

  const { data: profile, isLoading: loadingProfile } = useQuery<PortalProfile | null>({
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
  const activeOrders    = useMemo(
    () => orders.filter(o => (ACTIVE_ORDER_STATUSES as string[]).includes(o.status)),
    [orders],
  )
  // Pedidos que travam dinheiro: é o que o parceiro precisa ver primeiro.
  const awaitingPayment = useMemo(
    () => orders.filter(o => o.status === 'aguardando_pagamento'),
    [orders],
  )
  const lastOrder = orders[0] ?? null

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

  const topSoldProducts     = useMemo<CarouselProduct[]>(() => topSoldRaw.map(p => ({ key: p.product_name, name: p.product_name, main_image: p.main_image, price: p.price, partner_price: p.partner_price, compare_at_price: p.compare_at_price })), [topSoldRaw])
  const recommendedCarousel = useMemo<CarouselProduct[]>(() => recommended.map(toCarousel), [recommended])

  const shownProducts = productTab === 'vendidos' ? topSoldProducts : recommendedCarousel
  const loadingProducts = productTab === 'vendidos' ? loadingTopSold : loadingRecommended

  const recentOrders = orders.slice(0, 3)
  const hasOrders    = !loadingOrders && orders.length > 0
  const isNewPartner = !loadingOrders && orders.length === 0

  const scrollBy = (ref: React.RefObject<HTMLDivElement>, dir: -1 | 1) =>
    ref.current?.scrollBy({ left: dir * 216, behavior: 'smooth' })

  const scrollerProps = {
    className: 'overflow-x-auto scrollbar-none pb-2',
    style: { scrollSnapType: 'x mandatory', scrollPaddingInlineStart: '1rem' } as React.CSSProperties,
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PortalLayout profile={{ name: profile?.full_name ?? undefined }}>
      <PortalPage
        title={
          loadingProfile
            ? <Bar className="h-7 w-56" />
            : `${getGreeting()}, ${firstName(profile)}`
        }
        subtitle={loadingProfile ? undefined : resolveSubtitle(profile)}
        badge={
          loadingProfile
            ? null
            : <Badge variant="brand" dot>{resolveCommercialLabel(profile)}</Badge>
        }
        actions={
          <>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md btn-primary text-[13px]"
            >
              Fazer pedido
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/meus-pedidos"
              className="inline-flex items-center h-9 px-3.5 rounded-md btn-secondary text-[13px]"
            >
              Meus pedidos
            </Link>
          </>
        }
      >

        {/* ── 1. O que trava dinheiro ────────────────────────────────────────
            Aviso no topo do dashboard é o padrão de painel operacional: o que
            exige ação do usuário vem antes de qualquer métrica ou vitrine.
            Só existe quando há de fato algo pendente. */}
        {awaitingPayment.length > 0 && (
          <PortalSection>
            <Link
              to="/meus-pedidos"
              className="flex items-center gap-3 p-3.5 rounded-lg border border-warning-border bg-warning-subtle hover:border-warning transition-colors group"
            >
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-warning leading-tight">
                  {awaitingPayment.length === 1
                    ? '1 pedido aguardando pagamento'
                    : `${awaitingPayment.length} pedidos aguardando pagamento`}
                </p>
                <p className="text-[12px] text-warning/80 mt-0.5 numeric">
                  R$ {brl(awaitingPayment.reduce((s, o) => s + o.total, 0))} em aberto
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-warning shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </PortalSection>
        )}

        {/* ── 2. Estado do mês ──────────────────────────────────────────────
            As faixas coloridas no topo de cada card foram removidas: três
            cores num bloco de três itens sugere categorias que não existem. */}
        {loadingOrders ? (
          <PortalSection title="Resumo do mês">
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(i => <MetricSkeleton key={i} />)}
            </div>
          </PortalSection>
        ) : hasOrders && (
          <PortalSection title="Resumo do mês">
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Pedidos">
                <p className="text-xl font-semibold text-foreground leading-none numeric">
                  {thisMonthOrders.length}
                </p>
                {activeOrders.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-none numeric">
                    {activeOrders.length} em aberto
                  </p>
                )}
              </MetricCard>

              <MetricCard label="Investido">
                <p className="text-[15px] font-semibold text-foreground leading-tight numeric">
                  R$ {brl(thisMonthTotal)}
                </p>
              </MetricCard>

              <MetricCard label="Último">
                {lastOrder ? (
                  <>
                    <p className="text-[12px] font-medium text-foreground leading-none mono">
                      #{lastOrder.id.slice(0, 6).toUpperCase()}
                    </p>
                    <Badge variant={getOrderStatus(lastOrder.status).tone} className="mt-1.5">
                      {getOrderStatus(lastOrder.status).short}
                    </Badge>
                  </>
                ) : <p className="text-[15px] text-ink-400">—</p>}
              </MetricCard>
            </div>
          </PortalSection>
        )}

        {/* ── 3. Primeira compra ────────────────────────────────────────────
            Antes, quem nunca comprou via só a saudação e carrosséis: nenhuma
            das seções de operação renderiza sem pedido. Tela vazia é convite
            para agir, não ausência de conteúdo. */}
        {isNewPartner && (
          <PortalSection>
            <div className="surface-card p-8 text-center">
              <div className="w-10 h-10 rounded-lg border border-border bg-muted flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-4 h-4 text-ink-400" />
              </div>
              <h2 className="text-[15px] font-semibold text-foreground tracking-tight">
                Faça o seu primeiro pedido
              </h2>
              <p className="text-[13px] text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">
                Assim que o primeiro pedido entrar, este painel passa a mostrar o seu
                resumo do mês, o andamento das entregas e a recompra em um clique.
              </p>
              <Link
                to="/catalogo"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md btn-primary text-[13px]"
              >
                Ver catálogo
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </PortalSection>
        )}

        {/* ── 4. Recompra ───────────────────────────────────────────────────
            Subiu na página: para um revendedor, repetir o pedido do mês
            passado é a ação mais frequente — e antes ficava abaixo de três
            carrosséis de vitrine. */}
        {topBoughtProducts.length > 0 && (
          <PortalSection
            title="Reabastecimento rápido"
            aside={<SeeAll to="/catalogo">Ver catálogo</SeeAll>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {topBoughtProducts.map(({ name, qty }) => (
                <Link
                  key={name}
                  to="/catalogo"
                  className="flex items-center gap-3 px-3 py-2.5 surface-card surface-card-interactive group"
                >
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5 text-ink-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground numeric">Comprado {qty}x</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-300 group-hover:text-foreground transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </PortalSection>
        )}

        {/* ── 5. Pedidos recentes ───────────────────────────────────────── */}
        {!loadingOrders && recentOrders.length > 0 && (
          <PortalSection title="Pedidos recentes" aside={<SeeAll to="/meus-pedidos">Ver todos</SeeAll>}>
            <div className="surface-card divide-y divide-border overflow-hidden">
              {recentOrders.map(order => {
                const st = getOrderStatus(order.status)
                const date = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                const itemCount = order.order_items.length
                return (
                  <Link
                    key={order.id}
                    to="/meus-pedidos"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground mono">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 numeric">
                        {date} · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      </p>
                    </div>
                    <Badge variant={st.tone} className="shrink-0">{st.short}</Badge>
                    <p className="text-[13px] font-semibold text-foreground whitespace-nowrap numeric">
                      R$ {brl(order.total)}
                    </p>
                  </Link>
                )
              })}
            </div>
          </PortalSection>
        )}

        {/* ── 6. Vitrine ────────────────────────────────────────────────────
            Eram DUAS seções de carrossel idênticas empilhadas ("Mais vendidos"
            e "Recomendados"). Viraram uma só com controle segmentado: mesmo
            conteúdo, metade da altura, e o parceiro escolhe o recorte. */}
        <PortalSection
          title="Produtos"
          bleed
          aside={
            <>
              {/* Genérico explícito: o literal em `options` faz o TS alargar
                  T para `string` se deixado inferir. */}
              <Segmented<ProductTab>
                value={productTab}
                onChange={setProductTab}
                options={[
                  { value: 'vendidos', label: 'Mais vendidos' },
                  { value: 'recomendados', label: 'Recomendados' },
                ]}
              />
              <span className="hidden sm:inline-flex items-center gap-0.5 ml-1">
                <button onClick={() => scrollBy(productScroller, -1)} className={ARROW_BTN} aria-label="Anterior">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => scrollBy(productScroller, 1)} className={ARROW_BTN} aria-label="Próximo">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </span>
            </>
          }
        >
          <div ref={productScroller} {...scrollerProps}>
            <ProductRow products={shownProducts} loading={loadingProducts} />
          </div>
        </PortalSection>

        {/* ── 7. Lançamentos ────────────────────────────────────────────── */}
        {(loadingBanners || banners.length > 0) && (
          <PortalSection
            title="Lançamentos"
            bleed
            aside={
              <>
                <span className="hidden sm:inline-flex items-center gap-0.5">
                  <button onClick={() => scrollBy(bannerScroller, -1)} className={ARROW_BTN} aria-label="Anterior">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => scrollBy(bannerScroller, 1)} className={ARROW_BTN} aria-label="Próximo">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </span>
                <SeeAll to="/catalogo" />
              </>
            }
          >
            <div ref={bannerScroller} {...scrollerProps}>
              {loadingBanners ? (
                <div className="flex gap-3 px-4 sm:px-0">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="shrink-0 w-[82vw] sm:w-80 h-52 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 px-4 sm:px-0">
                  {banners.map(banner => {
                    const isExternal = banner.redirect_url.startsWith('http')
                    const cardClass =
                      'relative shrink-0 w-[82vw] sm:w-80 h-52 rounded-xl overflow-hidden group border border-border bg-surface-alt'
                    const cardContent = (
                      <>
                        {banner.image_url && (
                          <img
                            src={banner.image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/25 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-4">
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/15 text-white uppercase tracking-eyebrow mb-2 backdrop-blur-sm">
                            {banner.badge_text}
                          </span>
                          <p className="text-white font-medium text-[15px] leading-snug tracking-tight line-clamp-2">
                            {banner.title}
                          </p>
                          <p className="text-white/70 text-[12px] mt-1.5 flex items-center gap-1">
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
                  <div className="shrink-0 w-4 sm:w-0" aria-hidden />
                </div>
              )}
            </div>
          </PortalSection>
        )}

        {/* ── 8. Suporte ────────────────────────────────────────────────── */}
        <PortalSection>
          <a
            href="https://wa.me/5527996865366?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20pedido"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3.5 surface-card surface-card-interactive group"
          >
            <div className="w-8 h-8 rounded-md bg-success-subtle border border-success-border flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground leading-tight">Falar com vendedor</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Tire dúvidas ou faça o seu pedido pelo WhatsApp
              </p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-ink-300 group-hover:text-foreground transition-colors shrink-0" />
          </a>
        </PortalSection>

      </PortalPage>
    </PortalLayout>
  )
}
