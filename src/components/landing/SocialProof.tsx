import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Juliana Ferreira",
    role: "Proprietária — Studio Cachos & Afins",
    location: "São Paulo, SP",
    avatar: "JF",
    stars: 5,
    text: "Depois que comecei a revender Rei dos Cachos, meu faturamento no salão aumentou 40% em 3 meses. As clientes amam o ativador, compram sempre e ainda indicam amigas!",
    highlight: "faturamento +40% em 3 meses",
  },
  {
    name: "Camila Oliveira",
    role: "Revendedora Autônoma",
    location: "Belo Horizonte, MG",
    avatar: "CO",
    stars: 5,
    text: "Comecei com R$ 500 no primeiro pedido. No segundo mês já estava pedindo R$ 2.000 por mês. O material de marketing deles é incrível, não preciso criar nada.",
    highlight: "de R$ 500 para R$ 2.000/mês",
  },
  {
    name: "Patricia Souza",
    role: "Proprietária — Bela Curl Store",
    location: "Rio de Janeiro, RJ",
    avatar: "PS",
    stars: 5,
    text: "O suporte é diferenciado. Sempre que tenho dúvida mando mensagem no WhatsApp e me respondem na hora. Produto de qualidade e suporte de primeira — combinação perfeita!",
    highlight: "suporte sempre disponível",
  },
];

const SocialProof = () => {
  return (
    <section className="py-20 lg:py-28 bg-surface-alt">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <Star className="w-3.5 h-3.5 text-gold-text fill-gold-text" />
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Depoimentos Reais
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Quem já revende{" "}
            <span className="gradient-gold-text">não para mais</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Histórias reais de salões e revendedores que transformaram seu negócio.
          </p>
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 border border-border hover:border-gold-border flex flex-col"
            >
              {/* Quote Icon */}
              <div className="mb-4">
                <Quote className="w-8 h-8 text-gold-border" />
              </div>

              {/* Stars */}
              <div className="flex gap-0.5 mb-3">
                {Array(t.stars).fill(0).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                ))}
              </div>

              {/* Text */}
              <p className="text-sm text-foreground leading-relaxed mb-4 flex-1">"{t.text}"</p>

              {/* Highlight */}
              <div className="bg-gold-light rounded-lg px-3 py-1.5 mb-5">
                <span className="text-xs font-semibold text-gold-text">✨ {t.highlight}</span>
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center flex-shrink-0 shadow-gold">
                  <span className="text-sm font-bold text-white">{t.avatar}</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                  <div className="text-xs text-gold-text font-medium">{t.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
