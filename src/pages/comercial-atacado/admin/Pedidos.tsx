import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader, Plus, Globe, Tag, Hand, MessageSquare, UserCheck, Trash2, AlertTriangle, Calendar, Truck, CheckCircle2, Receipt, Pencil, ImagePlus, Image } from 'lucide-react';
import OrderCouponModal from '@/components/admin/OrderCouponModal';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useImageUpload } from '@/hooks/useImageUpload';
import { ORDER_STATUS, ORDER_STATUS_SEQUENCE, toneClasses } from '@/lib/design/orderStatus';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import { AdminPage, Toolbar, Panel, EmptyState, PageLoading, PAGE_X } from '@/components/admin/ui/AdminPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AdminPeriodFilter } from '@/components/admin/ui/AdminPeriodFilter';
import { PeriodPresetKey } from '@/components/admin/ui/presets';
import { AdminSummaryCard } from '@/components/admin/ui/AdminSummaryCard';
import { AdminSelect } from '@/components/admin/ui/AdminSelect';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths, format, parseISO } from 'date-fns';
import StyledSelect from '@/components/ui/styled-select';

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
  payment_proof_url?: string | null;
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

const originConfig: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  whatsapp:   { label: 'WhatsApp',  bg: 'bg-green-500/10',  text: 'text-green-700 dark:text-green-400',  ring: 'ring-green-600/20' },
  site:       { label: 'Site',      bg: 'bg-blue-500/10',   text: 'text-blue-700 dark:text-blue-400',    ring: 'ring-blue-600/20' },
  portal:     { label: 'Portal',    bg: 'bg-brand-subtle',  text: 'text-brand-strong',  ring: 'ring-brand-border' },
  salao:      { label: 'Salão',     bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400',ring: 'ring-violet-600/20' },
  loja_fisica:{ label: 'Loja',      bg: 'bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400',ring: 'ring-orange-600/20' },
  manual:     { label: 'Manual',    bg: 'bg-muted',         text: 'text-muted-foreground',               ring: 'ring-muted-foreground/20' },
  outro:      { label: 'Outro',     bg: 'bg-muted',         text: 'text-muted-foreground',               ring: 'ring-muted-foreground/20' },
};

// Cor e rótulo vêm de orderStatus.ts — o mesmo status tem a mesma cor em qualquer tela.
const statusConfig: Record<string, { label: string; bg: string; text: string; ring: string; indicator: string }> =
  Object.fromEntries(
    ORDER_STATUS_SEQUENCE.map((s) => {
      const meta = ORDER_STATUS[s];
      const t = toneClasses(meta.tone);
      return [s, { label: meta.label, bg: t.bg, text: t.text, ring: t.ring, indicator: t.dot }];
    }),
  );

const brl = (v: number, digits = 2) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });

const statusOptions = ['recebido', 'aguardando_pagamento', 'pago', 'separacao', 'enviado', 'entregue', 'concluido', 'cancelado', 'expirado'] as const;

