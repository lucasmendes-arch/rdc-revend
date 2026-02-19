import { useEffect, useRef } from "react";
import { Calculator, ArrowRight, Gift } from "lucide-react";

const simulations = [
  {
    package: "Pacote 1 — Iniciante",
    invest: "R$ 497,99",
    includes: "Seleção dos itens com maior giro de vendas + E-book Guia de Vendas para Revendedores",
    revenue: "R$ 1.050",
    multiplier: "→ 2.1x",
    bonus: null,
    highlight: false,
    badge: null,
  },
  {
    package: "Pacote 2 — Crescimento",
    invest: "R$ 1.497,99",
    includes: "Itens de maior giro + variedades da linha + E-book + Videoaula exclusiva (2h) de técnicas de venda",
    revenue: "R$ 3.200",
    multiplier: "→ 2.1x",
    bonus: null,
    highlight: false,
    badge: null,
  },
  {
    package: "Pacote 3 — Pro",
    invest: "R$ 2.997,99",
    includes: "Itens de maior giro e maior margem + tudo do Pacote 2 + 🚚 Frete Grátis",
    revenue: "R$ 6.500",
    multiplier: "→ 2.2x",
    bonus: "🎁 + Frete Grátis incluso",
    highlight: true,
    badge: "⭐ Mais Popular",
  },
  {
    package: "Pacote 4 — Elite",
    invest: "R$ 4.997,99",
    includes: "Tudo do Pacote 3 + Kit Expositor Personalizado para PDV (display físico com a identidade visual Rei dos Cachos para montar no seu salão ou loja)",
    revenue: "R$ 10.500",
    multiplier: "→ 2.1x",
    bonus: "🎁 + Expositor Personalizado para seu PDV",
    highlight: false,
    badge: "👑 Exclusivo",
  },
];

const ProfitSimulator = () => {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    rowRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  const scrollToForm = () => {
    document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-20 lg:py-28" style={{ background: "#faf8f3" }}>
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <Calculator className="w-3.5 h-3.5 text-gold-text" />
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Simulador de Lucro
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Veja Quanto Você{" "}
            <span className="gradient-gold-text">Pode Faturar</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Com margens reais de até 130%, cada real investido vira dois. Escolha seu pacote:
          </p>
        </div>

        {/* Simulation Table */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-card">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-0 bg-foreground text-primary-foreground px-4 py-4">
              <div className="text-sm font-semibold opacity-70">Pacote</div>
              <div className="text-sm font-semibold opacity-70 text-center">Você Investe</div>
              <div className="text-sm font-semibold opacity-70 text-center hidden sm:block">O que inclui</div>
              <div className="text-sm font-semibold opacity-70 text-right">Você Fatura</div>
            </div>

            {/* Rows */}
            {simulations.map((sim, idx) => (
              <div
                key={idx}
                ref={(el) => (rowRefs.current[idx] = el)}
                className={`border-b border-border last:border-b-0 ${
                  sim.highlight
                    ? "bg-gold-light border-l-4 border-l-gold"
                    : "hover:bg-surface-alt"
                }`}
                style={{
                  opacity: 0,
                  transform: "translateY(20px)",
                  transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms`,
                }}
              >
                <div className="grid grid-cols-4 items-start px-4 py-4 gap-2">
                  {/* Package name + badge */}
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground text-sm leading-tight">{sim.package}</span>
                    {sim.badge && (
                      <span className={`inline-flex self-start text-xs font-bold px-2 py-0.5 rounded-full ${
                        sim.highlight
                          ? "gradient-gold text-white"
                          : "bg-foreground text-primary-foreground"
                      }`}>
                        {sim.badge}
                      </span>
                    )}
                  </div>

                  {/* Invest + multiplier */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-semibold text-foreground text-sm">{sim.invest}</span>
                    <div className="flex items-center gap-1">
                      <ArrowRight className="w-3.5 h-3.5 text-gold-text" />
                      <span className="text-xs font-bold text-gold-text bg-gold-light border border-gold-border px-2 py-0.5 rounded-full">
                        {sim.multiplier.replace("→ ", "")}
                      </span>
                    </div>
                  </div>

                  {/* Includes */}
                  <div className="hidden sm:block">
                    <p className="text-xs text-muted-foreground leading-relaxed">{sim.includes}</p>
                  </div>

                  {/* Revenue */}
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

          {/* Disclaimer */}
          <p className="text-center text-xs text-muted-foreground mt-4">
            * Simulação com base nos preços sugeridos de revenda. Resultados podem variar conforme praça e estratégia de venda.
          </p>

          {/* CTA */}
          <div className="text-center mt-8">
            <button
              onClick={scrollToForm}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white"
            >
              Começar Agora
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfitSimulator;
