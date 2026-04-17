import { Search, ShoppingCart, TrendingUp } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      id: 1,
      title: "Escolha seus produtos",
      desc: "Navegue e selecione seus kits ou produtos avulsos favoritos.",
      icon: <Search className="w-5 h-5 text-amber-600" />
    },
    {
      id: 2,
      title: "Monte seu pedido",
      desc: "Adicione quantidades de atacado ao carrinho.",
      icon: <ShoppingCart className="w-5 h-5 text-amber-600" />
    },
    {
      id: 3,
      title: "Receba e Revenda",
      desc: "Acompanhe seu potencial de retorno e aumente seus lucros.",
      icon: <TrendingUp className="w-5 h-5 text-amber-600" />
    }
  ];

  return (
    <div className="w-full bg-white rounded-2xl border border-amber-100 shadow-sm p-5 sm:p-6 mb-8 mt-4">
      <h2 className="text-xl sm:text-2xl font-black text-amber-950 mb-4 sm:mb-6 text-center">
        Como funciona
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
        {/* Connector line for desktop */}
        <div className="hidden md:block absolute top-[28px] left-[15%] right-[15%] h-[2px] bg-amber-100 -z-10" />

        {steps.map((step) => (
          <div key={step.id} className="flex flex-col items-center text-center relative bg-white">
            <div className="w-14 h-14 rounded-full bg-amber-50 border-4 border-white flex items-center justify-center mb-3 shadow-[0_2px_10px_rgba(217,119,6,0.1)] relative z-10 transition-transform hover:scale-105">
              {step.icon}
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                {step.id}
              </div>
            </div>
            <h3 className="font-bold text-foreground text-sm sm:text-base mb-1.5">{step.title}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed px-2">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
