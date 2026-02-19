import { useEffect, useRef } from "react";
import { TrendingUp, Heart, Megaphone } from "lucide-react";

const reasons = [
  {
    icon: TrendingUp,
    title: "Alta Demanda",
    subtitle: "Mercado em expansão constante",
    description:
      "O Brasil é o país dos cachos. 70% das mulheres têm cabelos ondulados ou crespos e buscam produtos especializados.",
    stat: "70%",
    statLabel: "das brasileiras",
  },
  {
    icon: Heart,
    title: "Receita Recorrente",
    subtitle: "Sua cliente volta todo mês",
    description:
      "Produtos de uso diário que acabam rápido. Quem começa a usar compra de novo — e você fatura todo mês sem precisar conquistar cliente novo.",
    stat: "+85%",
    statLabel: "de recompra",
  },
  {
    icon: Megaphone,
    title: "Suporte Completo",
    subtitle: "Você vende, nós apoiamos",
    description:
      "Material de marketing exclusivo pronto para postar nas redes sociais. Fotos, vídeos e scripts de vendas inclusos.",
    stat: "100%",
    statLabel: "suporte gratuito",
  },
];

const WhyCurls = () => {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

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
      { threshold: 0.15 }
    );
    cardRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 lg:py-28" style={{ background: "#ffffff" }}>
      <div className="container mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Por que escolher a marca?
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Por que apostar no{" "}
            <span className="gradient-gold-text">Rei dos Cachos?</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Dados reais que comprovam o potencial de negócio da linha profissional.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {reasons.map((reason, idx) => {
            const Icon = reason.icon;
            return (
              <div
                key={idx}
                ref={(el) => (cardRefs.current[idx] = el)}
                className="group bg-white rounded-2xl p-7 border border-border hover:border-gold-border"
                style={{
                  opacity: 0,
                  transform: "translateY(20px)",
                  transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms, box-shadow 0.3s ease`,
                  boxShadow: "var(--shadow-card)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card)";
                }}
              >
                {/* Icon */}
                <div className="mb-5">
                  <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center shadow-gold mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold gradient-gold-text">{reason.stat}</span>
                    <span className="text-sm text-muted-foreground mb-1">{reason.statLabel}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="w-12 h-0.5 gradient-gold rounded-full mb-4" />

                {/* Content */}
                <h3 className="text-lg font-bold text-foreground mb-1">{reason.title}</h3>
                <p className="text-sm font-medium text-gold-text mb-2">{reason.subtitle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{reason.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default WhyCurls;
