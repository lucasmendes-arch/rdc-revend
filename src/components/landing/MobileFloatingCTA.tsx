import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useScrollToForm } from "@/hooks/useScrollToForm";

const MobileFloatingCTA = () => {
  const [show, setShow] = useState(false);
  const scrollToForm = useScrollToForm();

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const form = document.getElementById("cadastro");
      if (!form) {
        setShow(scrollY > 250);
        return;
      }
      const formRect = form.getBoundingClientRect();
      const formVisible = formRect.top < window.innerHeight && formRect.bottom > 0;
      setShow(scrollY > 250 && !formVisible);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom,8px)] pt-2 md:hidden transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <button
        onClick={scrollToForm}
        className="w-[92%] flex items-center justify-center gap-2 btn-gold text-white font-semibold text-base h-[54px] rounded-[14px]"
      >
        Acessar Preços de Atacado
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default MobileFloatingCTA;
