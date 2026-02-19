import { ArrowRight } from "lucide-react";
import heroModel from "@/assets/hero-model.jpg";
import logo from "@/assets/logo-rei-dos-cachos.png";

const Hero = () => {
  const scrollToForm = () => {
    document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
      {/* Full-width background image */}
      <img
        src={heroModel}
        alt="Modelo com cachos perfeitos segurando produtos Rei dos Cachos"
        className="absolute inset-0 w-full h-full object-cover object-top"
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/45 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 pt-24 pb-16 flex flex-col items-center text-center">
        {/* Logo inside hero */}
        <img
          src={logo}
          alt="Rei dos Cachos"
          className="mb-6 animate-fade-in-up"
          style={{
            width: 120,
            filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.45))",
          }}
        />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm mb-6 animate-fade-in-up">
          <span className="text-xs font-semibold text-white/90 tracking-wide uppercase">
            Programa de Revendedores
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] text-white mb-5 max-w-4xl animate-fade-in-up">
          Lucro Real com a{" "}
          <span className="gradient-gold-text">Marca Especialista</span>{" "}
          em Cachos.
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-white/85 leading-relaxed max-w-2xl mb-8 animate-fade-in-up animate-delay-100">
          Leve a linha profissional Rei dos Cachos para o seu salão ou loja.{" "}
          <strong className="text-white font-semibold">Margens de até 100%</strong> e produtos de alta recorrência.
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-10 animate-fade-in-up animate-delay-200">
          <div className="flex flex-col items-center">
            <span className="text-2xl sm:text-3xl font-bold gradient-gold-text">+280</span>
            <span className="text-xs text-white/70 mt-0.5">Revendedores Ativos</span>
          </div>
          <div className="w-px h-10 bg-white/20 hidden sm:block self-center" />
          <div className="flex flex-col items-center">
            <span className="text-2xl sm:text-3xl font-bold gradient-gold-text">100%</span>
            <span className="text-xs text-white/70 mt-0.5">Margem de Lucro</span>
          </div>
          <div className="w-px h-10 bg-white/20 hidden sm:block self-center" />
          <div className="flex flex-col items-center">
            <span className="text-2xl sm:text-3xl font-bold gradient-gold-text">4.9★</span>
            <span className="text-xs text-white/70 mt-0.5">Avaliação Média</span>
          </div>
        </div>

        {/* Info badges */}
        <div className="flex flex-wrap justify-center gap-3 mb-8 animate-fade-in-up animate-delay-200">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-xs text-white/85 font-medium">
            🛒 Compra Mínima R$ 500
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-xs text-white/85 font-medium">
            🚚 Frete Grátis acima de R$ 3.000
          </span>
        </div>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-3 animate-fade-in-up animate-delay-300">
          <button
            onClick={scrollToForm}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl text-base font-semibold btn-gold text-white text-lg"
          >
            Quero Revender Agora
            <ArrowRight className="w-5 h-5" />
          </button>
          <a
            href="/catalogo"
            className="text-sm text-white/75 hover:text-white underline underline-offset-4 transition-colors"
          >
            Ver Catálogo
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
