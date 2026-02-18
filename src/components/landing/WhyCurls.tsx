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
    title: "Fidelização Total",
    subtitle: "Quem usa, não troca",
    description:
      "Nossas fórmulas garantem definição por até 3 dias. Clientes que experimentam se tornam fiéis — e indicam para amigas.",
    stat: "3 dias",
    statLabel: "de definição",
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
  return (
    <section className="py-20 lg:py-28 bg-surface-alt">
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
                className="group bg-white rounded-2xl p-7 shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 border border-border hover:border-gold-border"
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
