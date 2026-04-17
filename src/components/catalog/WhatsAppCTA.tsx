import { MessageCircle } from "lucide-react";

export default function WhatsAppCTA() {
  const phoneNumber = "5527996865366";
  const message = encodeURIComponent("Olá! Quero montar meu primeiro pedido no atacado e preciso de ajuda.");
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <div className="w-full bg-[#E8F5E9] border border-[#C8E6C9] rounded-2xl p-5 sm:p-6 mb-8 mt-4 md:mt-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-green-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -left-10 -top-10 w-32 h-32 bg-green-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="flex-1 text-center md:text-left relative z-10">
        <h3 className="text-lg sm:text-xl font-black text-green-900 mb-2 flex flex-col md:flex-row items-center gap-2 justify-center md:justify-start">
          <MessageCircle className="w-6 h-6 text-green-600 hidden md:inline-block" />
          Precisa de ajuda para montar seu pedido?
        </h3>
        <p className="text-sm sm:text-base text-green-800/80 leading-relaxed max-w-2xl">
          Nossa equipe pode indicar o melhor kit para começar, explicar o pedido mínimo e tirar dúvidas completas sobre formas de pagamento e opções de entrega.
        </p>
      </div>

      <div className="shrink-0 relative z-10 w-full md:w-auto">
        <a 
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full md:w-auto px-6 py-3.5 rounded-xl bg-[#25D366] hover:bg-[#20BE5A] text-white font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all text-sm flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" /> Falar com consultor
        </a>
      </div>
    </div>
  );
}
