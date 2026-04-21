import { useRef, useState } from 'react';
import { X, Download, MessageCircle, Loader } from 'lucide-react';
import html2canvas from 'html2canvas';
import logoUrl from '@/assets/logo-rei-dos-cachos.png';

interface OrderItem {
  id: string;
  product_name_snapshot: string;
  qty: number;
  line_total: number;
}

interface Order {
  id: string;
  status: string;
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
  notes?: string | null;
  sellers?: { name: string; code: string | null } | null;
  created_at: string;
  order_items: OrderItem[];
}

const statusLabels: Record<string, string> = {
  recebido: 'Recebido',
  aguardando_pagamento: 'Aguardando Pagamento',
  pago: 'Pago',
  separacao: 'Em Separação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

function paymentLabel(order: Order): string {
  if (order.payment_method === 'pay_on_delivery') return 'Pagar na Entrega';
  if (order.payment_method === 'MISTO' && order.payment_splits?.length) {
    return order.payment_splits.map(s => `${s.method} R$ ${s.amount.toFixed(2)}`).join(' + ');
  }
  return order.payment_method || '—';
}

interface Props {
  order: Order;
  onClose: () => void;
}

const OrderCouponModal = ({ order, onClose }: Props) => {
  const couponRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const subtotal = order.subtotal ?? order.total;
  const shipping = order.shipping ?? 0;
  const discount = order.discount_amount ?? 0;

  const capture = async (): Promise<HTMLCanvasElement | null> => {
    if (!couponRef.current) return null;
    setCapturing(true);
    try {
      const canvas = await html2canvas(couponRef.current, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        allowTaint: false,
      });
      return canvas;
    } finally {
      setCapturing(false);
    }
  };

  const handleDownload = async () => {
    const canvas = await capture();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `cupom-pedido-${orderNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleWhatsApp = async () => {
    const canvas = await capture();
    if (!canvas) return;

    // Download image first, then open WhatsApp
    const link = document.createElement('a');
    link.download = `cupom-pedido-${orderNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    const phone = order.customer_whatsapp.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Olá ${order.customer_name.split(' ')[0]}! Segue o resumo do seu pedido #${orderNumber} 🛍️`
    );
    setTimeout(() => {
      window.open(`https://wa.me/55${phone}?text=${text}`, '_blank');
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl border border-border flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-bold text-foreground text-sm">Cupom Não Fiscal — #{orderNumber}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Coupon preview (scrollable) */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* This div is what gets captured */}
          <div
            ref={couponRef}
            className="bg-white text-gray-900 rounded-xl overflow-hidden"
            style={{ fontFamily: 'system-ui, sans-serif', minWidth: 320 }}
          >
            {/* Coupon header */}
            <div className="bg-[#1a1a1a] px-6 pt-6 pb-5 text-center">
              <img
                src={logoUrl}
                alt="Rei dos Cachos"
                className="h-10 mx-auto mb-2 object-contain"
                crossOrigin="anonymous"
              />
              <p className="text-[#c9a84c] text-[11px] font-bold tracking-widest uppercase mt-1">
                Pedido #{orderNumber}
              </p>
            </div>

            {/* Order identity */}
            <div className="px-5 py-4 border-b border-dashed border-gray-200 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Pedido</p>
                <p className="text-lg font-extrabold text-gray-900 leading-none">#{orderNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Data</p>
                <p className="text-[12px] font-semibold text-gray-700">{orderDate}</p>
              </div>
            </div>

            {/* Status + seller */}
            <div className="px-5 py-3 border-b border-dashed border-gray-200 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Status:</span>
                <span className="text-[11px] font-bold text-gray-800">
                  {statusLabels[order.status] ?? order.status}
                </span>
              </div>
              {order.sellers && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Vendedor:</span>
                  <span className="text-[11px] font-bold text-gray-800">
                    {order.sellers.code || order.sellers.name}
                  </span>
                </div>
              )}
            </div>

            {/* Client */}
            <div className="px-5 py-4 border-b border-dashed border-gray-200">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Cliente</p>
              <p className="text-[13px] font-bold text-gray-900">{order.customer_name}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{order.customer_whatsapp}</p>
              {order.customer_email && (
                <p className="text-[11px] text-gray-500">{order.customer_email}</p>
              )}
            </div>

            {/* Items */}
            <div className="px-5 py-4 border-b border-dashed border-gray-200">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">Itens</p>
              <div className="space-y-2.5">
                {order.order_items.map((item) => {
                  const unitPrice = item.qty > 0 ? item.line_total / item.qty : 0;
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 leading-snug">
                          {item.product_name_snapshot}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {item.qty}x · R$ {unitPrice.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-[12px] font-bold text-gray-900 whitespace-nowrap">
                        R$ {item.line_total.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals */}
            <div className="px-5 py-4 border-b border-dashed border-gray-200 space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-700">R$ {subtotal.toFixed(2)}</span>
              </div>
              {shipping > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">Frete</span>
                  <span className="font-medium text-gray-700">R$ {shipping.toFixed(2)}</span>
                </div>
              )}
              {shipping === 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">Frete</span>
                  <span className="font-medium text-green-600">Grátis</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">Desconto</span>
                  <span className="font-medium text-green-600">- R$ {discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[15px] font-extrabold pt-2 border-t border-gray-100">
                <span className="text-gray-900">Total</span>
                <span className="text-[#c9a84c]">R$ {order.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment + delivery */}
            <div className="px-5 py-4 border-b border-dashed border-gray-200 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide shrink-0 pt-0.5">Pagamento:</span>
                <span className="text-[11px] font-semibold text-gray-800">{paymentLabel(order)}</span>
              </div>
              {order.delivery_method === 'pickup' && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide shrink-0 pt-0.5">Retirada:</span>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-800">
                      Unidade {order.pickup_unit_slug?.charAt(0).toUpperCase()}{order.pickup_unit_slug?.slice(1)}
                    </p>
                    {order.pickup_unit_address && (
                      <p className="text-[10px] text-gray-400">{order.pickup_unit_address}</p>
                    )}
                  </div>
                </div>
              )}
              {order.delivery_method === 'delivery' && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Entrega:</span>
                  <span className="text-[11px] font-semibold text-gray-800">Envio pelo Correios/Transportadora</span>
                </div>
              )}
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="px-5 py-3 border-b border-dashed border-gray-200">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Observações</p>
                <p className="text-[11px] text-gray-700 leading-relaxed">{order.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-4 text-center">
              <p className="text-[9px] text-gray-300 uppercase tracking-widest">
                Este documento não possui validade fiscal
              </p>
              <p className="text-[9px] text-gray-300 mt-0.5">reidoscachos.com.br</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-4 border-t border-border flex gap-2.5 shrink-0">
          <button
            onClick={handleDownload}
            disabled={capturing}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {capturing ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Baixar imagem
          </button>
          <button
            onClick={handleWhatsApp}
            disabled={capturing}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {capturing ? <Loader className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            Enviar WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderCouponModal;
