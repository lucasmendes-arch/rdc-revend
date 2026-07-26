import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input de 36px (h-9), alinhado à altura do Button default.
 *
 * `text-base` no mobile é intencional e não deve virar `text-sm`: o Safari do
 * iOS dá zoom automático em campo com fonte < 16px. O `md:text-sm` devolve a
 * densidade correta no desktop.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-base text-foreground tracking-snug ring-offset-background transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-ink-400",
          "hover:border-ink-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
