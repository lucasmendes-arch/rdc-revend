import type { Config } from "tailwindcss";

/**
 * Rei dos Cachos — configuração do design system.
 *
 * Regra: NADA de cor literal aqui. Todo valor aponta para uma variável CSS
 * definida em `src/index.css`, que é a única fonte de verdade. É isso que faz
 * o dark mode funcionar sem duplicar a escala inteira.
 *
 * A escala `gray/slate/zinc` padrão do Tailwind é mantida de propósito: ainda
 * há ~200 usos legados nas páginas admin, e a rampa `ink` nova foi calibrada
 * para ser fria-neutra justamente para conviver com eles sem destoar.
 */
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        // Playfair sobrevive apenas para o /lookbook (peça editorial impressa).
        display: ["Playfair Display", "serif"],
      },

      // Tracking negativo é o que dá o aperto tipográfico das referências.
      // `tighter`/`tight` foram puxados para baixo em relação ao default.
      letterSpacing: {
        tighter: "-0.03em",
        tight: "-0.02em",
        snug: "-0.01em",
        normal: "0",
        eyebrow: "0.08em",
      },

      colors: {
        // ── Rampa de neutro do sistema ──────────────────────────────────
        ink: {
          0: "hsl(var(--ink-0))",
          25: "hsl(var(--ink-25))",
          50: "hsl(var(--ink-50))",
          100: "hsl(var(--ink-100))",
          200: "hsl(var(--ink-200))",
          300: "hsl(var(--ink-300))",
          400: "hsl(var(--ink-400))",
          500: "hsl(var(--ink-500))",
          600: "hsl(var(--ink-600))",
          700: "hsl(var(--ink-700))",
          800: "hsl(var(--ink-800))",
          900: "hsl(var(--ink-900))",
          950: "hsl(var(--ink-950))",
        },

        // ── Semântico base ──────────────────────────────────────────────
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          alt: "hsl(var(--surface-alt))",
        },

        // ── Marca ────────────────────────────────────────────────────────
        // `brand` é o nome novo. `gold` é o nome legado (~170 usos:
        // text-gold-text, ring-gold, bg-gold, border-gold-border) e aponta
        // para exatamente os mesmos tokens — não é uma segunda paleta.
        brand: {
          DEFAULT: "hsl(var(--brand))",
          strong: "hsl(var(--brand-strong))",
          solid: "hsl(var(--brand-solid))",
          subtle: "hsl(var(--brand-subtle))",
          border: "hsl(var(--brand-border))",
          foreground: "hsl(var(--brand-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--brand))",
          start: "hsl(var(--brand))",
          end: "hsl(var(--brand-strong))",
          mid: "hsl(var(--brand-solid))",
          light: "hsl(var(--brand-subtle))",
          text: "hsl(var(--brand-strong))",
          border: "hsl(var(--brand-border))",
        },

        // ── Set semântico fechado ────────────────────────────────────────
        // Todo status do sistema escolhe UMA destas quatro famílias.
        success: {
          DEFAULT: "hsl(var(--success))",
          solid: "hsl(var(--success-solid))",
          subtle: "hsl(var(--success-subtle))",
          border: "hsl(var(--success-border))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          solid: "hsl(var(--warning-solid))",
          subtle: "hsl(var(--warning-subtle))",
          border: "hsl(var(--warning-border))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          solid: "hsl(var(--danger-solid))",
          subtle: "hsl(var(--danger-subtle))",
          border: "hsl(var(--danger-border))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          solid: "hsl(var(--info-solid))",
          subtle: "hsl(var(--info-subtle))",
          border: "hsl(var(--info-border))",
        },

        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      // --radius = 8px → sm 4 / md 6 / lg 8 / xl 12 / 2xl 16.
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },

      // Elevação curta e neutra. `shadow-sm` do Tailwind é redefinido para o
      // token do sistema porque o Card do shadcn já o usa por padrão.
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-xs)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-sm)",
        lg: "var(--shadow-md)",
        xl: "var(--shadow-lg)",
        "2xl": "var(--shadow-lg)",
        none: "none",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
        "accordion-up": "accordion-up 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
