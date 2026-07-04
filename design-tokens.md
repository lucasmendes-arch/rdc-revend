# Design Tokens — Rei dos Cachos B2B

> Referência completa do design system do projeto `rdc-revend`.  
> Fonte de verdade: `tailwind.config.ts` + `src/index.css`.  
> Use este arquivo para replicar a identidade visual em outros projetos.

---

## 1. Cores

O sistema usa variáveis CSS (HSL) mapeadas no Tailwind. Abaixo estão os valores literais de cada variável.

### Modo Light (`:root`)

#### Base / Semântico

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--background` | `0 0% 100%` | `#ffffff` | Fundo geral da página |
| `--foreground` | `220 14% 12%` | `#1b1f28` | Texto principal |
| `--card` | `0 0% 100%` | `#ffffff` | Fundo de cards |
| `--card-foreground` | `220 14% 12%` | `#1b1f28` | Texto dentro de cards |
| `--popover` | `0 0% 100%` | `#ffffff` | Fundo de popovers/dropdowns |
| `--popover-foreground` | `220 14% 12%` | `#1b1f28` | Texto de popovers |
| `--primary` | `220 14% 12%` | `#1b1f28` | Botão primário — charcoal escuro |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` | Texto sobre botão primário |
| `--secondary` | `40 10% 96%` | `#f5f4f2` | Fundo secundário suave (quase branco amarelado) |
| `--secondary-foreground` | `220 14% 12%` | `#1b1f28` | Texto sobre secondary |
| `--muted` | `40 20% 96%` | `#f6f4ef` | Fundo muted (off-white quente) |
| `--muted-foreground` | `220 9% 46%` | `#707480` | Texto secundário / labels |
| `--accent` | `40 20% 94%` | `#f2f0e9` | Hover backgrounds |
| `--accent-foreground` | `220 14% 12%` | `#1b1f28` | Texto sobre accent |
| `--destructive` | `0 84% 60%` | `#f04545` | Erros, ações destrutivas |
| `--destructive-foreground` | `0 0% 100%` | `#ffffff` | Texto sobre destructive |
| `--border` | `40 15% 90%` | `#e8e4dc` | Bordas padrão (quente, não cinza puro) |
| `--input` | `40 15% 90%` | `#e8e4dc` | Borda de inputs |
| `--ring` | `38 95% 48%` | `#f0940f` | Anel de foco (dourado) |

#### Gold Brand System

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--gold-start` | `38 95% 48%` | `#f0940f` | Início do gradiente dourado |
| `--gold-end` | `36 60% 40%` | `#a36a29` | Fim do gradiente dourado |
| `--gold-light` | `40 100% 96%` | `#fff8eb` | Fundo suave dourado (badges, highlights) |
| `--gold-mid` | `38 90% 55%` | `#f0a524` | Tom médio dourado (ícones, destaques) |
| `--gold-text` | `36 65% 35%` | `#926125` | Texto dourado legível |
| `--gold-border` | `38 85% 70%` | `#f4c560` | Bordas douradas |

#### Surface

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--surface` | `210 20% 98%` | `#f7f8fa` | Off-white levemente azulado |
| `--surface-alt` | `40 30% 97%` | `#f9f6f0` | Off-white levemente quente |

#### Sidebar

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--sidebar-background` | `0 0% 98%` | `#fafafa` | Fundo sidebar (light) |
| `--sidebar-foreground` | `240 5.3% 26.1%` | `#3d3d4a` | Texto sidebar |
| `--sidebar-primary` | `240 5.9% 10%` | `#191a1f` | Item primário sidebar |
| `--sidebar-primary-foreground` | `0 0% 98%` | `#fafafa` | |
| `--sidebar-accent` | `240 4.8% 95.9%` | `#f2f2f4` | Hover sidebar |
| `--sidebar-accent-foreground` | `240 5.9% 10%` | `#191a1f` | |
| `--sidebar-border` | `220 13% 91%` | `#e2e5ec` | Borda sidebar |
| `--sidebar-ring` | `217.2 91.2% 59.8%` | `#4f8ef7` | Foco sidebar |

