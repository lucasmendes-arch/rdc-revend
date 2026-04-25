import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader, Package, ShoppingBag, ClipboardList, ArrowRight, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PortalLayout from '@/components/portal/PortalLayout'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  product_name_snapshot: string
  qty: number
}

interface Order {
  id: string
  status: string
  total: number
  created_at: string
  order_items: OrderItem[]
}

interface Profile {
  full_name: string | null
  business_type: string | null
  customer_segment: string | null
  is_partner: boolean | null
}

interface CatalogProduct {
  id: string
  name: string
  main_image: string | null
  price: number
  partner_price: number | null
  compare_at_price: number | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string }> = {
  recebido:             { label: 'Recebido',      color: 'bg-blue-100 text-blue-700' },
  aguardando_pagamento: { label: 'Aguard. Pgto',  color: 'bg-yellow-100 text-yellow-700' },
  pago:                 { label: 'Pago',           color: 'bg-emerald-100 text-emerald-700' },
  separacao:            { label: 'Em Separação',   color: 'bg-purple-100 text-purple-700' },
  enviado:              { label: 'Enviado',         color: 'bg-indigo-100 text-indigo-700' },
  entregue:             { label: 'Entregue',        color: 'bg-teal-100 text-teal-700' },
  concluido:            { label: 'Concluído',       color: 'bg-gray-100 text-gray-600' },
  cancelado:            { label: 'Cancelado',       color: 'bg-red-100 text-red-600' },
}

const ACTIVE_STATUSES = ['recebido', 'aguardando_pagamento', 'pago', 'separacao', 'enviado', 'entregue']

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

// Determina a classificação comercial do parceiro a partir dos campos do perfil.
// FUTURAMENTE: evoluir para gamificação com níveis (Bronze/Prata/Ouro) baseados
// em volume de compras mensal. Por ora, usa apenas os campos de perfil existentes.
function resolveCommercialLabel(profile: Profile | null | undefined): { label: string; description: string } {
  if (!profile) return { label: 'Parceiro', description: 'Acesse seu catálogo exclusivo e acompanhe seus pedidos' }
  if (profile.customer_segment === 'network_partner')
    return { label: 'Parceiro de Rede', description: 'Preços de rede, entrega exclusiva e suporte dedicado' }
  if (profile.is_partner)
    return { label: 'Parceiro', description: 'Preços e condições especiais para parceiros Rei dos Cachos' }
  if (profile.business_type === 'salao')
    return { label: 'Salão Parceiro', description: 'Produtos profissionais com preços para salão' }
  if (profile.business_type === 'revenda')
    return { label: 'Revendedor', description: 'Tabela de preços e catálogo completo para revenda' }
  if (profile.business_type === 'loja')
    return { label: 'Loja Parceira', description: 'Condições especiais para lojistas parceiros' }
  return { label: 'Parceiro', description: 'Acesse seu catálogo exclusivo e acompanhe seus pedidos' }
}

