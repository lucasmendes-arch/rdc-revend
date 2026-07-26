import { MessageCircle } from "lucide-react";

/**
 * Convite para falar com um consultor.
 *
 * Era uma caixa verde com hex hardcoded (`#E8F5E9`/`#C8E6C9`), dois blobs
 * desfocados, `font-black` e `hover:-translate-y-0.5` — e não tinha dark mode
 * nenhum, porque nenhum daqueles valores era token.
 *
 * O verde ficou só onde carrega significado: o ícone do WhatsApp e o botão,
 * que precisa do reconhecimento da marca.
 */
export default function WhatsAppCTA() {
  const phoneNumber = "5527996865366";
  const message = encodeURIComponent("Olá! Quero montar meu primeiro pedido no atacado e preciso de ajuda.");
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <div className="w-full surface-card p-5 mb-8 mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-md bg-success-subtle border border-success-border flex items-center justify-center shrink-0">
          <MessageCircle className="w-4 h-4 text-success" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-foreground leading-tight tracking-tight">
            Precisa de ajuda para montar o pedido?
          </h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed mt-1 max-w-2xl">
            A equipe indica o melhor kit para começar, explica o pedido mínimo e tira
            dúvidas sobre pagamento e entrega.
          </p>
        </div>
      </div>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 h-9 px-3.5 rounded-md btn-secondary text-[13px] flex items-center justify-center gap-1.5"
      >
        <MessageCircle className="w-3.5 h-3.5 text-success" />
        Falar com consultor
      </a>
    </div>
  );
}
