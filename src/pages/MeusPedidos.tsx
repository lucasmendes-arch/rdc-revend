import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader, ShoppingCart, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { getOrderStatus } from '@/lib/design/orderStatus';

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
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <h1 className="text-[15px] font-semibold text-foreground tracking-tight">Meus pedidos</h1>
          <div className="w-8" />
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-8 max-w-3xl">
        {isLoading && (
          <div className="text-center py-16">
            <Loader className="w-5 h-5 animate-spin text-ink-400 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">Carregando seus pedidos…</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger">
            <p className="text-[13px] font-medium">Não foi possível carregar seus pedidos</p>
            <p className="text-[12px] mt-0.5 opacity-80">
              {error instanceof Error ? error.message : 'Erro desconhecido'}
            </p>
          </div>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <div className="text-center py-16">
            <div className="w-10 h-10 rounded-lg border border-border bg-muted flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-4 h-4 text-ink-400" />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Nenhum pedido ainda</h2>
            <p className="text-[13px] text-muted-foreground mt-1 mb-5">
              Os seus pedidos aparecem aqui assim que o primeiro for feito.
            </p>
            <Link
              to="/catalogo"
              className="inline-flex items-center h-9 px-3.5 rounded-md btn-primary text-[13px]"
            >
              Ver catálogo
            </Link>
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
                <div key={order.id} className="surface-card overflow-hidden">
                  {/* Cabeçalho — sempre visível */}
                  <button
                    onClick={() => toggleExpanded(order.id)}
                    aria-expanded={isExpanded}
                    className="w-full text-left p-4 hover:bg-muted transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <p className="text-[13px] font-medium text-foreground mono">#{orderNumber}</p>
                        <Badge variant={statusInfo.tone}>{statusInfo.label}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground numeric">
                        <span>{orderDate}</span>
                        <span aria-hidden>·</span>
                        <span>
                          {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="font-semibold text-foreground">R$ {order.total.toFixed(2)}</span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-ink-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-ink-400 shrink-0" />
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border p-4">
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

                      <div className="border-t border-border pt-3 flex justify-between text-[13px] font-semibold text-foreground">
                        <span>Total</span>
                        <span className="numeric">R$ {order.total.toFixed(2)}</span>
                      </div>

                      <button
                        onClick={() => navigate(`/pedido/sucesso/${order.id}`)}
                        className="w-full mt-4 h-9 rounded-md btn-secondary text-[13px]"
                      >
                        Ver detalhes
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MeusPedidos;
