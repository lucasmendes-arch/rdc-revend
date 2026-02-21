import { useEffect, useRef, useState } from "react";
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

const TestimonialCard = ({
  t,
  idx,
  cardRef
}: {
  t: typeof testimonials[0];
  idx: number;
  cardRef: (el: HTMLDivElement | null) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      ref={cardRef}
      className="w-full max-w-full sm:min-w-0 snap-center bg-white rounded-2xl p-4 sm:p-6 border border-border flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden"
      style={{
        opacity: 0,
        transform: "translateY(20px)",
        transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms`,
        boxShadow: "var(--shadow-card)",
        boxSizing: "border-box",
      }}
    >
      {/* Quote icon - reduced */}
      <Quote className="w-4 h-4 text-gold-border mb-2" />

      {/* Testimonial text - compact */}
      <p
        className={`text-sm sm:text-base text-foreground font-medium mb-2 flex-shrink-0 ${
          !expanded ? "line-clamp-2" : ""
        }`}
        style={{ lineHeight: "1.4" }}
      >
        "{t.text}"
      </p>

      {/* See more/less button - hit area 44px */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="py-2 px-1 text-xs text-gold-text font-semibold hover:text-gold mb-2 text-left min-h-[44px] flex items-center"
      >
        {expanded ? "← Ver menos" : "Ver mais →"}
      </button>

      {/* Highlight badge - compact chip */}
      <div className="bg-gold-light rounded-full px-2.5 py-1 mb-2 self-start max-w-full overflow-hidden">
        <span className="text-xs sm:text-sm font-bold text-gold-text truncate block">✨ {t.highlight}</span>
      </div>

      {/* Author block - single line info */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <div className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center flex-shrink-0 shadow-gold">
          <span className="text-xs font-bold text-white">{t.avatar}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs sm:text-sm font-bold text-foreground truncate">{t.name}</div>
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
            {Array(t.stars).fill(0).map((_, i) => (
              <Star key={i} className="w-3 h-3 text-gold fill-gold flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

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
    <section className="py-14 sm:py-20 lg:py-28 overflow-hidden" style={{ background: "#faf8f3" }}>
      <div className="container mx-auto px-4 w-full max-w-full" style={{ boxSizing: "border-box" }}>
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

        {/* Mobile: full-width cards | Desktop: grid */}
        <div className="flex sm:grid sm:grid-cols-3 gap-3 sm:gap-6 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-4 sm:pb-0 mb-6 sm:mb-10 w-full max-w-full overflow-hidden sm:overflow-visible"
             style={{ boxSizing: "border-box" }}>
          {testimonials.map((t, idx) => (
            <TestimonialCard
              key={idx}
              t={t}
              idx={idx}
              cardRef={(el) => (cardRefs.current[idx] = el)}
            />
          ))}
        </div>

        <div className="text-center mt-4 sm:mt-0">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white min-h-[52px]"
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
