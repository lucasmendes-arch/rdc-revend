import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useScrollToForm } from "@/hooks/useScrollToForm";

const faqs = [
  {
    q: "Preciso ter CNPJ para revender?",
    a: "Não. Aceitamos CPF e CNPJ. Basta preencher o cadastro para acessar o catálogo.",
  },
  {
    q: "Qual é o pedido mínimo?",
    a: "O pedido mínimo é de R$ 500. Frete grátis acima de R$ 3.000.",
  },
  {
    q: "Como funciona a entrega?",
    a: "Enviamos para todo o Brasil via transportadora. Prazo médio de 5 a 10 dias úteis.",
  },
  {
    q: "Vou receber suporte para vender?",
    a: "Sim. Você recebe fotos, vídeos, scripts de vendas e suporte direto via WhatsApp.",
  },
  {
    q: "Posso revender online e em salão ao mesmo tempo?",
    a: "Sim. Nossos revendedores atuam em salões, redes sociais, WhatsApp e marketplaces.",
  },
  {
    q: "Os produtos têm registro na ANVISA?",
    a: "Sim. Toda a linha possui registro ativo na ANVISA e laudos de dermatologia.",
  },
];

const FAQItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden transition-all duration-300"
      style={{ borderColor: "#e8d5a0" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 text-left gap-4 min-h-[52px]"
      >
        <span className="text-base font-semibold text-foreground">{q}</span>
        <span
          className="text-xl font-light flex-shrink-0 transition-transform duration-300 text-gold-text w-6 h-6 flex items-center justify-center"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          +
        </span>
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? "200px" : "0px" }}
      >
        <div className="px-4 sm:px-5 pb-4">
          <div className="w-full h-px bg-border mb-3" />
          <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
};

const FAQ = () => {
  const scrollToForm = useScrollToForm();

  return (
    <section className="py-14 sm:py-20 lg:py-28" style={{ background: "#faf8f3" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-gold-light mb-4"
            style={{ borderColor: "#e8d5a0" }}
          >
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              FAQ
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Dúvidas Frequentes de Quem{" "}
            <span className="gradient-gold-text">Vai Começar</span>
          </h2>
        </div>

        <div className="max-w-3xl mx-auto flex flex-col gap-3 mb-10">
          {faqs.map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white min-h-[52px]"
          >
            Acessar preços agora
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
