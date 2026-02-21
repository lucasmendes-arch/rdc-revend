import { useEffect, useRef } from "react";
import { UserPlus, Tag, Megaphone, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    step: "1",
    title: "Cadastre-se em 1 minuto",
    description: "Preencha o formulário e acesse o catálogo com preços de atacado.",
  },
  {
    icon: Tag,
    step: "2",
    title: "Acesse preços e pacotes",
    description: "Veja os preços exclusivos, pacotes prontos e condições de frete.",
  },
  {
    icon: Megaphone,
    step: "3",
    title: "Venda com suporte e materiais",
    description: "Receba fotos, vídeos, scripts de vendas e suporte via WhatsApp.",
  },
];

const HowItWorks = () => {
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
    <section id="como-funciona" className="py-14 sm:py-20 lg:py-28" style={{ background: "#ffffff" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Como funciona
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Comece a revender em{" "}
            <span className="gradient-gold-text">3 passos</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-3xl mx-auto mb-10">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                ref={(el) => (cardRefs.current[idx] = el)}
                className="bg-white rounded-2xl p-6 border border-border text-center"
                style={{
                  opacity: 0,
                  transform: "translateY(20px)",
                  transition: `opacity 0.5s ease ${idx * 100}ms, transform 0.5s ease ${idx * 100}ms`,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center shadow-gold mx-auto mb-4">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-xs font-bold text-gold-text uppercase tracking-wider mb-2">
                  Passo {s.step}
                </div>
                <h3 className="text-base font-bold text-foreground mb-1.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white min-h-[48px]"
          >
            Quero acessar os preços
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
