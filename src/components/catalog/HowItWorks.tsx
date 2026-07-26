import { Search, ShoppingCart, TrendingUp } from "lucide-react";

/**
 * Três passos do fluxo de compra.
 *
 * A numeração fica porque aqui ela é honesta: isto é de fato uma sequência, e a
 * ordem carrega informação. O que saiu foi a decoração em volta dela — círculos
 * âmbar de 56px, linha conectora posicionada com `-z-10`, sombra colorida e
 * `hover:scale-105` num elemento que não é clicável.
 */

const STEPS = [
  {
    id: 1,
    icon: Search,
    title: "Escolha os produtos",
    desc: "Navegue pelos kits prontos ou monte a partir de produtos avulsos.",
  },
  {
    id: 2,
    icon: ShoppingCart,
    title: "Monte o pedido",
    desc: "Adicione quantidades de atacado ao carrinho.",
  },
  {
    id: 3,
    icon: TrendingUp,
    title: "Receba e revenda",
    desc: "Acompanhe a margem sugerida de cada item.",
  },
];

export default function HowItWorks() {
  return (
    <div className="w-full surface-card p-5 sm:p-6 mb-8 mt-4">
      <h2 className="eyebrow mb-5">Como funciona</h2>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
        {STEPS.map(({ id, icon: Icon, title, desc }) => (
          <li key={id} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-7 h-7 rounded-md border border-border bg-muted flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-ink-500" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground leading-tight">
                <span className="mono text-ink-400 mr-1.5">{id}</span>
                {title}
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">{desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
