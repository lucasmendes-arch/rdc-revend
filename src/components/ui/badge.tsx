import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge / pill de status.
 *
 * As variantes semânticas (success/warning/danger/info/neutral) são o
 * vocabulário FECHADO de status do sistema. Antes cada tela inventava o seu
 * (`bg-purple-100 text-purple-700`, `bg-teal-100 text-teal-700`...), o que
 * gerava oito cores para um funil de oito etapas e destruía a hierarquia:
 * quando tudo é colorido, nada chama atenção.
 *
 * Para status de pedido, usar o mapa em `src/lib/design/orderStatus.ts` em vez
 * de escolher a variante na mão — assim o mesmo status tem a mesma cor em
 * qualquer tela.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 tracking-snug transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Estado sem carga semântica: em progresso, rascunho, "nada a fazer".
        neutral: "border-border bg-muted text-ink-600",
        // Terminal positivo: pago, entregue, aprovado.
        success: "border-success-border bg-success-subtle text-success",
        // Requer ação de alguém: aguardando pagamento, documento pendente.
        warning: "border-warning-border bg-warning-subtle text-warning",
        // Terminal negativo: cancelado, recusado, erro.
        danger: "border-danger-border bg-danger-subtle text-danger",
        // Em trânsito / informativo: enviado, em análise.
        info: "border-info-border bg-info-subtle text-info",
        // Marca. Reservado para "Parceiro", "Novo" — não para status.
        brand: "border-brand-border bg-brand-subtle text-brand-strong",
        // Ênfase máxima, fundo sólido. Usar com parcimônia.
        solid: "border-transparent bg-primary text-primary-foreground",
        outline: "border-border bg-transparent text-foreground",

        // Aliases shadcn preservados para chamadas existentes.
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-muted text-ink-600",
        destructive: "border-danger-border bg-danger-subtle text-danger",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Mostra uma bolinha à esquerda, herdando a cor do texto da variante. */
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
