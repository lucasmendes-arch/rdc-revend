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
    <div className="w-full border-b border-border bg-background">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">

          <div className="min-w-0">
            <p className="eyebrow mb-2.5">Catálogo B2B</p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground leading-tight tracking-tight max-w-xl">
              Catálogo exclusivo para revenda
            </h1>
            <p className="text-[14px] text-muted-foreground mt-2.5 leading-relaxed max-w-xl">
              Compre no atacado para salão ou revenda, com kits prontos e produtos
              avulsos para montar o seu pedido.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button
                onClick={onScrollToKits}
                className="h-9 px-3.5 rounded-md btn-primary text-[13px] flex items-center justify-center gap-1.5"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Ver kits mais vendidos
              </button>
              <button
                onClick={onScrollToProducts}
                className="h-9 px-3.5 rounded-md btn-secondary text-[13px] flex items-center justify-center gap-1.5"
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
                <Icon className="w-4 h-4 text-ink-400 shrink-0" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground leading-none">{label}</dt>
                  <dd className="text-[13px] font-medium text-foreground leading-none mt-1 numeric">{value}</dd>
                </div>
              </div>
            ))}
          </dl>

        </div>
      </div>
    </div>
  );
}
