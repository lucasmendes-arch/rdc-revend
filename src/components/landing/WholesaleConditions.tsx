import { ShoppingCart, Truck, Globe, MessageCircle, ArrowRight } from "lucide-react";

const conditions = [
  { icon: ShoppingCart, title: "Compra mínima", desc: "R$ 500" },
  { icon: Truck, title: "Frete grátis", desc: "Acima de R$ 3.000" },
  { icon: Globe, title: "Envio", desc: "Todo o Brasil" },
  { icon: MessageCircle, title: "Suporte", desc: "WhatsApp dedicado" },
];

const WholesaleConditions = () => {
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
    <section className="py-14 sm:py-20 lg:py-28" style={{ background: "#ffffff" }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold-border bg-gold-light mb-4">
            <span className="text-xs font-semibold text-gold-text tracking-widest uppercase">
              Condições
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-3">
            Condições do{" "}
            <span className="gradient-gold-text">Atacado</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 max-w-3xl mx-auto mb-10">
          {conditions.map(({ icon: Icon, title, desc }, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-5 border border-border text-center"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-gold mx-auto mb-3">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-sm font-bold text-foreground mb-0.5">{title}</div>
              <div className="text-sm text-gold-text font-semibold">{desc}</div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base btn-gold text-white min-h-[52px]"
          >
            Acessar preços
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default WholesaleConditions;
