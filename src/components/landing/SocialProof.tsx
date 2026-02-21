import { useEffect, useRef } from "react";
import { Star, Quote, ArrowRight } from "lucide-react";

const testimonials = [
  {
    name: "Juliana Ferreira",
    role: "Studio Cachos & Afins",
    location: "São Paulo, SP",
    avatar: "JF",
    stars: 5,
    text: "Depois que comecei a revender, meu faturamento no salão aumentou 40% em 3 meses.",
    highlight: "+40% em 3 meses",
  },
  {
    name: "Camila Oliveira",
    role: "Revendedora Autônoma",
    location: "Belo Horizonte, MG",
    avatar: "CO",
    stars: 5,
    text: "Comecei com R$ 500. No segundo mês já pedia R$ 2.000. O material de marketing é incrível.",
    highlight: "R$ 500 → R$ 2.000/mês",
  },
  {
    name: "Patricia Souza",
    role: "Bela Curl Store",
    location: "Rio de Janeiro, RJ",
    avatar: "PS",
    stars: 5,
    text: "Suporte diferenciado. Mando mensagem no WhatsApp e me respondem na hora.",
    highlight: "Suporte na hora",
  },
];

const SocialProof = () => {
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
      { threshold: 0.1 }
    );
    cardRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  const scrollToForm = () => {
    const form = document.getElementById("cadastro");
    if (form) {
      form.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        form.querySelector<HTMLInputElement>('input[name="nome"]')?.focus();
      }, 600);
    }
  };

  return (
    <section className="py-14 sm:py-20 lg:py-28" style={{ background: "#faf8f3" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <Star className="w-3.5 h-3.5 text-gold-text fill-gold-text" />
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Depoimentos Reais
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Quem já revende{" "}
            <span className="gradient-gold-text">não para mais</span>
          </h2>
        </div>

        {/* Mobile: horizontal scroll | Desktop: grid */}
        <div className="flex sm:grid sm:grid-cols-3 gap-4 sm:gap-6 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 mb-10">
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              ref={(el) => (cardRefs.current[idx] = el)}
              className="min-w-[280px] sm:min-w-0 snap-center bg-white rounded-2xl p-6 border border-border flex flex-col flex-shrink-0"
              style={{
                opacity: 0,
                transform: "translateY(20px)",
                transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms`,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <Quote className="w-7 h-7 text-gold-border mb-3" />

              <div className="flex gap-0.5 mb-3">
                {Array(t.stars).fill(0).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                ))}
              </div>

              <p className="text-sm text-foreground leading-relaxed mb-4 flex-1">"{t.text}"</p>

              <div className="bg-gold-light rounded-lg px-3 py-1.5 mb-4">
                <span className="text-xs font-bold text-gold-text">✨ {t.highlight}</span>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-border">
                <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center flex-shrink-0 shadow-gold">
                  <span className="text-sm font-bold text-white">{t.avatar}</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role} · {t.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white min-h-[48px]"
          >
            Quero começar
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