// Preço sugerido de revenda — mesmo cálculo do Catalogo.tsx
// Se compare_at_price estiver definido usa ele; caso contrário 2x o custo
function getSuggestedPrice(price: number, compareAt: number | null): number {
  if (compareAt != null && compareAt > 0) return compareAt
  return Math.round(price * 2 * 100) / 100
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className ?? ''}`} />
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function Portal() {
  const { user } = useAuth()

  // Query: perfil do usuário
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

  // Query: pedidos do usuário (mesma query de MeusPedidos.tsx — sem nova lógica)
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

  // Query: top produtos mais vendidos da loja (RPC agrega order_items com SECURITY DEFINER)
  const { data: topSoldRaw = [] } = useQuery<Array<{
    product_name: string; total_qty: number; total_revenue: number
    product_id: string | null; main_image: string | null
    price: number | null; partner_price: number | null; compare_at_price: number | null
  }>>({
    queryKey: ['portal-top-sold'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_top_sold_products', { limit_n: 6 })
      return (data ?? []) as typeof topSoldRaw
    },
    staleTime: 15 * 60 * 1000,
  })

  // Fallback: produtos em destaque do catálogo (store sem vendas ainda)
  const { data: highlightProducts = [] } = useQuery<CatalogProduct[]>({
    queryKey: ['portal-highlights'],
    enabled: topSoldRaw.length === 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('catalog_products')
        .select('id, name, main_image, price, partner_price, compare_at_price')
        .eq('is_highlight', true)
        .eq('is_active', true)
        .limit(6)
      if (!data || data.length === 0) {
        const { data: fallback } = await supabase
          .from('catalog_products')
          .select('id, name, main_image, price, partner_price, compare_at_price')
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(6)
        return (fallback ?? []) as CatalogProduct[]
      }
      return data as CatalogProduct[]
    },
    staleTime: 10 * 60 * 1000,
  })

  // ── Derivações client-side ──────────────────────────────────────────────────

  const thisMonthOrders = useMemo(
    () => orders.filter(o => isThisMonth(o.created_at)),
    [orders]
  )

  const thisMonthTotal = useMemo(
    () => thisMonthOrders.reduce((sum, o) => sum + o.total, 0),
    [thisMonthOrders]
  )

  const activeOrders = useMemo(
    () => orders.filter(o => ACTIVE_STATUSES.includes(o.status)),
    [orders]
  )

  const lastOrder = orders[0] ?? null

  // Top produtos comprados pelo usuário (derivado dos order_items existentes)
  const topBoughtProducts = useMemo(() => {
    const map = new Map<string, number>()
    for (const order of orders) {
      for (const item of order.order_items) {
        map.set(item.product_name_snapshot, (map.get(item.product_name_snapshot) ?? 0) + item.qty)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, qty]) => ({ name, qty }))
  }, [orders])

  const hasHistory = topBoughtProducts.length > 0

  // Produtos a exibir: top vendidos da loja (RPC) ou highlights como fallback
  const displayProducts = useMemo(() => {
    if (topSoldRaw.length > 0) {
      return topSoldRaw.map(p => ({
        key: p.product_name,
        name: p.product_name,
        main_image: p.main_image,
        price: p.price,
        partner_price: p.partner_price,
        compare_at_price: p.compare_at_price,
      }))
    }
    return highlightProducts.map(p => ({
      key: p.id,
      name: p.name,
      main_image: p.main_image,
      price: p.price,
      partner_price: p.partner_price,
      compare_at_price: p.compare_at_price,
    }))
  }, [topSoldRaw, highlightProducts])

  const commercial = resolveCommercialLabel(profile)
  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'Parceiro'
  const subtitle = (() => {
    if (profile?.business_type === 'salao') return 'Reabasteça seu salão e acompanhe seus pedidos'
    if (profile?.business_type === 'revenda') return 'Gerencie seu estoque de revenda e pedidos'
    if (profile?.business_type === 'loja') return 'Gerencie o estoque da sua loja e pedidos'
    return 'Gerencie pedidos, reposição de estoque e compras'
  })()
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  const recentOrders = orders.slice(0, 4)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PortalLayout profile={{ name: profile?.full_name ?? undefined }}>
      <div className="px-4 sm:px-6 py-8 max-w-4xl mx-auto space-y-10">

        {/* ── 1. Header de boas-vindas ──────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            {loadingProfile ? (
              <>
                <Skeleton className="h-7 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {greeting}, {displayName} 👋
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
              </>
            )}
          </div>
          {/* Status comercial — badge inline no header */}
          {!loadingProfile && (
            <div className="flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-semibold">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                {commercial.label}
              </span>
            </div>
          )}
        </div>

        {/* ── 2. Atalhos rápidos ────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/meus-pedidos"
              className="flex items-center gap-3.5 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">Acompanhar pedidos</p>
                <p className="text-[11px] text-gray-400">Status em tempo real</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Link>

            <Link
              to="/catalogo"
              className="flex items-center gap-3.5 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">Repor estoque</p>
                <p className="text-[11px] text-gray-400">Catálogo completo B2B</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Link>

            <Link
              to="/meus-pedidos"
              className="flex items-center gap-3.5 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">Histórico de compras</p>
                <p className="text-[11px] text-gray-400">Todos os seus pedidos</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Link>
          </div>
        </section>

        {/* ── 3. Resumo operacional ─────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Resumo do mês
          </h2>

          {loadingOrders ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-1">
              Nenhum pedido ainda — os dados aparecem após a primeira compra.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 border-t-2 border-t-indigo-200 shadow-sm p-5">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Pedidos este mês</p>
                <p className="text-2xl font-bold text-gray-900">{thisMonthOrders.length}</p>
                {activeOrders.length > 0 && (
                  <p className="text-[11px] text-indigo-600 font-medium mt-1">
                    {activeOrders.length} em andamento
                  </p>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 border-t-2 border-t-amber-200 shadow-sm p-5">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Investido este mês</p>
                <p className="text-2xl font-bold text-gray-900">
                  R$ {thisMonthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">em {thisMonthOrders.length} pedido{thisMonthOrders.length !== 1 ? 's' : ''}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 border-t-2 border-t-emerald-200 shadow-sm p-5">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Último pedido</p>
                {lastOrder ? (
                  <>
                    <p className="text-[13px] font-bold text-gray-900">#{lastOrder.id.slice(0, 8).toUpperCase()}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      statusConfig[lastOrder.status]?.color ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {statusConfig[lastOrder.status]?.label ?? lastOrder.status}
                    </span>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">—</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Pedidos recentes ─────────────────────────────────────────── */}
        {!loadingOrders && recentOrders.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Pedidos recentes
              </h2>
              <Link to="/meus-pedidos" className="text-xs text-amber-600 font-semibold hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
              {recentOrders.map(order => {
                const status = statusConfig[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }
                const date = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                return (
                  <Link
                    key={order.id}
                    to="/meus-pedidos"
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-[11px] text-gray-400">{date} · {order.order_items.length} ite{order.order_items.length !== 1 ? 'ns' : 'm'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${status.color}`}>
                      {status.label}
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

        {/* ── 4. Recompra rápida ────────────────────────────────────────── */}
        {hasHistory && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Reabastecimento rápido
              </h2>
              <Link to="/catalogo" className="text-xs text-amber-600 font-semibold hover:underline">
                Ver catálogo
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {topBoughtProducts.map(({ name, qty }) => (
                <Link
                  key={name}
                  to="/catalogo"
                  className="flex items-center gap-3 px-4 py-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-amber-200 hover:shadow-md transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">{name}</p>
                    <p className="text-[10px] text-gray-400">Pedido {qty}x · pedir novamente</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 5. Produtos mais vendidos / para seu negócio ─────────────── */}
        {displayProducts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  {topSoldRaw.length > 0 ? 'Mais vendidos' : 'Produtos para seu negócio'}
                </h2>
                {topSoldRaw.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-0.5">Os produtos mais pedidos pelos parceiros</p>
                )}
              </div>
              <Link to="/catalogo" className="text-xs text-amber-600 font-semibold hover:underline flex-shrink-0">
                Ver tudo
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {displayProducts.map(product => (
                <Link
                  key={product.key}
                  to="/catalogo"
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-amber-200 transition-all group"
                >
                  <div className="aspect-square bg-gray-50 overflow-hidden">
                    {product.main_image ? (
                      <img
                        src={product.main_image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 gap-1">
                        <span className="text-2xl font-black text-amber-300 select-none leading-none">
                          {product.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-[9px] text-amber-300 font-semibold uppercase tracking-widest">
                          RDC
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <p className="text-[13px] font-semibold text-gray-800 line-clamp-2 leading-snug">
                      {product.name}
                    </p>
                    {product.price != null && (
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-[10px] text-gray-400 leading-none">
                          Custo: <span className="font-semibold text-amber-600">
                            R$ {(product.partner_price ?? product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </p>
                        <p className="text-[10px] text-emerald-600 font-semibold leading-none">
                          Revenda: R$ {getSuggestedPrice(product.price, product.compare_at_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 6. Status comercial ───────────────────────────────────────── */}
        {!loadingProfile && (
          <section className="pb-8">
            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Star className="w-6 h-6 text-amber-500 fill-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-amber-900">{commercial.label}</p>
                <p className="text-[12px] text-amber-700 mt-0.5">{commercial.description}</p>
                {/* FUTURAMENTE: barra de progresso para próximo nível (Bronze/Prata/Ouro)
                    baseada em volume de compras mensal. Por ora, exibe apenas a classificação atual. */}
              </div>
              <Link
                to="/catalogo"
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-semibold transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Fazer novo pedido
              </Link>
            </div>
          </section>
        )}

      </div>
    </PortalLayout>
  )
}