---

### Modo Dark (`.dark`)

#### Base / Semântico

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--background` | `218 20% 8%` | `#0f1219` | Fundo geral — azul-cinza muito escuro |
| `--foreground` | `214 18% 88%` | `#d7dce6` | Texto principal |
| `--card` | `218 18% 11%` | `#161c27` | Cards — levemente mais claro que o fundo |
| `--card-foreground` | `214 18% 88%` | `#d7dce6` | |
| `--popover` | `218 17% 13%` | `#1a2030` | Dropdowns — mais elevado que card |
| `--popover-foreground` | `214 18% 88%` | `#d7dce6` | |
| `--primary` | `38 90% 58%` | `#f0a930` | Botão primário no dark = dourado |
| `--primary-foreground` | `218 20% 8%` | `#0f1219` | Texto sobre primário dark |
| `--secondary` | `218 15% 16%` | `#1f2838` | Superfície secundária |
| `--secondary-foreground` | `214 14% 72%` | `#adb5c5` | |
| `--muted` | `218 15% 16%` | `#1f2838` | |
| `--muted-foreground` | `218 10% 50%` | `#707a8a` | Texto muted no dark |
| `--accent` | `218 15% 18%` | `#222d3f` | Hover backgrounds no dark |
| `--accent-foreground` | `214 18% 88%` | `#d7dce6` | |
| `--destructive` | `0 62% 50%` | `#cc3333` | |
| `--destructive-foreground` | `0 0% 100%` | `#ffffff` | |
| `--border` | `218 14% 18%` | `#222b3a` | Bordas no dark (quase invisíveis) |
| `--input` | `218 14% 18%` | `#222b3a` | |
| `--ring` | `38 90% 58%` | `#f0a930` | Foco = dourado |

#### Gold Brand (dark)

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--gold-start` | `38 95% 52%` | `#f49e14` | |
| `--gold-end` | `36 62% 43%` | `#af7230` | |
| `--gold-light` | `38 70% 14%` | `#3d2a08` | Fundo gold em dark (bem escuro) |
| `--gold-mid` | `38 90% 58%` | `#f0a930` | |
| `--gold-text` | `38 92% 68%` | `#f5c05a` | Texto dourado legível no dark |
| `--gold-border` | `38 50% 30%` | `#735520` | Bordas douradas no dark |

#### Surface (dark)

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--surface` | `218 18% 10%` | `#131921` | |
| `--surface-alt` | `218 20% 8%` | `#0f1219` | Igual ao background no dark |

#### Sidebar (dark — sidebar do admin sempre usa dark)

| Token CSS | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--sidebar-background` | `218 18% 11%` | `#161c27` | Fundo da sidebar admin |
| `--sidebar-foreground` | `214 18% 88%` | `#d7dce6` | |
| `--sidebar-primary` | `38 90% 58%` | `#f0a930` | Item ativo = dourado |
| `--sidebar-primary-foreground` | `218 20% 8%` | `#0f1219` | |
| `--sidebar-accent` | `218 15% 16%` | `#1f2838` | Hover sidebar dark |
| `--sidebar-accent-foreground` | `214 18% 88%` | `#d7dce6` | |
| `--sidebar-border` | `218 14% 18%` | `#222b3a` | |
| `--sidebar-ring` | `38 90% 58%` | `#f0a930` | |

---

### Gradientes (variáveis CSS)

```css
--gradient-gold:       linear-gradient(135deg, hsl(38, 95%, 48%), hsl(36, 60%, 40%));
--gradient-gold-hover: linear-gradient(135deg, hsl(38, 95%, 55%), hsl(36, 65%, 45%));
--gradient-hero:       linear-gradient(135deg, hsl(0, 0%, 100%) 0%, hsl(40, 30%, 97%) 100%);
--gradient-section:    linear-gradient(180deg, hsl(40, 30%, 97%) 0%, hsl(0, 0%, 100%) 100%);
```

