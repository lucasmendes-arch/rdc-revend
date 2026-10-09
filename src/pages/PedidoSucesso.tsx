import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrackConversion } from '@/lib/hooks/useFacebookConversion';
import { getOrderStatus } from '@/lib/design/orderStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoading } from '@/components/admin/ui/AdminPage';
import { PortalPage, PortalSection, PortalTopBar } from '@/components/portal/PortalPage';

interface Order {
  id: string;
  status: 'recebido' | 'aguardando_pagamento' | 'pago' | 'separacao' | 'enviado' | 'entregue' | 'concluido' | 'cancelado' | 'expirado';
  total: number;
  subtotal?: number | null;
  shipping?: number | null;
  discount_amount?: number | null;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string;
  delivery_method?: string;
  pickup_unit_slug?: string;
  pickup_unit_address?: string;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name_snapshot: string;
    unit_price_snapshot: number;
    qty: number;
    line_total: number;
  }>;
}


function splitFullName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {};
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || undefined,
  };
}

const PedidoSucesso = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const trackConversion = useTrackConversion();
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
            *,
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
        const { firstName, lastName } = splitFullName(data.customer_name);

        trackConversion({
          eventName: 'Purchase',
          email: data.customer_email,
          phone: data.customer_whatsapp,
          firstName,
          lastName,
          country: 'br',
          value: data.total,
          currency: 'BRL',
          contentName: `Pedido ${data.id.slice(0, 8).toUpperCase()}`,
          contentType: 'product',
          eventId: `purchase_${data.id}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar pedido';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id, trackConversion]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PortalTopBar backTo="/meus-pedidos" backLabel="Meus pedidos" />
        <PageLoading label="Carregando pedido…" className="py-24" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background">
        <PortalTopBar backTo="/catalogo" backLabel="Catálogo" />
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="surface-card shadow-xs">
            <EmptyState
              icon={AlertCircle}
              title="Não foi possível abrir este pedido"
              description={`${error || 'Pedido não encontrado'}. Confira em Meus pedidos ou volte ao catálogo.`}
              action={
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button variant="secondary" onClick={() => navigate('/meus-pedidos')}>Meus pedidos</Button>
                  <Button onClick={() => navigate('/catalogo')}>
                    Voltar ao catálogo
                    <ArrowRight />
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const statusMeta = getOrderStatus(order.status);
  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Exibição do resumo a partir das colunas gravadas no pedido (não recalcula).
  // Pedido legado sem `subtotal` cai no total.
  const subtotal = order.subtotal ?? order.total;
  const shipping = order.shipping ?? 0;
  const discount = order.discount_amount ?? 0;
  const isPickup = order.delivery_method === 'pickup';
  const pickupUnitName =
    order.pickup_unit_slug === 'linhares' ? 'Linhares'
      : order.pickup_unit_slug === 'serra' ? 'Serra'
        : order.pickup_unit_slug === 'teixeira' ? 'Teixeira'
          : order.pickup_unit_slug;

  const steps = [
    { label: 'Pedido recebido', desc: 'Recebemos o seu pedido', done: true },
    { label: 'Em separação', desc: 'Preparamos os produtos', done: false },
    { label: isPickup ? 'Pronto para retirada' : 'Enviado', desc: isPickup ? 'Avisamos quando puder retirar' : 'Seu pedido a caminho', done: false },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PortalTopBar backTo="/meus-pedidos" backLabel="Meus pedidos" />

      <PortalPage
        width="narrow"
        title={
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-success-subtle border border-success-border flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-success" />
            </span>
            Pedido confirmado
          </span>
        }
        subtitle={
          <>
            Obrigado pela compra. Seu pedido <span className="mono text-foreground">#{orderNumber}</span> foi recebido em{' '}
            <span className="numeric">{orderDate}</span>.
          </>
        }
        badge={<Badge variant={statusMeta.tone} dot>{statusMeta.label}</Badge>}
        actions={
          <>
            <Button onClick={() => navigate('/meus-pedidos')}>
              Ver meus pedidos
              <ArrowRight />
            </Button>
            <Button variant="secondary" onClick={() => navigate('/catalogo')}>
              Continuar comprando
            </Button>
          </>
        }
      >
        <PortalSection title="Itens do pedido">
          <div className="surface-card shadow-xs p-4 sm:p-5">
            <div className="space-y-3 pb-4 border-b border-border">
              {order.order_items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{item.product_name_snapshot}</p>
                    <p className="text-[12px] text-muted-foreground numeric">
                      {item.qty}x · R$ {item.unit_price_snapshot.toFixed(2)}
                    </p>
                  </div>
                  <p className="text-[13px] font-medium text-foreground whitespace-nowrap numeric">
                    R$ {item.line_total.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <dl className="pt-4 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="text-foreground numeric">R$ {subtotal.toFixed(2)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{isPickup ? 'Retirada' : 'Frete'}</dt>
                <dd className="text-foreground numeric">
                  {shipping > 0 ? `R$ ${shipping.toFixed(2)}` : <span className="text-success">Grátis</span>}
                </dd>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-success">
                  <dt>Desconto</dt>
                  <dd className="numeric">− R$ {discount.toFixed(2)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-3 border-t border-border">
                <dt className="text-[14px] font-semibold text-foreground">Total</dt>
                <dd className="font-title text-[24px] font-semibold text-foreground numeric leading-none">
                  R$ {order.total.toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>
        </PortalSection>

        <PortalSection title="Dados do pedido">
          <div className="surface-card shadow-xs p-4 sm:p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <div>
                <dt className="text-[12px] text-muted-foreground">Nome</dt>
                <dd className="text-foreground mt-0.5 break-words">{order.customer_name}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">WhatsApp</dt>
                <dd className="text-foreground mt-0.5 numeric">{order.customer_whatsapp}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">E-mail</dt>
                <dd className="text-foreground mt-0.5 break-all">{order.customer_email}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">Entrega</dt>
                <dd className="text-foreground mt-0.5">
                  {isPickup ? `Retirada na unidade ${pickupUnitName}` : 'Envio para o endereço cadastrado'}
                </dd>
              </div>
              {isPickup && order.pickup_unit_address && (
                <div className="sm:col-span-2">
                  <dt className="text-[12px] text-muted-foreground">Endereço de retirada</dt>
                  <dd className="text-foreground mt-0.5">{order.pickup_unit_address}</dd>
                </div>
              )}
            </dl>
          </div>
        </PortalSection>

        <PortalSection title="Próximos passos">
          <ol className="surface-card shadow-xs p-4 sm:p-5 space-y-3.5">
            {steps.map((s, i) => (
              <li key={s.label} className="flex gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium numeric shrink-0 ${
                    s.done
                      ? 'bg-success-subtle text-success border border-success-border'
                      : 'bg-background text-ink-400 border border-border'
                  }`}
                >
                  {s.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground leading-6">{s.label}</p>
                  <p className="text-[12px] text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </PortalSection>
      </PortalPage>
    </div>
  );
};

export default PedidoSucesso;
