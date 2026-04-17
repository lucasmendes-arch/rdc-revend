import { ArrowDown, CreditCard, ShoppingBag, MessageCircle } from "lucide-react";

interface B2BHeroProps {
  onScrollToKits: () => void;
  onScrollToProducts: () => void;
}

export default function B2BHero({ onScrollToKits, onScrollToProducts }: B2BHeroProps) {
  return (
    <div className="w-full bg-gradient-to-br from-amber-50 to-white/60 border-b border-amber-100 py-6 sm:py-10 px-4">
      <div className="container mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-10">
        
        {/* Texts */}
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-100/50 mb-3 sm:mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] sm:text-xs font-bold text-amber-800 uppercase tracking-widest">Portal B2B</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-amber-950 leading-tight mb-2 sm:mb-3">
            Catálogo exclusivo <br className="hidden md:block"/> para revenda
          </h1>
          <p className="text-sm sm:text-base text-amber-800/80 mb-5 sm:mb-6 leading-relaxed max-w-xl mx-auto md:mx-0">
            Compre no atacado para salão ou revenda, com kits prontos e produtos avulsos para montar seu pedido com alta lucratividade.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
            <button 
              onClick={onScrollToKits}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all text-sm flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" /> Ver kits mais vendidos
            </button>
            <button 
              onClick={onScrollToProducts}
              className="px-6 py-2.5 rounded-xl border border-amber-300 bg-white/80 hover:bg-amber-50 text-amber-900 font-bold shadow-sm transition-all text-sm flex items-center justify-center gap-2"
            >
              Explorar catálogo <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Benefits Micro */}
        <div className="w-full md:w-auto bg-white rounded-2xl p-5 border border-amber-100 shadow-[0_4px_24px_rgba(217,119,6,0.06)] flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">Pedido Mínimo</span>
              <span className="text-xs text-muted-foreground">A partir de R$ 500,00</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">Pagamento</span>
              <span className="text-xs text-muted-foreground">Via Pix ou Cartão</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">Suporte</span>
              <span className="text-xs text-muted-foreground">Via WhatsApp</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
