import { useState, useEffect } from "react";
import { Crown, LogIn } from "lucide-react";

const Header = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToForm = () => {
    document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-border" : "bg-white/80 backdrop-blur-sm"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center shadow-gold">
            <Crown className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">Rei dos Cachos</span>
            <span className="text-[10px] font-medium text-gold-text tracking-widest uppercase">Pro · Atacado</span>
          </div>
        </div>

        {/* Nav Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="/loja.html"
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium btn-gold-outline"
          >
            <LogIn className="w-3.5 h-3.5" />
            Já sou cliente
          </a>
          <button
            onClick={scrollToForm}
            className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-sm font-semibold btn-gold text-white"
          >
            <Crown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quero Revender</span>
            <span className="sm:hidden">Revender</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
