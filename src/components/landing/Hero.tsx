import { ArrowRight } from "lucide-react";
import heroModel from "@/assets/hero-model.jpg";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { useScrollToForm } from "@/hooks/useScrollToForm";

const Hero = () => {
  const scrollToForm = useScrollToForm();

  return (
    <section className="relative w-full min-h-[100svh] flex items-center justify-center overflow-hidden">
      <img
        src={heroModel}
        alt="Modelo com cachos perfeitos segurando produtos Rei dos Cachos"
        className="absolute inset-0 w-full h-full object-cover object-top"
        loading="eager"
      />

      {/* Gradient overlay - darker in center for text readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 pt-20 pb-8 sm:pt-24 sm:pb-16 flex flex-col items-center text-center">
        {/* Logo */}
        <img
          src={logo}
          alt="Rei dos Cachos"
          className="w-20 sm:w-28 mb-5 animate-fade-in-up"
          style={{
            filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.45))",
          }}
        />

        {/* Badge */}
        <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm mb-5 animate-fade-in-up">
          <span className="text-xs font-semibold text-white/90 tracking-wide uppercase">
            Programa de Revendedores
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[1.75rem] leading-tight sm:text-5xl lg:text-6xl font-bold text-white mb-4 max-w-4xl animate-fade-in-up">
          Lucro real com a{" "}
          <span className="gradient-gold-text">marca especialista</span>{" "}
          em cachos.
        </h1>

        {/* Subheadline */}
        <p className="text-base sm:text-xl text-white/85 leading-relaxed max-w-2xl mb-6 animate-fade-in-up animate-delay-100">
          Leve a linha profissional Rei dos Cachos para o seu salão ou loja.{" "}
          <strong className="text-white font-semibold">Margens de até 100%</strong> e produtos de alta recorrência.
        </p>

        {/* Social proof chips */}
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 mb-8 animate-fade-in-up animate-delay-200 w-full sm:w-auto">
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-sm text-white/90 font-medium w-full sm:w-auto justify-center">
            👥 +280 revendedores ativos
          </span>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-sm text-white/90 font-medium w-full sm:w-auto justify-center">
            📈 Margens de até 100%
          </span>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-sm text-white/90 font-medium w-full sm:w-auto justify-center">
            💬 Suporte via WhatsApp
          </span>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 animate-fade-in-up animate-delay-300 w-full sm:w-auto">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl text-base font-semibold btn-gold text-white min-h-[52px]"
          >
            Acessar Preços de Atacado
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="py-3 px-4 min-h-[44px] text-sm text-white/70 hover:text-white underline underline-offset-4 transition-colors"
          >
            Ver como funciona
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
