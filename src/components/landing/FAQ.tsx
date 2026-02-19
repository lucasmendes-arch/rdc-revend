import { useState } from "react";

const faqs = [
  {
    q: "Preciso ter CNPJ para revender?",
    a: "Não. Aceitamos tanto pessoa física (CPF) quanto jurídica (CNPJ). Basta preencher o cadastro e você já tem acesso ao catálogo.",
  },
  {
    q: "Qual é o pedido mínimo?",
    a: "O pedido mínimo é de R$ 300. A partir de R$ 600, o frete é gratuito.",
  },
  {
    q: "Como funciona a entrega?",
    a: "Enviamos para todo o Brasil via transportadora. O prazo médio é de 5 a 10 dias úteis após a confirmação do pagamento.",
  },
  {
    q: "Vou receber suporte para vender?",
    a: "Sim. Todo revendedor recebe material de marketing pronto (fotos, vídeos e scripts), além de suporte direto via WhatsApp.",
  },
  {
    q: "Posso revender online e em salão ao mesmo tempo?",
    a: "Sim. Nossos revendedores atuam em salões, redes sociais, WhatsApp e marketplaces. Você escolhe o canal.",
  },
  {
    q: "Os produtos têm registro na ANVISA?",
    a: "Sim. Toda a linha Rei dos Cachos possui registro ativo na ANVISA e laudos de dermatologia disponíveis.",
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
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
      >
        <span className="text-sm font-semibold text-foreground">{q}</span>
        <span
          className="text-xl font-light flex-shrink-0 transition-transform duration-300 text-gold-text"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          +
        </span>
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? "200px" : "0px" }}
      >
        <div className="px-5 pb-4">
          <div className="w-full h-px bg-border mb-3" />
          <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
};

const FAQ = () => {
  return (
    <section className="py-20 lg:py-28" style={{ background: "#faf8f3" }}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-gold-light mb-4"
            style={{ borderColor: "#e8d5a0" }}
          >
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              FAQ
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Dúvidas Frequentes de Quem{" "}
            <span className="gradient-gold-text">Vai Começar</span>
          </h2>
        </div>

        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {faqs.map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