---

## 2. Tipografia

### Fontes

Carregadas via Google Fonts (import no topo de `src/index.css`):

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Playfair+Display:wght@500;600;700&display=swap');
```

| Fonte | Família CSS | Uso |
|---|---|---|
| **DM Sans** | `font-sans` | Fonte padrão do site inteiro — body, labels, UI |
| **Playfair Display** | `font-display` | Títulos de marca, elementos de destaque editorial |

### Configuração no Tailwind

```ts
fontFamily: {
  sans: ['DM Sans', 'system-ui', 'sans-serif'],
  display: ['Playfair Display', 'serif'],
}
```

### Pesos utilizados

| Peso | Uso típico |
|---|---|
| 300 (light) | Raramente, texto muito suave |
| 400 (regular) | Body text, parágrafos |
| 500 (medium) | Labels, navegação |
| 600 (semibold) | Subtítulos, valores de destaque |
| 700 (bold) | Títulos `h1/h2/h3`, botões principais |

Itálico: apenas DM Sans 400, para ênfase pontual.

### Escala de tamanhos (Tailwind padrão — sem customização)

| Classe | Tamanho | Uso típico no projeto |
|---|---|---|
| `text-[9px]` / `text-[10px]` | 9–10px | Micro-labels, badges de status, contadores |
| `text-[11px]` | 11px | Labels de grupo de navegação (`UPPERCASE tracking-wide`) |
| `text-xs` | 12px | Texto auxiliar, subtítulos de card, descrições |
| `text-[13px]` | 13px | Itens de navegação lateral, links secundários |
| `text-sm` | 14px | Body secundário, inputs, botões |
| `text-base` | 16px | Body principal |
| `text-lg` | 18px | Subtítulos |
| `text-xl` | 20px | |
| `text-2xl` | 24px | Títulos de seção, `CardTitle` |
| `text-3xl` | 30px | Títulos de página |
| `text-4xl` | 36px | Hero titles |

### Convenções de tipografia notáveis

- `h1`, `h2`, `h3` → `font-family: DM Sans; font-weight: 700` (via CSS global)
- Classe utilitária `.font-display` → ativa Playfair Display
- Navegação lateral usa `text-[11px] font-semibold uppercase tracking-[0.14em]` para grupos
- Labels de status usam `text-[10px] font-semibold uppercase tracking-wide`
- `-webkit-font-smoothing: antialiased` aplicado globalmente no `body`

---

## 3. Espaçamento e Layout

### Container

Definido no Tailwind:

```ts
container: {
  center: true,
  padding: "2rem",     // 32px de padding lateral
  screens: {
    "2xl": "1400px",   // max-width para breakpoint 2xl
  },
}
```

Padrão de uso nas páginas: `container mx-auto max-w-5xl` (catálogo, hero) ou `max-w-3xl` (formulários).

### Breakpoints (padrão Tailwind — sem customização)

| Breakpoint | Largura | Uso no projeto |
|---|---|---|
| `sm:` | 640px | Ajuste de texto em hero, formulários |
| `md:` | 768px | Layout flex row/col (hero), sidebar collapse |
| `lg:` | 1024px | Sidebar visível, layout de 2 colunas em admin |
| `xl:` | 1280px | Espaçamentos maiores em tabelas admin |
| `2xl:` | 1536px | Container max-width = 1400px |

### Espaçamento padrão de componentes

Valores mais usados no projeto (não estão customizados no tailwind.config, são os defaults):

- **Padding de card**: `p-6` (24px) via `CardContent` / `CardHeader`
- **Padding de admin card compacto**: `p-3 lg:px-4 lg:py-3`
- **Gap entre itens de nav**: `space-y-0.5` (2px)
- **Gap entre cards de stats**: `gap-3` a `gap-4`
- **Padding de botão padrão**: `h-10 px-4 py-2`
- **Sidebar width**: `w-60` (240px)

---

## 4. Bordas, Sombras e Raios

### Border Radius

Definido no Tailwind com base na variável `--radius: 0.625rem` (10px):

| Classe | Cálculo | Valor real |
|---|---|---|
| `rounded-sm` | `calc(var(--radius) - 4px)` | **6px** |
| `rounded-md` | `calc(var(--radius) - 2px)` | **8px** |
| `rounded-lg` | `var(--radius)` | **10px** |
| `rounded-xl` | `calc(var(--radius) + 4px)` | **14px** |
| `rounded-2xl` | `calc(var(--radius) + 8px)` | **18px** |
| `rounded-full` | nativo Tailwind | **9999px** (badges, avatares, bolinhas) |

**Uso por componente:**
- Inputs, botões: `rounded-md` (8px)
- Cards base (`Card`): `rounded-lg` (10px)
- Admin summary cards: `rounded-xl`
- Painéis hero, boxes de benefícios: `rounded-2xl`
- Badges, tags, contadores: `rounded-full`
- Sidebar logo container: `rounded-lg`

### Sombras

Definidas como variáveis CSS em `src/index.css`:

```css
/* Light mode */
--shadow-gold:      0 4px 20px -4px hsl(38 95% 48% / 0.35);
--shadow-card:      0 2px 24px -4px hsl(220 14% 12% / 0.08);
--shadow-card-hover: 0 8px 40px -8px hsl(220 14% 12% / 0.16);

