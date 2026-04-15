import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader, ChevronDown, Plus, Globe, Tag, Hand, MessageSquare, UserCheck, Trash2, AlertTriangle, Package, Calendar, Truck, CheckCircle2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import { AdminHeader } from '@/components/admin/ui/AdminHeader';
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter';
import { PeriodPresetKey } from '@/components/admin/ui/presets';
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard';
import { AdminSelect } from '@/components/admin/ui/AdminSelect';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths, format, parseISO } from 'date-fns';

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
  payment_method?: string | null;
  payment_splits?: Array<{ method: string; amount: number }> | null;
  subtotal?: number;
  shipping?: number;
  discount_amount?: number;
  origin?: string;
  notes?: string | null;
  coupon_id?: string | null;
  seller_id?: string | null;
  sellers?: { name: string; code: string | null } | null;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name_snapshot: string;
    qty: number;
    line_total: number;
    catalog_products?: any;
  }>;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; ring: string; indicator: string }> = {
  recebido: { label: 'Recebido', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/20', indicator: 'bg-blue-400' },
  aguardando_pagamento: { label: 'Aguard. Pgto', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/20', indicator: 'bg-amber-400' },
  pago: { label: 'Pago', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20', indicator: 'bg-emerald-400' },
  separacao: { label: 'Em Separação', bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/20', indicator: 'bg-purple-400' },
  enviado: { label: 'Enviado', bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-600/20', indicator: 'bg-sky-400' },
  entregue: { label: 'Entregue', bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-600/20', indicator: 'bg-teal-400' },
  concluido: { label: 'Concluído', bg: 'bg-zinc-100', text: 'text-zinc-700', ring: 'ring-zinc-600/20', indicator: 'bg-zinc-400' },
  cancelado: { label: 'Cancelado', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', indicator: 'bg-red-400' },
  expirado: { label: 'Expirado', bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-500/20', indicator: 'bg-slate-400' },
};

const statusOptions = ['recebido', 'aguardando_pagamento', 'pago', 'separacao', 'enviado', 'entregue', 'concluido', 'cancelado', 'expirado'] as const;

const AdminPedidos = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterSeller, setFilterSeller] = useState<string>('');
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Date Filter State
  const [dateFilterType, setDateFilterType] = useState<PeriodPresetKey>('esteMes');
  const [customDates, setCustomDates] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfDay(new Date()), 'yyyy-MM-dd')
  });

  const dateRange = useMemo(() => {
    const today = new Date();
    switch (dateFilterType) {
      case 'hoje':
        return { start: startOfDay(today), end: endOfDay(today) };
      case '7dias':
        return { start: startOfDay(subDays(today, 7)), end: endOfDay(today) };
      case '30dias':
        return { start: startOfDay(subDays(today, 30)), end: endOfDay(today) };
      case 'esteMes':
        return { start: startOfMonth(today), end: endOfDay(today) };
      case 'mesPassado': {
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case 'customizado':
        return {
          start: startOfDay(parseISO(customDates.start || format(today, 'yyyy-MM-dd'))),
          end: endOfDay(parseISO(customDates.end || format(today, 'yyyy-MM-dd')))
        };
      default:
        return { start: startOfMonth(today), end: endOfDay(today) };
    }
  }, [dateFilterType, customDates]);

  const { data: sellers = [] } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sellers').select('id, name, code').eq('active', true).order('name')
      if (error) throw error
      return (data || []) as { id: string; name: string; code: string | null }[]
    },
    staleTime: 60 * 1000,
  });

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['admin-orders', dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          sellers ( name, code ),
          order_items (
            id,
            product_name_snapshot,
            qty,
            line_total,
            catalog_products ( main_image )
          )
        `)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Order[];
    },
    staleTime: 30 * 1000,
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
      const previousOrders = queryClient.getQueryData<Order[]>(['admin-orders', dateRange.start.toISOString(), dateRange.end.toISOString()]);
      if (previousOrders) {
        queryClient.setQueryData<Order[]>(['admin-orders', dateRange.start.toISOString(), dateRange.end.toISOString()], old =>
          old?.map(order => order.id === orderId ? { ...order, status } : order)
        );
      }
      return { previousOrders };
    },
    onError: (err: any, variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['admin-orders', dateRange.start.toISOString(), dateRange.end.toISOString()], context.previousOrders);
      }
      toast.error('Erro ao atualizar status');
    },
    onSettled: () => {
      setTimeout(() => { queryClient.invalidateQueries({ queryKey: ['admin-orders'] }); }, 500);
    },
    onSuccess: () => {
      toast.success('Status atualizado');
    },
  });

  const handleStatusChange = (orderId: string, newStatus: typeof statusOptions[number]) => {
    updateStatusMutation.mutate({ orderId, status: newStatus });
  };

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('admin_delete_order', { p_order_id: orderId });
      if (error) throw error;
      return orderId;
    },
    onSuccess: () => {
      toast.success('Pedido excluído');
      setOrderToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (err: any) => {
      toast.error('Falha ao excluir');
    }
  });

  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('orderId', orderId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { const target = e.target as HTMLElement; if (target) target.classList.add('opacity-40'); }, 0);
  };
  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target) target.classList.remove('opacity-40');
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent, newStatus: typeof statusOptions[number]) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId');
    if (orderId) handleStatusChange(orderId, newStatus);
  };

  const filteredOrders = useMemo(() => {
    return filterSeller ? orders.filter(o => o.seller_id === filterSeller) : orders;
  }, [orders, filterSeller]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const active = filteredOrders.filter(o => !['cancelado', 'expirado'].includes(o.status));
    const totalRevenue = active.reduce((acc, curr) => acc + curr.total, 0);
    return { count: active.length, revenue: totalRevenue };
  }, [filteredOrders]);

  // Status Summary
  const statusSummary = useMemo(() => {
    const summary: Record<string, { count: number; total: number }> = {};
    statusOptions.forEach(s => summary[s] = { count: 0, total: 0 });
    filteredOrders.forEach(o => {
      if (summary[o.status]) {
        summary[o.status].count += 1;
        summary[o.status].total += o.total;
      }
    });
    return summary;
  }, [filteredOrders]);

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 z-30 shadow-sm flex flex-col w-full text-left">
        <AdminHeader 
          title="Pedidos"
          subtitle={`Visão gerencial e operacional das vendas do período. ${kpis.count} ativos.`}
          badge={
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold border border-zinc-200 shadow-sm">
              R$ {kpis.revenue.toFixed(2)}
            </span>
          }
          actionNode={
            <>
              {sellers.length > 0 && (
                <AdminSelect
                  options={sellers.map(s => ({ value: s.id, label: s.code || s.name }))}
                  value={filterSeller}
                  onChange={setFilterSeller}
                  placeholder="Vendedor"
                  icon={UserCheck}
                  allLabel="Todos"
                />
              )}
              <button
                onClick={() => navigate('/admin/pedidos/novo')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Novo</span>
              </button>
            </>
          }
        />
        <AdminPeriodFilter 
          presets={[
            { key: 'hoje', label: 'Hoje' },
            { key: '7dias', label: '7 D' },
            { key: '30dias', label: '30 D' },
            { key: 'esteMes', label: 'Este Mês' },
            { key: 'mesPassado', label: 'Mês Passado' },
            { key: 'customizado', label: 'Personalizado' }
          ]}
          activePreset={dateFilterType}
          onPresetChange={setDateFilterType}
          customDateFrom={customDates.start}
          customDateTo={customDates.end}
          onCustomDateFromChange={v => setCustomDates(prev => ({ ...prev, start: v }))}
          onCustomDateToChange={v => setCustomDates(prev => ({ ...prev, end: v }))}
          customPresetKey="customizado"
        />

        {/* Camada 1: Resumo Executivo Horizontal (Mini cards) */}
        {!isLoading && !error && filteredOrders.length > 0 && (
          <div className="w-full border-t border-zinc-100 bg-zinc-50/50 py-3 px-4 sm:px-6 lg:px-8 overflow-x-auto flex flex-nowrap gap-3 items-center" style={{ scrollbarWidth: 'thin' }}>
            {statusOptions.map(status => {
              const summary = statusSummary[status];
              if (summary.count === 0 && (status === 'cancelado' || status === 'expirado')) return null;
              const style = statusConfig[status];


              return (
                <AdminSummaryCard
                  key={`summary-${status}`}
                  label={style.label}
                  value={`R$ ${summary.total.toFixed(0)}`}
                  indicatorColor={style.indicator}
                  subtitle={
                    <span className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-md ${summary.count === 0 ? 'bg-zinc-100 text-zinc-400' : 'bg-zinc-50 text-zinc-600 border border-zinc-100'}`}>
                      {summary.count} pedido{summary.count !== 1 ? 's' : ''}
                    </span>
                  }
                  className={`min-w-[130px] sm:min-w-[155px] flex-1 shrink-0 ring-inset ring-1 ${summary.count > 0 ? style.ring : 'ring-transparent opacity-80'}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Camada 2: Board Operacional com Navegação Segura e Scroll Grosso Evidente */}
      <div className="w-full flex-1 min-w-0 relative border-t border-zinc-100 shadow-inner bg-zinc-50/40 min-h-[calc(100vh-210px)]">
        <style dangerouslySetInnerHTML={{__html: `
          .kanban-scroll::-webkit-scrollbar { height: 16px; }
          .kanban-scroll::-webkit-scrollbar-track { background: transparent; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
          .kanban-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; border: 3px solid #f8fafc; }
          .kanban-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        `}} />
        <div className="absolute inset-0 overflow-x-auto overflow-y-hidden kanban-scroll px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-4 sm:pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 w-full">
            <Loader className="w-8 h-8 animate-spin text-zinc-400 mb-4" />
            <p className="text-sm font-medium text-zinc-500">Sincronizando operação...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 max-w-md mx-auto mt-10 w-full">
            <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Erro de sistema</p>
            <p className="text-sm mt-1 opacity-90">{error instanceof Error ? error.message : 'Falha na comunicação com o banco.'}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl border border-zinc-200 border-dashed max-w-4xl mx-auto shadow-sm w-full">
            <Calendar className="w-12 h-12 text-zinc-300 mb-4" />
            <h3 className="text-lg font-bold text-zinc-700">Tudo limpo por aqui</h3>
            <p className="text-zinc-500 text-sm mt-1 mb-6 text-center max-w-xs">Não há registros para o período e filtro selecionados.</p>
          </div>
        ) : (
          <div className="flex gap-4 min-w-max h-full items-start">
            {/* Camada 2: Board Operacional */}
            {statusOptions.map((status) => {
              const columnOrders = filteredOrders.filter((o) => o.status === status);
              if (columnOrders.length === 0 && (status === 'cancelado' || status === 'expirado')) return null;

              const style = statusConfig[status];

              return (
                <div
                  key={`col-${status}`}
                  className="flex flex-col w-[260px] sm:w-[300px] lg:w-[320px] bg-zinc-100/60 rounded-xl border border-zinc-200/80 shrink-0 self-stretch max-h-[75vh] flex-nowrap shadow-sm"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, status as typeof statusOptions[number])}
                >
                  <div className={`p-3 border-b border-zinc-200/60 sticky top-0 bg-white/60 backdrop-blur-md rounded-t-xl z-20 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ring-2 ${style.bg.replace('50', '400')} ${style.ring}`}></div>
                       <h3 className="font-bold text-[13px] text-zinc-800 tracking-tight">{style.label}</h3>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 scrollbar-thin">
                    {columnOrders.map((order) => {
                      const orderNumber = order.id.slice(0, 8).toUpperCase();
                      const itemsCount = order.order_items.reduce((acc, item) => acc + item.qty, 0);

                      return (
                        <div
                          key={order.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, order.id)}
                          onDragEnd={handleDragEnd}
                          className="bg-white p-3 md:p-3.5 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-md border border-zinc-200/80 hover:border-zinc-300 transition-all cursor-grab active:cursor-grabbing group relative"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex flex-col gap-0.5 min-w-0">
                               <Link
                                to={`/pedido/sucesso/${order.id}`}
                                className="text-[13px] font-bold text-zinc-900 group-hover:text-zinc-600 transition-colors flex items-center gap-1.5 shrink-0"
                              >
                                #{orderNumber}
                                {order.origin === 'manual' ? (
                                  <Hand className="w-3.5 h-3.5 text-zinc-400" title="Pedido Manual" />
                                ) : (
                                  <Globe className="w-3.5 h-3.5 text-blue-400" title="Feito pelo Site" />
                                )}
                              </Link>
                              <span className="text-[11px] font-medium text-zinc-400 leading-none">
                                {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </span>
                            </div>
                            
                            <button
                              onClick={(e) => { e.stopPropagation(); setOrderToDelete(order); }}
                              className="text-zinc-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="mb-3">
                            <h4 className="text-[13px] md:text-[14px] font-bold text-zinc-800 leading-snug truncate">
                              {order.customer_name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] md:text-[12px] text-zinc-500 font-medium truncate">
                                {order.customer_whatsapp}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
                            {order.sellers && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ring-inset ${style.ring} ${style.bg} ${style.text}`}>
                                <UserCheck className="w-3 h-3" />
                                {order.sellers.code || order.sellers.name.split(' ')[0]}
                              </span>
                            )}
                            {order.delivery_method === 'pickup' && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-tight ring-1 ring-inset ${style.ring} ${style.bg} ${style.text} opacity-90`}>
                                RETIRADA ({order.pickup_unit_slug?.substring(0, 4).toUpperCase()})
                              </span>
                            )}
                            {order.payment_method === 'pay_on_delivery' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ring-inset ring-amber-600/20 bg-amber-50 text-amber-700">
                                <Truck className="w-3 h-3" />
                                PAGAR NA ENTREGA
                              </span>
                            )}
                            {order.payment_method === 'MISTO' && order.payment_splits && order.payment_splits.length > 0 && (
                              <span className="inline-flex flex-wrap items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ring-inset ring-violet-600/20 bg-violet-50 text-violet-700">
                                {order.payment_splits.map((s, i) => (
                                  <span key={i}>
                                    {s.method} R${s.amount.toFixed(2)}{i < order.payment_splits!.length - 1 ? ' +' : ''}
                                  </span>
                                ))}
                              </span>
                            )}
                            {order.payment_method && order.payment_method !== 'pay_on_delivery' && order.payment_method !== 'MISTO' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ring-inset ring-zinc-600/20 bg-zinc-50 text-zinc-600">
                                {order.payment_method}
                              </span>
                            )}
                            {itemsCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-md text-[10px] font-bold">
                                {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                              </span>
                            )}
                          </div>

                          {order.notes && (
                            <div className="mb-3.5 bg-zinc-50/80 border border-zinc-100 p-2 rounded-lg flex items-start gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                              <p className="text-[11px] font-medium text-zinc-600 leading-relaxed line-clamp-2">
                                {order.notes}
                              </p>
                            </div>
                          )}

                          {order.payment_method === 'pay_on_delivery' && order.status === 'recebido' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, 'pago'); }}
                              disabled={updateStatusMutation.isPending}
                              className="w-full mb-3 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold transition-colors disabled:opacity-60"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Confirmar Pagamento Recebido
                            </button>
                          )}

                          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                             <div className="flex flex-col min-w-0">
                                <span className="font-extrabold text-[14px] md:text-[15px] text-zinc-900 tracking-tight leading-none">
                                  R$ {order.total.toFixed(2)}
                                </span>
                                {order.discount_amount > 0 && (
                                  <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 mt-1 whitespace-nowrap">
                                    <Tag className="w-2 h-2" /> -R$ {order.discount_amount.toFixed(2)}
                                  </span>
                                )}
                             </div>
                             
                             <div className="relative isolate shrink-0">
                                <select
                                  value={order.status}
                                  onChange={(e) => handleStatusChange(order.id, e.target.value as typeof statusOptions[number])}
                                  disabled={updateStatusMutation.isPending}
                                  className={`appearance-none pl-2 pr-6 py-1.5 rounded-lg text-[11px] font-bold border-0 ring-1 ring-inset ${style.ring} ${style.bg} ${style.text} outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer transition-all disabled:opacity-50 min-w-[100px] max-w-[130px]`}
                                >
                                  {statusOptions.map((s) => (
                                    <option key={s} value={s}>{statusConfig[s].label}</option>
                                  ))}
                                </select>
                                <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${style.text}`} />
                             </div>
                          </div>
                        </div>
                      );
                    })}

                    {columnOrders.length === 0 && (
                      <div className="h-16 flex items-center justify-center rounded-xl border border-zinc-200 border-dashed bg-white/50">
                        <span className="text-[11px] font-semibold text-zinc-400">Nenhum pedido</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2">
                Excluir Pedido #{orderToDelete.id.slice(0, 8).toUpperCase()}?
              </h3>
              <p className="text-sm text-zinc-500 mb-6 px-2">
                Esta ação apagará permanentemente os dados. O histórico não poderá ser desfeito.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setOrderToDelete(null)}
                  disabled={deleteOrderMutation.isPending}
                  className="flex-1 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-xl text-sm font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteOrderMutation.mutate(orderToDelete.id)}
                  disabled={deleteOrderMutation.isPending}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center"
                >
                  {deleteOrderMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminPedidos;

