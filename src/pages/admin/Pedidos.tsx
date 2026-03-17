import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader, ChevronDown, Plus, Globe, MonitorSmartphone, Tag, Hand, MessageSquare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';

interface Order {
  id: string;
  status: 'recebido' | 'aguardando_pagamento' | 'pago' | 'separacao' | 'enviado' | 'entregue' | 'concluido' | 'cancelado' | 'expirado';
  total: number;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string;
  delivery_method?: string;
  pickup_unit_slug?: string;
  pickup_unit_address?: string;
  subtotal?: number;
  shipping?: number;
  discount_amount?: number;
  origin?: string;
  notes?: string | null;
  coupon_id?: string | null;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name_snapshot: string;
    qty: number;
    line_total: number;
    catalog_products?: any;
  }>;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  recebido: { label: 'Recebido', color: 'bg-blue-100 text-blue-700' },
  aguardando_pagamento: { label: 'Aguardando Pgto', color: 'bg-orange-100 text-orange-700' },
  pago: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
  separacao: { label: 'Separação', color: 'bg-yellow-100 text-yellow-700' },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-700' },
  entregue: { label: 'Entregue', color: 'bg-teal-100 text-teal-700' },
  concluido: { label: 'Concluído', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
  expirado: { label: 'Expirado', color: 'bg-gray-100 text-gray-500' },
};

