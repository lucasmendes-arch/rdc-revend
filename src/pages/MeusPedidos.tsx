import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { getOrderStatus } from '@/lib/design/orderStatus';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoading } from '@/components/admin/ui/AdminPage';
import { PortalPage, PortalSection, PortalTopBar } from '@/components/portal/PortalPage';

interface OrderItem {
  id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
}

interface Order {
  // `status` é string aberta de propósito: o banco tem 9 status, mas o tipo
  // antigo listava só 5 — os outros quatro caíam em `statusConfig[status]`
  // undefined e quebravam a renderização. `getOrderStatus` degrada com
  // segurança para qualquer valor.
  id: string;
  status: string;
  total: number;
  created_at: string;
  order_items: OrderItem[];
}

const MeusPedidos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['my-orders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          status,
          total,
          created_at,
          order_items (
            id,
            product_name_snapshot,
            unit_price_snapshot,
            qty,
            line_total
          )
        `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Erro Supabase MeusPedidos:", error);
        throw new Error(error.message || 'Erro ao buscar no Supabase');
      }
      return (data || []) as Order[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // Don't retry, show error immediately
  });

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-background">
      <PortalTopBar />

      <PortalPage
        width="narrow"
        title="Meus pedidos"
        subtitle="Acompanhe o andamento e os itens de cada pedido."
      >
        <PortalSection>
          {isLoading && (
            <PageLoading label="Carregando seus pedidos…" />
          )}

          {error && (
            <div role="alert" className="p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger">
              <p className="text-[13px] font-medium">Não foi possível carregar seus pedidos</p>
              <p className="text-[12px] mt-0.5 opacity-80">
                {error instanceof Error ? error.message : 'Erro desconhecido'}. Recarregue a página ou fale com o vendedor pelo WhatsApp.
              </p>
            </div>
          )}

          {!isLoading && !error && orders.length === 0 && (
            <div className="surface-card">
              <EmptyState
                icon={ShoppingCart}
                title="Nenhum pedido ainda"
                description="Os seus pedidos aparecem aqui assim que o primeiro for feito."
                action={
                  <Button asChild>
                    <Link to="/catalogo">Ver catálogo</Link>
                  </Button>
                }
              />
            </div>
          )}

          {!isLoading && !error && orders.length > 0 && (
            <div className="space-y-2">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const statusInfo = getOrderStatus(order.status);
                const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });
                const orderNumber = order.id.slice(0, 8).toUpperCase();

                return (
                  <div key={order.id} className="surface-card shadow-xs overflow-hidden">
                    {/* Cabeçalho — sempre visível */}
                    <button
                      onClick={() => toggleExpanded(order.id)}
                      aria-expanded={isExpanded}
                      className="w-full text-left px-4 py-3.5 hover:bg-muted/60 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-1">
                          <p className="text-[13px] font-medium text-foreground mono">#{orderNumber}</p>
                          <Badge variant={statusInfo.tone}>{statusInfo.label}</Badge>
                        </div>
                        <p className="text-[12px] text-muted-foreground numeric">
                          {orderDate} · {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                      <span className="text-[15px] font-semibold text-foreground numeric whitespace-nowrap">
                        R$ {order.total.toFixed(2)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-ink-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ink-400 shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 py-4">
                        <p className="eyebrow mb-3">Itens</p>
                        <div className="space-y-2.5 mb-4">
                          {order.order_items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-4 text-[13px]">
                              <div className="flex-1 min-w-0">
                                <p className="text-foreground truncate">{item.product_name_snapshot}</p>
                                <p className="text-[12px] text-muted-foreground numeric">
                                  {item.qty}x · R$ {item.unit_price_snapshot.toFixed(2)}
                                </p>
                              </div>
                              <p className="text-foreground whitespace-nowrap numeric">
                                R$ {item.line_total.toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-border pt-3 flex justify-between text-[14px] font-semibold text-foreground">
                          <span>Total</span>
                          <span className="numeric">R$ {order.total.toFixed(2)}</span>
                        </div>

                        <Button
                          variant="secondary"
                          className="w-full mt-4"
                          onClick={() => navigate(`/pedido/sucesso/${order.id}`)}
                        >
                          Ver detalhes
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PortalSection>
      </PortalPage>
    </div>
  );
};

export default MeusPedidos;
