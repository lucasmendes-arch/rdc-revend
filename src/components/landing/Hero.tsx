import { ArrowRight, ShoppingBag, Truck, Star } from "lucide-react";
import heroModel from "@/assets/hero-model.jpg";

const Hero = () => {
  const scrollToForm = () => {
    document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen bg-white pt-16 overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(40,30%,97%)_0%,_transparent_60%)] pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-surface-alt/40 clip-hero pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 min-h-[calc(100vh-4rem)] flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center py-12 lg:py-16 w-full">
          {/* Left: Content */}
          <div className="flex flex-col gap-6 animate-fade-in-up">
            {/* Pre-headline badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gold-border bg-gold-light w-fit">
              <Star className="w-3.5 h-3.5 text-gold-text fill-gold-text" />
              <span className="text-xs font-semibold text-gold-text tracking-wide uppercase">
                Programa de Revendedores
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.1] text-foreground">
              Lucro Real com a{" "}
              <span className="gradient-gold-text">Marca Especialista</span>{" "}
              em Cachos.
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
              Leve a linha profissional Rei dos Cachos para o seu salão ou loja.{" "}
              <strong className="text-foreground font-semibold">Margens de até 100%</strong> e produtos de alta recorrência.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={scrollToForm}
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl text-base font-semibold btn-gold text-white"
              >
                Ver Tabela de Preços
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="/loja.html"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-medium border-2 border-border hover:border-gold-border hover:bg-surface-alt transition-all"
              >
                <ShoppingBag className="w-4 h-4" />
                Ver Catálogo
              </a>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap gap-3 pt-2">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-alt border border-border">
                <ShoppingBag className="w-4 h-4 text-gold-text" />
                <span className="text-xs font-semibold text-foreground">Compra Mínima R$ 300</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-alt border border-border">
                <Truck className="w-4 h-4 text-gold-text" />
                <span className="text-xs font-semibold text-foreground">Frete Grátis acima de R$ 600</span>
              </div>
            </div>
          </div>

          {/* Right: Hero Image */}
          <div className="relative animate-fade-in-up animate-delay-200 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-lg lg:max-w-none">
              {/* Decorative gold ring */}
              <div className="absolute -inset-4 rounded-3xl border border-gold-border/40 pointer-events-none" />
              <div className="absolute -inset-8 rounded-3xl border border-gold-border/20 pointer-events-none" />

              {/* Image */}
              <div className="relative rounded-3xl overflow-hidden shadow-card-hover bg-surface-alt aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                <img
                  src={heroModel}
                  alt="Modelo com cachos perfeitos segurando produtos Rei dos Cachos"
                  className="w-full h-full object-cover object-top"
                />
                {/* Gradient overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-foreground/30 to-transparent" />

                {/* Floating stat card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-card animate-float">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-2xl font-bold gradient-gold-text">+2.800</div>
                      <div className="text-xs text-muted-foreground">Revendedores Ativos</div>
                    </div>
                    <div className="w-px h-10 bg-border" />
                    <div className="flex-1">
                      <div className="text-2xl font-bold gradient-gold-text">100%</div>
                      <div className="text-xs text-muted-foreground">Margem de Lucro</div>
                    </div>
                    <div className="w-px h-10 bg-border" />
                    <div className="flex-1">
                      <div className="text-2xl font-bold gradient-gold-text">4.9★</div>
                      <div className="text-xs text-muted-foreground">Avaliação Média</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
