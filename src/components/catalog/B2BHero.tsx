import { ArrowDown, CreditCard, ShoppingBag, MessageCircle } from "lucide-react";

interface B2BHeroProps {
  onScrollToKits: () => void;
  onScrollToProducts: () => void;
}

/**
 * Cabeçalho do catálogo B2B.
 *
 * Era um hero de landing page: fundo em gradiente âmbar, `font-black` (peso
 * 900), título em `amber-950`, badge com bolinha pulsando e um card flutuante
 * de benefícios com sombra colorida. Isso vende para quem ainda não é cliente
 * — mas quem abre esta tela já é parceiro logado e veio comprar.
 *
 * Virou o que a tela precisa ser: título, o que fazer, e as três condições
 * comerciais que o parceiro consulta de fato (mínimo, pagamento, suporte)
 * como linha de fatos, não como cartão decorado.
 */

const FACTS = [
  { icon: ShoppingBag,    label: "Pedido mínimo", value: "A partir de R$ 500,00" },
  { icon: CreditCard,     label: "Pagamento",     value: "Pix ou cartão" },
  { icon: MessageCircle,  label: "Suporte",       value: "Via WhatsApp" },
];

export default function B2BHero({ onScrollToKits, onScrollToProducts }: B2BHeroProps) {
  return (
    <div className="w-full bg-background bg-ambient border-b border-border">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">

          <div className="min-w-0">
                        <h1 className="text-[30px] sm:text-[40px] leading-[1.1] text-foreground max-w-xl">
              Catálogo exclusivo para revenda
            </h1>
            <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed max-w-xl">
              Compre no atacado para salão ou revenda, com kits prontos e produtos
              avulsos para montar o seu pedido.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-7">
              <button
                onClick={onScrollToKits}
                className="h-10 px-4 rounded-md btn-primary text-[14px] flex items-center justify-center gap-1.5"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Ver kits mais vendidos
              </button>
              <button
                onClick={onScrollToProducts}
                className="h-10 px-4 rounded-md btn-secondary text-[14px] flex items-center justify-center gap-1.5"
              >
                Explorar catálogo
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Condições comerciais: dado, não banner. */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-x-8 gap-y-3 shrink-0">
            {FACTS.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-md bg-brand-subtle ring-1 ring-inset ring-brand-border flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-brand-strong" /></span>
                <div className="min-w-0">
                  <dt className="text-[12px] text-muted-foreground leading-none">{label}</dt>
                  <dd className="text-[14px] font-medium text-foreground leading-none mt-1.5 numeric">{value}</dd>
                </div>
              </div>
            ))}
          </dl>

        </div>
      </div>
    </div>
  );
}