/* Dark mode */
--shadow-gold:      0 4px 20px -4px hsl(38 90% 58% / 0.18);
--shadow-card:      0 2px 24px -4px hsl(218 20% 5% / 0.70);
--shadow-card-hover: 0 8px 40px -8px hsl(218 20% 5% / 0.90);
```

Classes utilitárias:
```css
.shadow-gold       { box-shadow: var(--shadow-gold); }
.shadow-card       { box-shadow: var(--shadow-card); }
.shadow-card-hover { box-shadow: var(--shadow-card-hover); }
```

Sombra hardcoded no hero de benefícios:
```css
box-shadow: 0 4px 24px rgba(217, 119, 6, 0.06);
```

`shadow-sm` do Tailwind é usado no componente `Card` base (shadcn padrão).

### Bordas

- **Cor padrão**: `hsl(var(--border))` → quente, levemente amarelada (não cinza puro)
- **Espessura padrão**: `1px` (Tailwind default via `@apply border-border` em `*`)
- **Bordas gold**: `1.5px solid hsl(var(--gold-border))`
- **Bordas da sidebar admin**: `border-white/[0.07]` (branco 7% de opacidade — quase invisível)
- **Bordas do portal (light)**: `border-gray-200`
- **Active indicator na sidebar**: faixa vertical `w-[2px] h-4` com `bg-[hsl(38,90%,58%)]` (dourado)

---

## 5. Componentes Base

### Biblioteca de componentes

**shadcn/ui** sobre **Radix UI** — todos os primitivos instalados.

Componentes Radix instalados:
`Accordion, AlertDialog, AspectRatio, Avatar, Checkbox, Collapsible, ContextMenu, Dialog, DropdownMenu, HoverCard, Label, Menubar, NavigationMenu, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Slider, Slot, Switch, Tabs, Toast, Toggle, ToggleGroup, Tooltip`

Utilitários instalados: `class-variance-authority`, `cmdk` (Command palette), `lucide-react` (ícones), `recharts` (gráficos), `sonner` (toasts), `vaul` (drawer), `tailwindcss-animate`

---

### Componente: Button (`src/components/ui/button.tsx`)

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:     "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:       "hover:bg-accent hover:text-accent-foreground",
        link:        "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-9 rounded-md px-3",
        lg:      "h-11 rounded-md px-8",
        icon:    "h-10 w-10",
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
```

---

### Componente: Card (`src/components/ui/card.tsx`)

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

---

