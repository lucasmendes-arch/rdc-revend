import { useEffect, useState } from "react";
import logo from "@/assets/logo-rei-dos-cachos.png";
import { useScrollToForm } from "@/hooks/useScrollToForm";

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const scrollToForm = useScrollToForm();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-border"
          : "bg-white/80 backdrop-blur-sm"
      }`}
    >
      <div className="container mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <img src={logo} alt="Rei dos Cachos" className="h-6 sm:h-10 w-auto" />
        <button
          onClick={scrollToForm}
          className="flex items-center gap-1.5 px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl text-sm font-semibold btn-gold text-white min-h-[44px]"
        >
          Quero revender
        </button>
      </div>
    </header>
  );
};

export default Header;
