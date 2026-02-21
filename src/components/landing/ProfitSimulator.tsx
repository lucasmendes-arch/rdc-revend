import { useEffect, useRef } from "react";
import { Calculator, ArrowRight, Gift } from "lucide-react";
import { useScrollToForm } from "@/hooks/useScrollToForm";

const simulations = [
  {
    package: "Pacote 1 — Iniciante",
    invest: "R$ 497,99",
    includes: [
      "Itens com maior giro de vendas",
      "E-book Guia de Vendas para Revendedores",
    ],
    includesFull: "Seleção dos itens com maior giro de vendas + E-book Guia de Vendas para Revendedores",
    revenue: "R$ 1.050",
    multiplier: "2.1x",
    bonus: null,
    highlight: false,
    badge: null,
  },
  {
    package: "Pacote 2 — Crescimento",
    invest: "R$ 1.497,99",
    includes: [
      "Itens de maior giro + variedades da linha",
      "E-book + Videoaula exclusiva (2h)",
    ],
    includesFull: "Itens de maior giro + variedades da linha + E-book + Videoaula exclusiva (2h) de técnicas de venda",
    revenue: "R$ 3.200",
    multiplier: "2.1x",
    bonus: null,
    highlight: false,
    badge: null,
  },
  {
    package: "Pacote 3 — Pro",
    invest: "R$ 2.997,99",
    includes: [
      "Itens de maior giro e maior margem",
      "Tudo do Pacote 2 + 🚚 Frete Grátis",
    ],
    includesFull: "Itens de maior giro e maior margem + tudo do Pacote 2 + 🚚 Frete Grátis",
    revenue: "R$ 6.500",
    multiplier: "2.2x",
    bonus: "🎁 + Frete Grátis incluso",
    highlight: true,
    badge: "⭐ Mais Popular",
  },
  {
    package: "Pacote 4 — Elite",
    invest: "R$ 4.997,99",
    includes: [
      "Tudo do Pacote 3",
      "Kit Expositor Personalizado para PDV",
    ],
    includesFull: "Tudo do Pacote 3 + Kit Expositor Personalizado para PDV (display físico com a identidade visual Rei dos Cachos para montar no seu salão ou loja)",
    revenue: "R$ 10.500",
    multiplier: "2.1x",
    bonus: "🎁 + Expositor Personalizado para seu PDV",
    highlight: false,
    badge: "👑 Exclusivo",
  },
];

const ProfitSimulator = () => {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollToForm = useScrollToForm();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1 }
    );
    cardRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-14 sm:py-20 lg:py-28" style={{ background: "#faf8f3" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <Calculator className="w-3.5 h-3.5 text-gold-text" />
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Simulador de Lucro
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Veja Quanto Você{" "}
            <span className="gradient-gold-text">Pode Faturar</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Com margens reais de até 130%, cada real investido vira dois. Escolha seu pacote:
          </p>
        </div>

        {/* MOBILE: Cards */}
        <div className="sm:hidden flex flex-col gap-4 max-w-md mx-auto">
          {simulations.map((sim, idx) => (
            <div
              key={idx}
              ref={(el) => (cardRefs.current[idx] = el)}
              className={`rounded-2xl p-5 border ${
                sim.highlight
                  ? "border-gold bg-gold-light"
                  : "border-border bg-white"
              }`}
              style={{
                opacity: 0,
                transform: "translateY(20px)",
                transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms`,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-foreground text-base">{sim.package}</span>
                {sim.badge && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    sim.highlight
                      ? "gradient-gold text-white"
                      : "bg-foreground text-primary-foreground"
                  }`}>
                    {sim.badge}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Você investe</div>
                  <div className="text-lg font-bold text-foreground">{sim.invest}</div>
                </div>
                <div className="flex items-center gap-1">
                  <ArrowRight className="w-4 h-4 text-gold-text" />
                  <span className="text-xs font-bold text-gold-text bg-gold-light border border-gold-border px-2 py-0.5 rounded-full">
                    {sim.multiplier}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Você fatura</div>
                  <div className={`text-xl font-bold ${sim.highlight ? "gradient-gold-text" : "text-foreground"}`}>
                    {sim.revenue}
                  </div>
                </div>
              </div>

              <ul className="text-xs text-muted-foreground space-y-1 mb-2">
                {sim.includes.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-gold-text mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {sim.bonus && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Gift className="w-3.5 h-3.5 text-gold-text flex-shrink-0" />
                  <span className="text-xs font-medium text-gold-text">{sim.bonus}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* DESKTOP: Table */}
        <div className="hidden sm:block max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-card">
            <div className="grid grid-cols-4 gap-0 bg-foreground text-primary-foreground px-4 py-4">
              <div className="text-sm font-semibold opacity-70">Pacote</div>
              <div className="text-sm font-semibold opacity-70 text-center">Você Investe</div>
              <div className="text-sm font-semibold opacity-70 text-center">O que inclui</div>
              <div className="text-sm font-semibold opacity-70 text-right">Você Fatura</div>
            </div>

            {simulations.map((sim, idx) => (
              <div
                key={idx}
                className={`border-b border-border last:border-b-0 ${
                  sim.highlight ? "bg-gold-light border-l-4 border-l-gold" : "hover:bg-surface-alt"
                }`}
              >
                <div className="grid grid-cols-4 items-start px-4 py-4 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground text-sm">{sim.package}</span>
                    {sim.badge && (
                      <span className={`inline-flex self-start text-xs font-bold px-2 py-0.5 rounded-full ${
                        sim.highlight ? "gradient-gold text-white" : "bg-foreground text-primary-foreground"
                      }`}>
                        {sim.badge}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <span className="font-semibold text-foreground text-sm">{sim.invest}</span>
                    <div className="flex items-center gap-1">
                      <ArrowRight className="w-3.5 h-3.5 text-gold-text" />
                      <span className="text-xs font-bold text-gold-text bg-gold-light border border-gold-border px-2 py-0.5 rounded-full">
                        {sim.multiplier}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{sim.includesFull}</p>
                  </div>

                  <div className="text-right">
                    <div className={`text-lg font-bold ${sim.highlight ? "gradient-gold-text" : "text-foreground"}`}>
                      {sim.revenue}
                    </div>
                  </div>
                </div>
                {sim.bonus && (
                  <div className="flex items-center gap-1.5 px-4 pb-3">
                    <Gift className="w-3.5 h-3.5 text-gold-text flex-shrink-0" />
                    <span className="text-xs font-medium text-gold-text">{sim.bonus}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs sm:text-sm text-muted-foreground mt-4">
          * Simulação com base nos preços sugeridos de revenda. Resultados podem variar conforme praça e estratégia de venda.
        </p>

        <div className="text-center mt-8">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white min-h-[52px]"
          >
            Acessar Preços de Atacado
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProfitSimulator;