### Componente: Input (`src/components/ui/input.tsx`)

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
```

---

## 6. Padrões de Interface

### Botões

#### Botão Primário padrão (shadcn)
- Light: `bg-primary` = charcoal `hsl(220 14% 12%)`, texto branco
- Dark: `bg-primary` = dourado `hsl(38 90% 58%)`, texto escuro
- Hover: `opacity 90%`
- Classes: `bg-primary text-primary-foreground hover:bg-primary/90`

#### Botão Gold (classe custom `.btn-gold`)
```css
background: linear-gradient(135deg, hsl(38, 95%, 48%), hsl(36, 60%, 40%));
color: white;
font-weight: 600;
letter-spacing: 0.02em;
transition: all 0.25s ease;
box-shadow: 0 4px 20px -4px hsl(38 95% 48% / 0.35);
```
Hover: gradiente levemente mais claro + `translateY(-1px)` + sombra mais intensa.

#### Botão Gold Outline (`.btn-gold-outline`)
```css
border: 1.5px solid hsl(var(--gold-border));
color: hsl(var(--gold-text));
background: transparent;
font-weight: 500;
transition: all 0.25s ease;
```
Hover: `background: hsl(var(--gold-light))` + borda gold-mid.

#### Botão Action Dark (`.btn-action`)
```css
/* Light */
background: hsl(220, 14%, 14%);
color: white;

/* Dark */
background: hsl(218, 15%, 22%);
color: hsl(214, 18%, 88%);
```

#### Botões contextuais inline (usados em hero / portal)
```
px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all text-sm
```

---

### Cards e Painéis

#### Card shadcn base
```
rounded-lg border bg-card text-card-foreground shadow-sm
```
- Padding interno: `p-6` (header e content)
- Título: `text-2xl font-semibold leading-none tracking-tight`
- Descrição: `text-sm text-muted-foreground`

#### Admin Summary Card
```
bg-card rounded-xl border border-border p-3 lg:px-4 lg:py-3 shadow-sm flex flex-col justify-between
```
- Label: `text-[10px] lg:text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`
- Value: `text-sm lg:text-base font-bold text-foreground`

#### Painel de benefícios (hero)
```
bg-white rounded-2xl p-5 border border-amber-100 shadow-[0_4px_24px_rgba(217,119,6,0.06)]
```

#### Portal sidebar (light)
```
bg-white border-r border-gray-200
```

#### Admin sidebar (sempre dark)
```
bg-[hsl(218,18%,11%)] border-r border-white/[0.07]
```

---

### Ícones

- **Biblioteca**: `lucide-react` v0.462.0
- **Tamanho padrão nos layouts**: `w-[15px] h-[15px]` (itens de navegação)
- **Tamanho em cards de stats**: `w-3.5 h-3.5 lg:w-4 lg:h-4`
- **Tamanho em botões**: `w-4 h-4` (via `[&_svg]:size-4` no Button base)
- **Tamanho em header mobile**: `w-5 h-5`
- **Cor padrão (ativo)**: `text-[hsl(38,90%,58%)]` (dourado) na admin sidebar
- **Cor padrão (inativo)**: `text-white/30` na admin sidebar / `text-gray-300` no portal
- **Cor muted-foreground**: `text-muted-foreground` em cards de stats

---

### Animações e Transições

#### Keyframes customizados (`src/index.css`)

```css
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}

