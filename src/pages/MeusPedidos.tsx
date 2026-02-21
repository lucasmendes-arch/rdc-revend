import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader, ShoppingCart, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface OrderItem {
  id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
}

interface Order {
  id: string;
  status: 'recebido' | 'separacao' | 'enviado' | 'concluido' | 'cancelado';
  total: number;
  created_at: string;
  order_items: OrderItem[];
}

const statusConfig = {
  recebido: { label: 'Recebido', color: 'bg-blue-100 text-blue-700' },
  separacao: { label: 'Separação', color: 'bg-yellow-100 text-yellow-700' },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-700' },
  concluido: { label: 'Concluído', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

const MeusPedidos = () => {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Order[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/catalogo')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Voltar</span>
          </button>
          <h1 className="text-lg font-bold text-foreground">Meus Pedidos</h1>
          <div className="w-8" />
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-8">
        {isLoading && (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando seus pedidos...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Erro ao carregar pedidos</p>
            <p className="text-sm">{error instanceof Error ? error.message : 'Desconhecido'}</p>
          </div>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <div className="text-center py-16">
            <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum pedido encontrado</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Você ainda não fez nenhum pedido. Comece a comprar agora!
            </p>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg btn-gold text-white font-medium"
            >
              Acessar Catálogo
            </Link>
          </div>
        )}

        {!isLoading && !error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => {
              const isExpanded = expandedId === order.id;
              const statusInfo = statusConfig[order.status];
              const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
              const orderNumber = order.id.slice(0, 8).toUpperCase();

              return (
                <div key={order.id} className="bg-white rounded-2xl shadow-card overflow-hidden">
                  {/* Header - Always visible */}
                  <button
                    onClick={() => toggleExpanded(order.id)}
                    className="w-full text-left p-5 hover:bg-surface-alt transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-semibold text-foreground">Pedido #{orderNumber}</p>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusInfo.color} whitespace-nowrap`}>
                          {statusInfo.label}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 text-xs text-muted-foreground">
                        <span>Data: {orderDate}</span>
                        <span>
                          {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
                        </span>
                        <span className="font-semibold text-foreground">R$ {order.total.toFixed(2)}</span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border p-5">
                      <div className="space-y-3 mb-5">
                        <h4 className="text-sm font-semibold text-foreground">Itens:</h4>
                        {order.order_items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">
                                {item.product_name_snapshot}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.qty}x · R$ {item.unit_price_snapshot.toFixed(2)}
                              </p>
                            </div>
                            <p className="font-medium text-foreground whitespace-nowrap">
                              R$ {item.line_total.toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-border pt-4 flex justify-between text-sm font-semibold text-foreground">
                        <span>Total</span>
                        <span className="gradient-gold-text">R$ {order.total.toFixed(2)}</span>
                      </div>

                      <button
                        onClick={() => navigate(`/pedido/sucesso/${order.id}`)}
                        className="w-full mt-4 px-4 py-2 rounded-lg text-sm font-medium border border-gold-border bg-gold-light text-gold-text hover:bg-gold-light/80 transition-colors"
                      >
                        Ver Detalhes
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
