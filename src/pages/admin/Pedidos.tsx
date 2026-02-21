import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, ChevronDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
    qty: number;
    line_total: number;
  }>;
}

const statusConfig = {
  recebido: { label: 'Recebido', color: 'bg-blue-100 text-blue-700' },
  separacao: { label: 'Separação', color: 'bg-yellow-100 text-yellow-700' },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-700' },
  concluido: { label: 'Concluído', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

const statusOptions = ['recebido', 'separacao', 'enviado', 'concluido', 'cancelado'] as const;

const AdminPedidos = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
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
            qty,
            line_total
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Order[];
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: typeof statusOptions[number] }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Status atualizado com sucesso!');
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar status';
      toast.error(message);
    },
  });

  const handleStatusChange = (orderId: string, newStatus: typeof statusOptions[number]) => {
    updateStatusMutation.mutate({ orderId, status: newStatus });
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/admin/catalogo')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Voltar</span>
          </button>
          <h1 className="text-lg font-bold text-foreground">Gestão de Pedidos</h1>
          <div className="w-8" />
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-8">
        {isLoading && (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando pedidos...</p>
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
            <p className="text-muted-foreground">Nenhum pedido encontrado</p>
          </div>
        )}

        {!isLoading && !error && orders.length > 0 && (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground">Pedido</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground">WhatsApp</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground">Total</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => {
                    const statusInfo = statusConfig[order.status];
                    const orderNumber = order.id.slice(0, 8).toUpperCase();
                    const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR');

                    return (
                      <tr key={order.id} className="hover:bg-surface-alt transition-colors">
                        <td className="px-6 py-4 text-sm font-semibold text-foreground">
                          <Link
                            to={`/pedido/sucesso/${order.id}`}
                            className="text-gold-text hover:underline"
                          >
                            #{orderNumber}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">{order.customer_name}</td>
                        <td className="px-6 py-4 text-sm text-foreground">{order.customer_whatsapp}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-foreground">
                          R$ {order.total.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleStatusChange(
                                order.id,
                                e.target.value as typeof statusOptions[number]
                              )
                            }
                            disabled={updateStatusMutation.isPending}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border-0 cursor-pointer ${statusInfo.color}`}
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {statusConfig[s].label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{orderDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const statusInfo = statusConfig[order.status];
                const orderNumber = order.id.slice(0, 8).toUpperCase();
                const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR');

                return (
                  <div key={order.id} className="bg-white rounded-2xl shadow-card overflow-hidden">
                    {/* Header */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="w-full text-left p-4 hover:bg-surface-alt transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground mb-1">Pedido #{orderNumber}</p>
                        <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                        <p className="text-sm font-semibold text-foreground mt-1">
                          R$ {order.total.toFixed(2)}
                        </p>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-border p-4 space-y-4">
                        <div className="space-y-2 text-sm">
                          <p>
                            <span className="text-muted-foreground">WhatsApp:</span> {order.customer_whatsapp}
                          </p>
                          <p>
                            <span className="text-muted-foreground">E-mail:</span> {order.customer_email}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Data:</span> {orderDate}
                          </p>
                        </div>

                        <div className="border-t border-border pt-4">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Itens:</p>
                          <div className="space-y-2">
                            {order.order_items.map((item) => (
                              <div key={item.id} className="flex justify-between text-xs">
                                <span className="text-foreground">{item.product_name_snapshot}</span>
                                <span className="font-medium text-foreground">
                                  {item.qty}x R$ {item.line_total.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-border pt-4">
                          <label className="text-xs font-semibold text-muted-foreground block mb-2">
                            Status
                          </label>
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleStatusChange(
                                order.id,
                                e.target.value as typeof statusOptions[number]
                              )
                            }
                            disabled={updateStatusMutation.isPending}
                            className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border-0 cursor-pointer ${statusInfo.color}`}
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {statusConfig[s].label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <Link
                          to={`/pedido/sucesso/${order.id}`}
                          className="block text-center px-4 py-2 rounded-lg text-sm font-medium border border-gold-border bg-gold-light text-gold-text hover:bg-gold-light/80 transition-colors"
                        >
                          Ver Detalhes
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPedidos;