@keyframes float-up {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-8px); }
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Accordion (via tailwindcss-animate) */
@keyframes accordion-down {
  from { height: 0 }
  to   { height: var(--radix-accordion-content-height) }
}
@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height) }
  to   { height: 0 }
}
```

#### Classes de animação

| Classe | Animação | Duração |
|---|---|---|
| `.animate-float` | `float-up` — flutua 8px para cima/baixo | 4s ease-in-out infinite |
| `.animate-fade-in-up` | Aparece subindo 24px | 0.6s ease-out forwards |
| `.animate-delay-100/200/300` | Delays escalonados | 0.1s / 0.2s / 0.3s |
| `animate-accordion-down` | Abre accordion | 0.2s ease-out |
| `animate-accordion-up` | Fecha accordion | 0.2s ease-out |

#### Transições padrão

- Maioria dos elementos interativos: `transition-all duration-150` ou `transition-colors`
- Botões gold: `transition: all 0.25s ease`
- Botão action: `transition: background 0.15s ease`
- Hover em botões hero: `hover:-translate-y-0.5` + `transition-all`

---

## 7. Observações Gerais

### Classes utilitárias customizadas (`src/index.css`)

| Classe | O que faz |
|---|---|
| `.font-display` | Aplica Playfair Display |
| `.text-gold` | `color: hsl(var(--gold-text))` — tom dourado legível |
| `.bg-gold-light` | Fundo dourado suave `hsl(var(--gold-light))` |
| `.border-gold` | Borda dourada `hsl(var(--gold-border))` |
| `.gradient-gold` | Background gradiente dourado |
| `.gradient-gold-text` | Texto com clip de gradiente dourado (`-webkit-background-clip: text`) |
| `.shadow-gold` | Sombra dourada suave |
| `.shadow-card` | Sombra padrão de card |
| `.shadow-card-hover` | Sombra de card no hover (mais intensa) |
| `.bg-surface` / `.bg-surface-alt` | Fundos off-white (azulado / quente) |
| `.btn-gold` | Botão gradiente dourado completo com hover |
| `.btn-gold-outline` | Botão outline dourado |
| `.btn-action` | Botão escuro (charcoal light / cinza no dark) |
| `.scrollbar-none` | Remove scrollbar (carrosséis) |
| `.scrollbar-thin` | Scrollbar fina `#cbd5e1` / hover `#94a3b8` |
| `.animate-float` | Animação de flutuar |
| `.animate-fade-in-up` | Fade + slide up |
| `.animate-delay-100/200/300` | Delays de animação |

### Coherence layer de dark mode

Em `src/index.css`, há um layer especial com seletor `.dark .bg-white`, `.dark .bg-gray-50`, etc. que remapeia classes hardcoded do Tailwind para os tokens semânticos dark, sem precisar alterar cada arquivo de página:

```css
.dark .bg-white       → hsl(var(--card))
.dark .bg-gray-50     → hsl(218 18% 13%)
.dark .bg-gray-100    → hsl(var(--muted))
.dark .border-gray-*  → hsl(var(--border))
```

### Recharts (gráficos)

- Grid lines no dark: `stroke: hsl(218, 14%, 18%)`
- Tooltip no dark: fundo `hsl(var(--popover))`, borda `hsl(var(--border))`, texto `hsl(var(--foreground))`

### Padrão de active indicator na sidebar

Ambas as sidebars (admin e portal) usam o mesmo padrão visual de item ativo: uma faixa vertical `w-[2px] h-4` posicionada `absolute left-0` com `rounded-r-full`:

```tsx
{isActive && (
  <span className="absolute left-0 inset-y-0 flex items-center">
    <span className="w-[2px] h-4 bg-amber-500 rounded-r-full" />
  </span>
)}
```

### Padrão de badge/pill de status

```
inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-100/50
```
Com bolinha animada: `w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse`

### Padrão de ícone-container em cards de benefício

```
w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0
```

### Overlay mobile

```
fixed inset-0 z-40 bg-black/60 backdrop-blur-sm
```

---

## Resumo: Personalidade Visual

O projeto tem uma estética **premium e editorial com raízes comerciais**. A paleta combina charcoal escuro (quase preto azulado) com dourado quente como cor de marca — uma dupla que remete a luxo discreto e profissionalismo. O modo light é branco com toques quentes (bordas amareladas, backgrounds off-white com tom âmbar), enquanto o modo dark usa azul-cinza profundo como fundo, mantendo o dourado como único elemento de cor saturada. A tipografia mistura DM Sans (moderna, sem serifa, muito legível) com Playfair Display (serifado editorial) para criar contraste entre o operacional e o aspiracional. Componentes são compactos e funcionais no admin, mais generosos e acolhedores no portal do cliente. A identidade não é minimalista pura — ela tem personalidade através do ouro — mas também não é exuberante: cada uso de dourado é intencional e contido.
