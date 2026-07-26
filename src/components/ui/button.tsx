import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Hierarquia de ação do sistema:
 *
 *   default    → ink. A ação principal da tela. UMA por tela.
 *   secondary  → branco + hairline. O par natural do ink (Cancelar, Voltar).
 *   ghost      → sem superfície. Ação terciária, barra de ferramentas, ícone.
 *   destructive→ vermelho sólido. Só para exclusão confirmada.
 *   brand      → dourado. Uso raro e deliberado: CTA de marca no portal do
 *                parceiro. Não usar em tela operacional (admin/RH/DP).
 *   link       → navegação inline.
 *
 * Altura padrão é 36px (h-9), não 40px. Botão de 40px em tela densa de dado
 * empurra tudo e é a principal razão de um admin parecer "inflado".
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium tracking-snug ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        secondary:
          "border border-border bg-background text-foreground hover:bg-muted hover:border-ink-300",
        // `outline` é sinônimo histórico de `secondary` — mantido para não
        // quebrar chamadas existentes, mas aponta para o mesmo visual.
        outline:
          "border border-border bg-background text-foreground hover:bg-muted hover:border-ink-300",
        ghost: "text-ink-600 hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/88",
        brand: "bg-brand text-brand-foreground hover:bg-brand/88",
        link: "text-foreground underline underline-offset-4 decoration-ink-300 hover:decoration-foreground",
      },
      size: {
        xs: "h-7 rounded-sm px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-3 text-[13px]",
        default: "h-9 px-3.5",
        lg: "h-10 px-5",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
