import { useEffect, useRef } from "react";
import { Calculator, ArrowRight, Gift } from "lucide-react";

const simulations = [
  {
    invest: "R$ 300",
    revenue: "R$ 620",
    multiplier: "2x",
    bonus: null,
    highlight: false,
  },
  {
    invest: "R$ 500",
    revenue: "R$ 1.050",
    multiplier: "2.1x",
    bonus: null,
    highlight: false,
  },
  {
    invest: "R$ 1.000",
    revenue: "R$ 2.200",
    multiplier: "2.2x",
    bonus: "🎁 + Kit de Bônus (R$ 120 em produtos grátis)",
    highlight: true,
  },
  {
    invest: "R$ 2.000",
    revenue: "R$ 4.600",
    multiplier: "2.3x",
    bonus: "🎁 + Kit Premium Grátis + Frete",
    highlight: false,
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
            Com margens reais de até 130%, cada real investido vira dois. Veja a simulação:
          </p>
        </div>

        {/* Simulation Table */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-card">
            {/* Table Header */}
            <div className="grid grid-cols-3 gap-0 bg-foreground text-primary-foreground px-6 py-4">
              <div className="text-sm font-semibold opacity-70">Você Investe</div>
              <div className="text-sm font-semibold opacity-70 text-center">Multiplica</div>
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
                <div className="grid grid-cols-3 items-center px-6 py-4">
                  <div className="font-semibold text-foreground text-base">{sim.invest}</div>
                  <div className="flex justify-center">
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="w-4 h-4 text-gold-text" />
                      <span className="text-xs font-bold text-gold-text bg-gold-light border border-gold-border px-2 py-0.5 rounded-full">
                        {sim.multiplier}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${sim.highlight ? "gradient-gold-text" : "text-foreground"}`}>
                      {sim.revenue}
                    </div>
                  </div>
                </div>
                {sim.bonus && (
                  <div className="flex items-center gap-1.5 px-6 pb-3">
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