const statusOptions = ['recebido', 'aguardando_pagamento', 'pago', 'separacao', 'enviado', 'entregue', 'concluido', 'cancelado', 'expirado'] as const;

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
          *,
          order_items (
            id,
            product_name_snapshot,
            qty,
            line_total,
            catalog_products ( main_image )
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
      const { error, data } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-orders'] });
      const previousOrders = queryClient.getQueryData<Order[]>(['admin-orders']);

      // Optimistically update the UI
      if (previousOrders) {
        queryClient.setQueryData<Order[]>(['admin-orders'], old =>
          old?.map(order =>
            order.id === orderId ? { ...order, status } : order
          )
        );
      }
      return { previousOrders };
    },
    onError: (err: any, variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['admin-orders'], context.previousOrders);
      }
      console.error("DEBUG STATUS ERROR:", err);
      const errDetail = err?.details || err?.hint || '';
      const message = err?.message ? `${err.message} ${errDetail}` : 'Erro ao atualizar status';
      toast.error(`Falha no DB: ${message}`);
    },
    onSettled: () => {
      // Delay invalidation slightly to allow backend replication/commit to settle
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      }, 500);
    },
    onSuccess: () => {
      toast.success('Status atualizado!');
    },
  });

  const handleStatusChange = (orderId: string, newStatus: typeof statusOptions[number]) => {
    updateStatusMutation.mutate({ orderId, status: newStatus });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('orderId', orderId);
    e.dataTransfer.effectAllowed = 'move';
    // Small delay to prevent the dragged element from becoming invisible immediately
    setTimeout(() => {
      const target = e.target as HTMLElement;
      if (target) target.classList.add('opacity-50');
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target) target.classList.remove('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, newStatus: typeof statusOptions[number]) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId');
    if (orderId) {
      handleStatusChange(orderId, newStatus);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pedidos</h1>
          <button
            onClick={() => navigate('/admin/pedidos/novo')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl btn-gold text-sm font-semibold shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Pedido Manual</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8">
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
            {/* Desktop Kanban / Grid View */}
            <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 mb-8">
              {statusOptions.map((status, index) => {
                const columnOrders = orders.filter((o) => o.status === status);

                // Hide empty negative statuses to keep the kanban clean
                if (columnOrders.length === 0 && (status === 'cancelado' || status === 'expirado')) return null;

                const statusInfo = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-600' };

                return (
                  <div
                    key={status}
                    className="flex flex-col min-h-[400px] max-h-[80vh] bg-[#f8f9fa] rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, status as typeof statusOptions[number])}
                  >
                    {/* Header */}
                    <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white z-10 sticky top-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${statusInfo.color.split(' ')[0]} shadow-inner`}></span>
                        <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wide">{statusInfo.label}</h3>
                      </div>
                      <span className="bg-slate-100 text-slate-500 text-xs font-bold px-2.5 py-1 rounded-full border border-slate-200 shadow-sm leading-none">
                        {columnOrders.length}
                      </span>
                    </div>

                    {/* Cards Container */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                      {columnOrders.map((order) => {
                        const orderNumber = order.id.slice(0, 8).toUpperCase();
                        const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR');

                        return (
                          <div
                            key={order.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, order.id)}
                            onDragEnd={handleDragEnd}
                            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow hover:border-gold/40 group relative flex flex-col gap-1.5 cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-1.5">
                                <Link
                                  to={`/pedido/sucesso/${order.id}`}
                                  className="text-sm font-extrabold text-gold-text hover:underline"
                                >
                                  #{orderNumber}
                                </Link>
                                {order.origin === 'manual' ? (
                                  <span title="Pedido Manual"><Hand className="w-3 h-3 text-slate-400" /></span>
                                ) : (
                                  <span title="Feito pelo Site"><Globe className="w-3 h-3 text-slate-400" /></span>
                                )}
                              </div>
                              <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{orderDate}</span>
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                <p className="text-[13px] font-bold text-slate-700 truncate max-w-[130px]" title={order.customer_name}>{order.customer_name}</p>
                                {order.delivery_method === 'pickup' && (
                                  <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0" title={`Retirada: ${order.pickup_unit_address || order.pickup_unit_slug}`}>
                                    Retirada ({order.pickup_unit_slug === 'linhares' ? 'LIN' : order.pickup_unit_slug === 'serra' ? 'SER' : order.pickup_unit_slug === 'teixeira' ? 'TEIX' : order.pickup_unit_slug})
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate">{order.customer_whatsapp}</p>
                              {order.notes && (
                                <div className="mt-1.5 flex items-start gap-1">
                                  <MessageSquare className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                  <p className="text-[10px] text-slate-500 italic line-clamp-2 leading-tight" title={order.notes}>{order.notes}</p>
                                </div>
                              )}
                            </div>

                            {/* Small Items preview with Thumbnails */}
                            <div className="py-3 mt-1 border-t border-dashed border-slate-100">
                              <div className="text-[10px] text-slate-400 font-semibold mb-2 uppercase tracking-wider flex justify-between">
                                <span>Itens do Pedido ({order.order_items.reduce((acc, item) => acc + item.qty, 0)})</span>
                              </div>
                              <div className="flex -space-x-3.5 sm:-space-x-4 pl-1">
                                {order.order_items.slice(0, 4).map((item, idx) => {
                                  let imgUrl = null;
                                  if (Array.isArray(item.catalog_products)) {
                                    imgUrl = item.catalog_products[0]?.main_image;
                                  } else {
                                    imgUrl = item.catalog_products?.main_image;
                                  }

                                  return (
                                    <div
                                      key={item.id}
                                      className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full border-2 sm:border-[3px] border-white bg-white overflow-hidden shadow-sm relative hover:scale-110 transition-transform"
                                      style={{ zIndex: idx }}
                                      title={`${item.qty}x ${item.product_name_snapshot}`}
                                    >
                                      {imgUrl ? (
                                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-50 text-[12px] font-bold text-slate-400">
                                          {item.product_name_snapshot.substring(0, 1).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {order.order_items.length > 4 && (
                                  <div
                                    className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full border-2 sm:border-[3px] border-white bg-surface-alt text-muted-foreground flex items-center justify-center text-[11px] sm:text-[14px] font-bold shadow-sm relative"
                                    style={{ zIndex: 10 }}
                                  >
                                    +{order.order_items.length - 4}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-100">
                              <div className="flex flex-col">
                                <span className="font-black text-slate-800 tracking-tight">R$ {order.total.toFixed(2)}</span>
                                {order.discount_amount > 0 && (
                                  <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
                                    <Tag className="w-2.5 h-2.5" /> -R$ {order.discount_amount.toFixed(2)}
                                  </span>
                                )}
                              </div>

                              <select
                                value={order.status}
                                onChange={(e) =>
                                  handleStatusChange(
                                    order.id,
                                    e.target.value as typeof statusOptions[number]
                                  )
                                }
                                disabled={updateStatusMutation.isPending}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border-0 cursor-pointer shadow-sm outline-none transition-transform hover:scale-105 active:scale-95 ${statusInfo.color}`}
                              >
                                {statusOptions.map((s) => (
                                  <option key={s} value={s}>
                                    {statusConfig[s].label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}

                      {/* Empty Column Placeholder */}
                      {columnOrders.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-60">
                          <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 mb-3">
                            <span className="block w-4 h-0.5 bg-slate-300 rounded-full"></span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400">Nenhum pedido</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const statusInfo = statusConfig[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-600' };
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
                        <div className="flex items-center gap-1.5 mb-1">
                          <p className="font-semibold text-foreground">Pedido #{orderNumber}</p>
                          {order.origin === 'manual' ? (
                            <span title="Pedido Manual" className="flex shrink-0"><Hand className="w-3 h-3 text-slate-400" /></span>
                          ) : (
                            <span title="Feito pelo Site" className="flex shrink-0"><Globe className="w-3 h-3 text-slate-400" /></span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm font-semibold text-foreground">
                            R$ {order.total.toFixed(2)}
                          </p>
                          {order.discount_amount > 0 && (
                            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 rounded">
                              -R$ {order.discount_amount.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''
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
                          {order.delivery_method === 'pickup' && (
                            <p>
                              <span className="text-muted-foreground">Entrega:</span> <strong className="text-amber-600">Retirada na Loja ({order.pickup_unit_slug === 'linhares' ? 'Linhares' : order.pickup_unit_slug === 'serra' ? 'Serra' : order.pickup_unit_slug === 'teixeira' ? 'Teixeira' : order.pickup_unit_slug})</strong>
                            </p>
                          )}
                          {order.notes && (
                            <div className="p-2 bg-amber-50 border border-amber-100 rounded text-amber-800 text-xs italic">
                              <span className="font-semibold flex items-center gap-1 mb-0.5"><MessageSquare className="w-3 h-3" /> Observações:</span>
                              {order.notes}
                            </div>
                          )}
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
    </AdminLayout>
  );
};

export default AdminPedidos;
