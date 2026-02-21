import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Loader, ShoppingCart } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Order {
  id: string;
  status: 'recebido' | 'separacao' | 'enviado' | 'concluido' | 'cancelado';
  total: number;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name_snapshot: string;
    unit_price_snapshot: number;
    qty: number;
    line_total: number;
  }>;
}

const statusConfig = {
  recebido: { label: 'Recebido', color: 'bg-blue-100 text-blue-700', bgColor: 'bg-blue-50' },
  separacao: { label: 'Separação', color: 'bg-yellow-100 text-yellow-700', bgColor: 'bg-yellow-50' },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-700', bgColor: 'bg-purple-50' },
  concluido: { label: 'Concluído', color: 'bg-green-100 text-green-700', bgColor: 'bg-green-50' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700', bgColor: 'bg-red-50' },
};

const PedidoSucesso = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchOrder = async () => {
      if (!id) {
        setError('ID do pedido não encontrado');
        setLoading(false);
        return;
      }

      try {
        const { data, error: queryError } = await supabase
          .from('orders')
          .select(
            `
            id,
            status,
            total,
            customer_name,
            customer_whatsapp,
            customer_email,
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
          .eq('id', id)
          .single();

        if (queryError || !data) {
          throw new Error(queryError?.message || 'Pedido não encontrado');
        }

        setOrder(data as Order);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar pedido';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando pedido...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || 'Pedido não encontrado'}</p>
          <button
            onClick={() => navigate('/catalogo')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg btn-gold text-white font-medium"
          >
            Voltar ao Catálogo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[order.status];
  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="container mx-auto px-4 sm:px-6 py-8">
        {/* Success Banner */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl p-8 text-center shadow-card">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Pedido Confirmado!
            </h1>
            <p className="text-muted-foreground mb-4">
              Obrigado pela sua compra. Seu pedido foi recebido com sucesso.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Número do Pedido</p>
                <p className="text-2xl font-bold text-foreground"># {orderNumber}</p>
              </div>
              <div className="h-12 w-px bg-border hidden sm:block" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${statusInfo.color}`}>
                  {statusInfo.label}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Details */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl p-6 shadow-card">
              <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-gold-text" />
                Itens do Pedido
              </h2>

              <div className="space-y-3 mb-6 pb-6 border-b border-border">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.qty}x · R$ {item.unit_price_snapshot.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                      R$ {item.line_total.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">R$ {order.total.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="font-medium text-foreground">Grátis</span>
                </div>
                <div className="flex items-center justify-between text-lg font-bold pt-3 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="gradient-gold-text">R$ {order.total.toFixed(2)}</span>
                </div>
              </div>

              <div className={`rounded-xl p-4 ${statusInfo.bgColor}`}>
                <p className="text-sm font-medium text-foreground mb-2">Dados do Cliente</p>
                <div className="space-y-1.5 text-sm text-foreground">
                  <p>
                    <span className="text-muted-foreground">Nome:</span> {order.customer_name}
                  </p>
                  <p>
                    <span className="text-muted-foreground">WhatsApp:</span> {order.customer_whatsapp}
                  </p>
                  <p>
                    <span className="text-muted-foreground">E-mail:</span> {order.customer_email}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Data do Pedido:</span> {orderDate}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar CTA */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 shadow-card sticky top-24">
              <h3 className="font-bold text-foreground mb-4">Próximos Passos</h3>

              <div className="space-y-3 mb-6">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-green-700 font-bold text-sm">✓</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Pedido Confirmado</p>
                    <p className="text-xs text-muted-foreground">Recebemos sua compra</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gold-light flex items-center justify-center">
                    <span className="text-gold-text font-bold text-sm">2</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Em Separação</p>
                    <p className="text-xs text-muted-foreground">Estamos preparando seu pedido</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center">
                    <span className="text-muted-foreground font-bold text-sm">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Enviado</p>
                    <p className="text-xs text-muted-foreground">Seu pedido está a caminho</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => navigate('/meus-pedidos')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm btn-gold text-white"
                >
                  Ver Meus Pedidos
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/catalogo')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm border border-border bg-white text-foreground hover:bg-surface-alt transition-colors"
                >
                  Continuar Comprando
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PedidoSucesso;