const AdminPedidos = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEditOrders = hasPermission('can_edit_orders');
  const [filterSeller, setFilterSeller] = useState<string>('');
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToCoupon, setOrderToCoupon] = useState<Order | null>(null);
  const [orderToProof, setOrderToProof] = useState<Order | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const { upload: uploadProofImage, uploading: uploadingProof } = useImageUpload();

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

  const updateProofMutation = useMutation({
    mutationFn: async ({ orderId, url }: { orderId: string; url: string | null }) => {
      const { error } = await supabase.from('orders').update({ payment_proof_url: url }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: (_, { orderId, url }) => {
      queryClient.setQueryData<Order[]>(
        ['admin-orders', dateRange.start.toISOString(), dateRange.end.toISOString()],
        old => old?.map(o => o.id === orderId ? { ...o, payment_proof_url: url } : o)
      );
      toast.success(url ? 'Comprovante salvo' : 'Comprovante removido');
      setOrderToProof(prev => prev?.id === orderId ? { ...prev, payment_proof_url: url } : prev);
      if (!url) setOrderToProof(null);
    },
    onError: () => toast.error('Erro ao salvar comprovante'),
  });

  const handleProofUpload = async (order: Order) => {
    if (!proofFile) return;
    try {
      const url = await uploadProofImage(proofFile);
      await updateProofMutation.mutateAsync({ orderId: order.id, url });
      setProofFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message ? `Erro ao fazer upload: ${message}` : 'Erro ao fazer upload');
    }
  };

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

  const chip = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11.5px] font-medium leading-4';

  return (
    <AdminLayout>
      <AdminPage
        title="Pedidos"
        description={`Visão gerencial e operacional das vendas do período · ${kpis.count} ativos`}
        badge={
          <Badge variant="neutral" className="tabular-nums">
            {brl(kpis.revenue)}
          </Badge>
        }
        actions={
          <Button onClick={() => navigate('/admin/pedidos/novo')}>
            <Plus />
            Novo pedido
          </Button>
        }
        toolbar={
          <Toolbar className="justify-between">
            <AdminPeriodFilter
              presets={[
                { key: 'hoje', label: 'Hoje' },
                { key: '7dias', label: '7 dias' },
                { key: '30dias', label: '30 dias' },
                { key: 'esteMes', label: 'Este mês' },
                { key: 'mesPassado', label: 'Mês passado' },
                { key: 'customizado', label: 'Personalizado' }
              ]}
              activePreset={dateFilterType}
              onPresetChange={setDateFilterType}
              customDateFrom={customDates.start}
              customDateTo={customDates.end}
              onCustomDateFromChange={v => setCustomDates(prev => ({ ...prev, start: v }))}
              onCustomDateToChange={v => setCustomDates(prev => ({ ...prev, end: v }))}
              customPresetKey="customizado"
              className="max-w-full"
            />
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
          </Toolbar>
        }
        flush
      >
        {/* Resumo por status */}
        {!isLoading && !error && filteredOrders.length > 0 && (
          <div className={`${PAGE_X} pb-4 overflow-x-auto flex flex-nowrap gap-3`} style={{ scrollbarWidth: 'thin' }}>
            {statusOptions.map(status => {
              const summary = statusSummary[status];
              if (summary.count === 0 && (status === 'cancelado' || status === 'expirado')) return null;
              const style = statusConfig[status];

              return (
                <AdminSummaryCard
                  key={`summary-${status}`}
                  label={style.label}
                  value={brl(summary.total, 0)}
                  indicatorColor={style.indicator}
                  subtitle={
                    <span className="tabular-nums">
                      {summary.count} pedido{summary.count !== 1 ? 's' : ''}
                    </span>
                  }
                  className={`min-w-[140px] sm:min-w-[155px] flex-1 shrink-0 ${summary.count > 0 ? '' : 'opacity-70'}`}
                />
              );
            })}
          </div>
        )}

        {/* Board operacional */}
        <style dangerouslySetInnerHTML={{__html: `
          .kanban-scroll::-webkit-scrollbar { height: 12px; }
          .kanban-scroll::-webkit-scrollbar-track { background: transparent; }
          .kanban-scroll::-webkit-scrollbar-thumb { background-color: hsl(var(--muted-foreground) / 0.3); border-radius: 8px; border: 3px solid hsl(var(--background)); }
          .kanban-scroll::-webkit-scrollbar-thumb:hover { background-color: hsl(var(--muted-foreground) / 0.5); }
        `}} />
        {isLoading ? (
          <PageLoading label="Carregando pedidos…" />
        ) : error ? (
          <div className={PAGE_X}>
            <div className="p-4 rounded-lg bg-danger-subtle border border-danger-border text-danger max-w-md">
              <p className="text-[14px] font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Não foi possível carregar os pedidos</p>
              <p className="text-[13px] mt-1">{error instanceof Error ? error.message : 'Falha na comunicação com o banco.'} Recarregue a página para tentar de novo.</p>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className={PAGE_X}>
            <Panel>
              <EmptyState
                icon={Calendar}
                title="Nenhum pedido no período"
                description="Não há pedidos para o período e o filtro selecionados. Ajuste o período ou crie um pedido manual."
                action={
                  <Button variant="secondary" onClick={() => navigate('/admin/pedidos/novo')}>
                    <Plus />
                    Novo pedido
                  </Button>
                }
              />
            </Panel>
          </div>
        ) : (
          <div className={`overflow-x-auto kanban-scroll ${PAGE_X} pb-6`}>
            <div className="flex gap-3 min-w-max items-start">
              {statusOptions.map((status) => {
                const columnOrders = filteredOrders.filter((o) => o.status === status);
                if (columnOrders.length === 0 && (status === 'cancelado' || status === 'expirado')) return null;

                const style = statusConfig[status];

                return (
                  <div
                    key={`col-${status}`}
                    className="flex flex-col w-[272px] sm:w-[300px] lg:w-[312px] bg-surface rounded-lg border border-border shrink-0 max-h-[75vh]"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, status as typeof statusOptions[number])}
                  >
                    <div className="h-11 px-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.indicator}`} />
                        <h3 className="text-[13px] font-semibold text-foreground tracking-tight truncate">{style.label}</h3>
                      </div>
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-[11.5px] font-medium text-ink-500 tabular-nums inline-flex items-center justify-center">
                        {columnOrders.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                      {columnOrders.map((order) => {
                        const orderNumber = order.id.slice(0, 8).toUpperCase();
                        const itemsCount = order.order_items.reduce((acc, item) => acc + item.qty, 0);

                        return (
                          <div
                            key={order.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, order.id)}
                            onDragEnd={handleDragEnd}
                            className="bg-card p-3 rounded-lg shadow-xs border border-border hover:border-ink-300 transition-colors cursor-grab active:cursor-grabbing group relative"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex flex-col gap-1 min-w-0">
                                <Link
                                  to={`/pedido/sucesso/${order.id}`}
                                  className="font-mono text-[12.5px] font-medium text-foreground hover:underline underline-offset-4 decoration-ink-300 flex items-center gap-1.5"
                                >
                                  #{orderNumber}
                                  {order.origin === 'manual' ? (
                                    <span title="Pedido manual"><Hand className="w-3.5 h-3.5 text-muted-foreground" /></span>
                                  ) : (
                                    <span title="Feito pelo site"><Globe className="w-3.5 h-3.5 text-info" /></span>
                                  )}
                                </Link>
                                <span className="text-[12px] text-muted-foreground leading-none">
                                  {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                </span>
                              </div>

                              <div className="flex items-center -mr-1 -mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                                {canEditOrders && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-7 w-7"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/admin/pedidos/${order.id}/editar`); }}
                                    title="Editar pedido"
                                    aria-label="Editar pedido"
                                  >
                                    <Pencil />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className={`h-7 w-7 ${order.payment_proof_url ? 'text-success hover:text-success' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); setOrderToProof(order); setProofFile(null); }}
                                  title={order.payment_proof_url ? 'Ver comprovante' : 'Anexar comprovante'}
                                  aria-label={order.payment_proof_url ? 'Ver comprovante' : 'Anexar comprovante'}
                                >
                                  {order.payment_proof_url ? <Image /> : <ImagePlus />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7"
                                  onClick={(e) => { e.stopPropagation(); setOrderToCoupon(order); }}
                                  title="Emitir cupom não fiscal"
                                  aria-label="Emitir cupom não fiscal"
                                >
                                  <Receipt />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 hover:text-danger hover:bg-danger-subtle"
                                  onClick={(e) => { e.stopPropagation(); setOrderToDelete(order); }}
                                  title="Excluir pedido"
                                  aria-label="Excluir pedido"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </div>

                            <div className="mb-2.5 min-w-0">
                              <h4 className="text-[13.5px] font-semibold text-foreground leading-snug truncate">
                                {order.customer_name}
                              </h4>
                              <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                                {order.customer_whatsapp}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 mb-3">
                              {order.origin && (() => {
                                const o = originConfig[order.origin] ?? originConfig.outro;
                                return (
                                  <span className={`${chip} ring-1 ring-inset ${o.ring} ${o.bg} ${o.text}`}>
                                    {o.label}
                                  </span>
                                );
                              })()}
                              {order.sellers && (
                                <span className={`${chip} bg-muted text-ink-600 border border-border`}>
                                  <UserCheck className="w-3 h-3" />
                                  {order.sellers.code || order.sellers.name.split(' ')[0]}
                                </span>
                              )}
                              {order.delivery_method === 'pickup' && (
                                <span className={`${chip} bg-muted text-ink-600 border border-border`}>
                                  Retirada ({order.pickup_unit_slug?.substring(0, 4).toUpperCase()})
                                </span>
                              )}
                              {order.payment_method === 'pay_on_delivery' && (
                                <span className={`${chip} border border-warning-border bg-warning-subtle text-warning`}>
                                  <Truck className="w-3 h-3" />
                                  Pagar na entrega
                                </span>
                              )}
                              {order.payment_method === 'MISTO' && order.payment_splits && order.payment_splits.length > 0 && (
                                <span className={`${chip} flex-wrap bg-muted text-ink-600 border border-border tabular-nums`}>
                                  {order.payment_splits.map((s, i) => (
                                    <span key={i}>
                                      {s.method} {brl(s.amount)}{i < order.payment_splits!.length - 1 ? ' +' : ''}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {order.payment_method && order.payment_method !== 'pay_on_delivery' && order.payment_method !== 'MISTO' && (
                                <span className={`${chip} bg-muted text-ink-600 border border-border`}>
                                  {order.payment_method}
                                </span>
                              )}
                              {itemsCount > 0 && (
                                <span className={`${chip} bg-muted text-ink-600 border border-border tabular-nums`}>
                                  {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                                </span>
                              )}
                            </div>

                            {order.notes && (
                              <div className="mb-3 bg-surface border border-border p-2 rounded-md flex items-start gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <p className="text-[12px] text-foreground leading-relaxed line-clamp-2">
                                  {order.notes}
                                </p>
                              </div>
                            )}

                            {order.payment_method === 'pay_on_delivery' && order.status === 'recebido' && (
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, 'pago'); }}
                                disabled={updateStatusMutation.isPending}
                                className="w-full mb-3 bg-success-solid text-white hover:bg-success-solid/90"
                              >
                                <CheckCircle2 />
                                Confirmar pagamento recebido
                              </Button>
                            )}

                            <div className="pt-2.5 border-t border-border flex items-center justify-between gap-3">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[14px] font-semibold text-foreground tabular-nums leading-none">
                                  {brl(order.total)}
                                </span>
                                {order.discount_amount > 0 && (
                                  <span className="text-[12px] text-success font-medium flex items-center gap-1 mt-1 whitespace-nowrap tabular-nums">
                                    <Tag className="w-3 h-3" /> −{brl(order.discount_amount)}
                                  </span>
                                )}
                              </div>

                              <div className="relative isolate shrink-0">
                                <StyledSelect
                                  variant="bare"
                                  value={order.status}
                                  onChange={(v) => handleStatusChange(order.id, v as typeof statusOptions[number])}
                                  disabled={updateStatusMutation.isPending}
                                  options={statusOptions.map((s) => ({ value: s, label: statusConfig[s].label, dotClassName: statusConfig[s].indicator }))}
                                  searchable={false}
                                  className={`pl-2 pr-2 h-7 rounded-md text-[12px] font-medium ring-1 ring-inset ${style.ring} ${style.bg} ${style.text} focus:outline-none focus:ring-2 focus:ring-ring min-w-[100px] max-w-[140px]`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {columnOrders.length === 0 && (
                        <div className="h-16 flex items-center justify-center rounded-md border border-border border-dashed">
                          <span className="text-[12px] text-muted-foreground">Nenhum pedido</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AdminPage>

      {orderToCoupon && (
        <OrderCouponModal
          order={orderToCoupon}
          onClose={() => setOrderToCoupon(null)}
        />
      )}

      <Dialog
        open={!!orderToProof}
        onOpenChange={(open) => { if (!open) { setOrderToProof(null); setProofFile(null); } }}
      >
        <DialogContent className="max-w-sm">
          {orderToProof && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[16px]">
                  Comprovante <span className="font-mono">#{orderToProof.id.slice(0, 8).toUpperCase()}</span>
                </DialogTitle>
              </DialogHeader>

              {orderToProof.payment_proof_url && (
                <div>
                  <a href={orderToProof.payment_proof_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={orderToProof.payment_proof_url}
                      alt="Comprovante"
                      className="w-full rounded-lg border border-border object-contain max-h-52 bg-muted"
                    />
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateProofMutation.mutate({ orderId: orderToProof.id, url: null })}
                    disabled={updateProofMutation.isPending}
                    className="mt-2 w-full text-danger hover:text-danger hover:bg-danger-subtle"
                  >
                    Remover comprovante
                  </Button>
                </div>
              )}

              <label className="block cursor-pointer">
                <div className={`w-full py-3 px-4 rounded-lg border border-dashed transition-colors ${proofFile ? 'border-success-border bg-success-subtle' : 'border-border hover:border-ink-300'}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-[13px] font-medium text-center text-muted-foreground truncate">
                    {proofFile ? proofFile.name : orderToProof.payment_proof_url ? 'Substituir imagem' : 'Selecionar comprovante'}
                  </p>
                </div>
              </label>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="secondary" onClick={() => { setOrderToProof(null); setProofFile(null); }}>
                  Fechar
                </Button>
                <Button
                  onClick={() => handleProofUpload(orderToProof)}
                  disabled={!proofFile || uploadingProof}
                >
                  {uploadingProof && <Loader className="animate-spin" />}
                  Salvar comprovante
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!orderToDelete}
        onOpenChange={(open) => { if (!open && !deleteOrderMutation.isPending) setOrderToDelete(null); }}
      >
        <DialogContent className="max-w-sm">
          {orderToDelete && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[16px]">
                  Excluir pedido <span className="font-mono">#{orderToDelete.id.slice(0, 8).toUpperCase()}</span>?
                </DialogTitle>
                <DialogDescription>
                  Esta ação apaga o pedido permanentemente e não pode ser desfeita.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="secondary"
                  onClick={() => setOrderToDelete(null)}
                  disabled={deleteOrderMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteOrderMutation.mutate(orderToDelete.id)}
                  disabled={deleteOrderMutation.isPending}
                >
                  {deleteOrderMutation.isPending && <Loader className="animate-spin" />}
                  Excluir pedido
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminPedidos;
