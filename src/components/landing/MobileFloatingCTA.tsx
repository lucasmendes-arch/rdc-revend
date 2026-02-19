import { useEffect, useState, useRef } from "react";
import { ArrowRight } from "lucide-react";

const MobileFloatingCTA = () => {
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const form = document.getElementById("cadastro");
      if (!form) {
        setShow(scrollY > 400);
        return;
      }
      const formTop = form.getBoundingClientRect().top + window.scrollY;
      setShow(scrollY > 400 && scrollY < formTop - 200);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToForm = () => {
    document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div
      className={`fixed bottom-4 left-0 right-0 z-50 flex justify-center px-4 md:hidden transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <button
        onClick={scrollToForm}
        className="w-[90%] flex items-center justify-center gap-2 py-3.5 btn-gold text-white font-semibold text-base"
        style={{ borderRadius: "12px" }}
      >
        Quero Revender
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default MobileFloatingCTA;
