import { useRef, useState } from 'react';
import { Download, MessageCircle, Loader, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import html2canvas from 'html2canvas';
import logoUrl from '@/assets/logo-rei-dos-cachos.png';

export interface SalesOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  main_image: string | null;
}

export interface SalesOrderData {
  customer_name?: string;
  customer_phone?: string;
  items: SalesOrderItem[];
  subtotal: number;
  discount_amount?: number;
  total: number;
  notes?: string;
  date?: string;
  order_number?: string;
}

interface Props {
  data: SalesOrderData;
  onClose: () => void;
}

const SalesOrderModal = ({ data, onClose }: Props) => {
  const docRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  const today = data.date
    ? new Date(data.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const discount = data.discount_amount ?? 0;

  const capture = async (): Promise<HTMLCanvasElement | null> => {
    if (!docRef.current) return null;
    setCapturing(true);
    try {
      const canvas = await html2canvas(docRef.current, {
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

  const filename = data.order_number
    ? `pedido-venda-${data.order_number}.png`
    : `pedido-venda-${Date.now()}.png`;

  const handleDownload = async () => {
    const canvas = await capture();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleWhatsApp = async () => {
    const canvas = await capture();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    if (data.customer_phone) {
      const phone = data.customer_phone.replace(/\D/g, '');
      const name = data.customer_name?.split(' ')[0] || '';
      const text = encodeURIComponent(
        `Olá${name ? ` ${name}` : ''}! Segue a proposta com os produtos selecionados para você 🛍️`
      );
      setTimeout(() => {
        window.open(`https://wa.me/55${phone}?text=${text}`, '_blank');
      }, 600);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)] p-0 gap-0 flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <DialogHeader className="px-5 pr-12 py-4 border-b border-border shrink-0 text-left">
          <DialogTitle className="text-[16px]">Pedido de venda</DialogTitle>
        </DialogHeader>

        {/* Document preview */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div
            ref={docRef}
            className="bg-card text-foreground rounded-lg border border-border overflow-hidden"
            style={{ fontFamily: 'system-ui, sans-serif', minWidth: 300 }}
          >
            {/* Dark header */}
            <div className="bg-[#1a1a1a] px-6 pt-6 pb-4 text-center">
              <img
                src={logoUrl}
                alt="Rei dos Cachos"
                className="h-10 mx-auto mb-2 object-contain"
                crossOrigin="anonymous"
              />
              <p className="text-brand text-[12px] font-medium mt-1">
                Proposta de Venda
              </p>
            </div>

            {/* Gold accent line */}
            <div className="h-1 bg-brand" />

            {/* Date + client */}
            <div className="px-5 py-4 border-b border-dashed border-border flex items-start justify-between gap-3">
              <div>
                {data.customer_name && (
                  <>
                    <p className="text-[11px] text-ink-500 mb-0.5">Para</p>
                    <p className="text-[13px] font-semibold text-foreground leading-tight">{data.customer_name}</p>
                    {data.customer_phone && (
                      <p className="text-[10px] text-ink-400 mt-0.5">{data.customer_phone}</p>
                    )}
                  </>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-ink-500 mb-0.5">Data</p>
                <p className="text-[11px] font-semibold text-ink-700">{today}</p>
                {data.order_number && (
                  <p className="text-[10px] text-ink-400 mt-0.5 font-mono">#{data.order_number}</p>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="px-5 py-4 border-b border-dashed border-border">
              <p className="text-[11px] text-ink-500 mb-3">Produtos</p>
              <div className="space-y-3">
                {data.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface border border-border">
                      {item.main_image ? (
                        <img
                          src={item.main_image}
                          alt=""
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-ink-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground leading-snug">
                        {item.product_name}
                      </p>
                      <p className="text-[10px] text-ink-400 mt-0.5">
                        {item.quantity}x · R$ {item.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold text-foreground whitespace-nowrap shrink-0 tabular-nums">
                      R$ {item.line_total.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="px-5 py-4 space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-ink-700">R$ {data.subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="font-medium text-success">− R$ {discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[15px] font-semibold pt-2 border-t border-border tabular-nums">
                <span className="text-foreground">Total</span>
                <span className="text-brand-strong">R$ {data.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Notes */}
            {data.notes && (
              <div className="px-5 pb-4 border-t border-dashed border-border pt-3">
                <p className="text-[11px] text-ink-500 mb-1">Observações</p>
                <p className="text-[11px] text-ink-700 leading-relaxed">{data.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="bg-brand-subtle px-5 py-4 text-center">
              <p className="text-[12px] font-medium text-brand-strong">
                Confira e confirme seu pedido
              </p>
              <p className="text-[9px] text-ink-400 mt-0.5">reidoscachos.com.br</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
          <Button variant="secondary" onClick={handleDownload} disabled={capturing} className="flex-1">
            {capturing ? <Loader className="animate-spin" /> : <Download />}
            Baixar imagem
          </Button>
          {data.customer_phone && (
            /* Verde WhatsApp: exceção de marca documentada (design-tokens §8) */
            <Button
              onClick={handleWhatsApp}
              disabled={capturing}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {capturing ? <Loader className="animate-spin" /> : <MessageCircle />}
              Enviar pelo WhatsApp
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SalesOrderModal;
