import { useRef, useState } from 'react';
import { X, Download, MessageCircle, Loader, Package } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl border border-border flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-bold text-foreground text-sm">Pedido de Venda</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={docRef}
            className="bg-white text-gray-900 rounded-xl overflow-hidden"
            style={{ fontFamily: 'system-ui, sans-serif', minWidth: 320 }}
          >
            {/* Dark header */}
            <div className="bg-[#1a1a1a] px-6 pt-6 pb-4 text-center">
              <img
                src={logoUrl}
                alt="Rei dos Cachos"
                className="h-10 mx-auto mb-2 object-contain"
                crossOrigin="anonymous"
              />
              <p className="text-[#c9a84c] text-[10px] font-bold tracking-widest uppercase mt-1">
                Proposta de Venda
              </p>
            </div>

            {/* Gold accent line */}
            <div className="h-1 bg-gradient-to-r from-[#c9a84c] via-[#f0d080] to-[#c9a84c]" />

            {/* Date + client */}
            <div className="px-5 py-4 border-b border-dashed border-gray-100 flex items-start justify-between gap-3">
              <div>
                {data.customer_name && (
                  <>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Para</p>
                    <p className="text-[13px] font-bold text-gray-900 leading-tight">{data.customer_name}</p>
                    {data.customer_phone && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{data.customer_phone}</p>
                    )}
                  </>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Data</p>
                <p className="text-[11px] font-semibold text-gray-700">{today}</p>
                {data.order_number && (
                  <p className="text-[9px] text-gray-400 mt-0.5">#{data.order_number}</p>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="px-5 py-4 border-b border-dashed border-gray-100">
              <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-3">Produtos</p>
              <div className="space-y-3">
                {data.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-50 border border-gray-100">
                      {item.main_image ? (
                        <img
                          src={item.main_image}
                          alt=""
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-gray-800 leading-snug">
                        {item.product_name}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {item.quantity}x · R$ {item.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-[13px] font-bold text-gray-900 whitespace-nowrap shrink-0">
                      R$ {item.line_total.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="px-5 py-4 space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-700">R$ {data.subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">Desconto</span>
                  <span className="font-medium text-emerald-600">− R$ {discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[15px] font-extrabold pt-2 border-t border-gray-100">
                <span className="text-gray-900">Total</span>
                <span className="text-[#c9a84c]">R$ {data.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Notes */}
            {data.notes && (
              <div className="px-5 pb-4 border-t border-dashed border-gray-100 pt-3">
                <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Observações</p>
                <p className="text-[11px] text-gray-700 leading-relaxed">{data.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="bg-[#f9f6f0] px-5 py-4 text-center">
              <p className="text-[10px] font-bold text-[#c9a84c] uppercase tracking-widest">
                Confira e confirme seu pedido
              </p>
              <p className="text-[9px] text-gray-400 mt-0.5">reidoscachos.com.br</p>
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
          {data.customer_phone && (
            <button
              onClick={handleWhatsApp}
              disabled={capturing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {capturing ? <Loader className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
              Enviar WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesOrderModal;
